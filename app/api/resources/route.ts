import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { z } from "zod";
import {
  authenticate,
  body,
  checkDb,
  errorResponse,
  AppError,
} from "@/lib/server";
import { sourceType, validateUrl } from "@/lib/extract";
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  try {
    const { db, user } = await authenticate(req);
    const p = req.nextUrl.searchParams;
    const page = Math.max(0, Math.min(10000, Number(p.get("page")) || 0));
    let q = db
      .from("ai_atlas_resources")
      .select(
        "id,title,source_url,source_type,category,tags,status,favorite,learned,created_at,updated_at,deleted_at,error_message,summary:lesson->>summary,visual:lesson->diagram",
        { count: "exact" },
      )
      .eq("user_id", user.id);
    const view = p.get("view");
    q =
      view === "trash"
        ? q.not("deleted_at", "is", null)
        : q.is("deleted_at", null);
    if (view === "favorites") q = q.eq("favorite", true);
    if (view === "learned") q = q.eq("learned", true);
    if (view === "inbox") q = q.neq("status", "ready");
    const category = p.get("category");
    if (category && category !== "전체") q = q.eq("category", category);
    const source = p.get("source");
    if (source && source !== "all") q = q.eq("source_type", source);
    const search = (p.get("q") || "")
      .replace(/[%_,()."\\]/g, " ")
      .trim()
      .slice(0, 150);
    if (/^(rag|llm|mcp)$/i.test(search))
      // Keep Korean suffixes (RAG는) while excluding fragments such as paragraph.
      q = q.filter(
        "search_text",
        "imatch",
        `(^|[^a-z0-9])${search}([^a-z0-9]|$)`,
      );
    else if (search) q = q.ilike("search_text", `%${search}%`);
    const sort = p.get("sort");
    q = q
      .order(sort === "title" ? "title" : "created_at", {
        ascending: sort === "title" || sort === "old",
      })
      .order("id")
      .range(page * 24, page * 24 + 23);
    const { data, error, count } = await q;
    checkDb(error);
    return NextResponse.json(
      { resources: data, total: count },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
const input = z.object({
  title: z.string().trim().max(120).default(""),
  url: z.string().trim().max(2048).default(""),
  text: z.string().trim().max(60000).default(""),
});
export async function POST(req: NextRequest) {
  try {
    const { db, user } = await authenticate(req);
    const data = input.parse(await body(req));
    if (!data.url && data.text.length < 30)
      throw new AppError(
        "본문을 30자 이상 입력하거나 원문 링크를 추가해 주세요.",
      );
    const url = data.url ? validateUrl(data.url).href : null;
    const fingerprint = createHash("sha256")
      .update(url || data.text.replace(/\s+/g, " "))
      .digest("hex");
    const { data: existing, error: existingError } = await db
      .from("ai_atlas_resources")
      .select("*")
      .eq("user_id", user.id)
      .eq("fingerprint", fingerprint)
      .is("deleted_at", null)
      .maybeSingle();
    checkDb(existingError);
    if (existing)
      return NextResponse.json({ resource: existing, duplicate: true });
    const { data: resource, error } = await db
      .from("ai_atlas_resources")
      .insert({
        user_id: user.id,
        title:
          data.title ||
          data.text.split("\n")[0].slice(0, 80) ||
          (url ? new URL(url).hostname : "새 자료"),
        source_url: url,
        source_type: sourceType(url || ""),
        raw_text: data.text,
        fingerprint,
        source_method: data.text ? "pasted" : null,
      })
      .select("*")
      .single();
    if (error?.code === "23505")
      throw new AppError(
        "이미 저장 중인 자료입니다. 잠시 후 자료함을 확인해 주세요.",
        409,
      );
    checkDb(error);
    return NextResponse.json({ resource }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
