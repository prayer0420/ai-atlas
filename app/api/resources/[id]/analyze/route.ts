import { NextRequest, NextResponse } from "next/server";
import {
  authenticate,
  checkDb,
  errorResponse,
  AppError,
  ensureAIAllowed,
  uuid,
} from "@/lib/server";
import { analyzeResource } from "@/lib/analyze-resource";
import { enqueue, queueLocally } from "@/lib/automation";
export const maxDuration = 300;
export const runtime = "nodejs";
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { db, user } = await authenticate(req);
    ensureAIAllowed(user.email);
    const id = uuid.parse((await params).id);
    if (queueLocally()) {
      const r = await db
        .from("ai_atlas_resources")
        .select("*")
        .eq("id", id)
        .is("deleted_at", null)
        .maybeSingle();
      checkDb(r.error);
      if (!r.data) throw new AppError("자료를 찾을 수 없습니다.", 404);
      return NextResponse.json(
        {
          resource: r.data,
          ...(await enqueue(
            user.id,
            "analyze",
            { resourceId: id, manual: true },
            id,
          )),
        },
        { status: 202 },
      );
    }
    return NextResponse.json(await analyzeResource(user.id, id, true));
  } catch (e) {
    return errorResponse(e);
  }
}
