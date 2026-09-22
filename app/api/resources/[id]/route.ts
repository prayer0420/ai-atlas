import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createHash } from "node:crypto";
import {
  authenticate,
  body,
  checkDb,
  errorResponse,
  AppError,
  uuid,
} from "@/lib/server";
import { categorySchema } from "@/lib/types";
import { withProgress } from "@/lib/resource-progress";
type Context = { params: Promise<{ id: string }> };
export async function GET(req: NextRequest, ctx: Context) {
  try {
    const { db, user } = await authenticate(req);
    const id = uuid.parse((await ctx.params).id);
    const { data, error } = await db
      .from("ai_atlas_resources")
      .select("*")
      .eq("user_id", user.id)
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle();
    checkDb(error);
    if (!data) throw new AppError("자료를 찾을 수 없습니다.", 404);
    return NextResponse.json(
      { resource: (await withProgress(db, user.id, [data]))[0] },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
const patch = z
  .object({
    title: z.string().trim().min(1).max(120).optional(),
    favorite: z.boolean().optional(),
    learned: z.boolean().optional(),
    notes: z.string().max(20000).optional(),
    category: categorySchema.optional(),
    tags: z.array(z.string().trim().min(1).max(30)).max(8).optional(),
    raw_text: z.string().trim().min(30).max(60000).optional(),
    restore: z.boolean().optional(),
  })
  .strict();
export async function PATCH(req: NextRequest, ctx: Context) {
  try {
    const { db, user } = await authenticate(req);
    const id = uuid.parse((await ctx.params).id);
    const input = patch.parse(await body(req));
    const { data: current, error: readError } = await db
      .from("ai_atlas_resources")
      .select("*")
      .eq("user_id", user.id)
      .eq("id", id)
      .maybeSingle();
    checkDb(readError);
    if (!current) throw new AppError("자료를 찾을 수 없습니다.", 404);
    if (input.raw_text !== undefined) {
      const [progress] = await withProgress(db, user.id, [current]);
      if (progress.progress.phase === "running")
        throw new AppError("분석이 끝난 뒤 본문을 수정해 주세요.", 409);
    }
    const { restore, ...values } = input;
    const update: Record<string, unknown> = { ...values };
    if (restore) update.deleted_at = null;
    if (values.raw_text !== undefined && values.raw_text !== current.raw_text) {
      Object.assign(update, {
        status: "saved",
        lesson: null,
        error_message: null,
        source_method: "pasted",
        learned: false,
      });
      if (!current.source_url)
        update.fingerprint = createHash("sha256")
          .update(values.raw_text.replace(/\s+/g, " "))
          .digest("hex");
    }
    const { data, error } = await db
      .from("ai_atlas_resources")
      .update(update)
      .eq("user_id", user.id)
      .eq("id", id)
      .eq("updated_at", current.updated_at)
      .select("*")
      .maybeSingle();
    if (error?.code === "23505")
      throw new AppError("같은 자료가 이미 자료함에 있습니다.", 409);
    checkDb(error);
    if (!data)
      throw new AppError(
        "다른 작업에서 자료가 변경되었습니다. 다시 열고 수정해 주세요.",
        409,
      );
    return NextResponse.json({ resource: data });
  } catch (e) {
    return errorResponse(e);
  }
}
export async function DELETE(req: NextRequest, ctx: Context) {
  try {
    const { db, user } = await authenticate(req);
    const id = uuid.parse((await ctx.params).id);
    const { data, error } = await db
      .from("ai_atlas_resources")
      .update({ deleted_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .eq("id", id)
      .select("id")
      .maybeSingle();
    checkDb(error);
    if (!data) throw new AppError("자료를 찾을 수 없습니다.", 404);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
