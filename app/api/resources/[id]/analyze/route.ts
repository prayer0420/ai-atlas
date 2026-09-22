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
import { queueLocally } from "@/lib/automation";
import { withProgress } from "@/lib/resource-progress";
import { latestCards, startCards } from "@/lib/card-service";
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
        .eq("user_id", user.id)
        .is("deleted_at", null)
        .maybeSingle();
      checkDb(r.error);
      if (!r.data) throw new AppError("자료를 찾을 수 없습니다.", 404);
      const previous = await latestCards(user.id, id);
      const run = await startCards(user.id, id, previous.run?.brief || {});
      const queued = {
        queued: run.state !== "completed",
        job_id: run.queue_id,
        message: "카드뉴스 이미지 완성을 목표로 저장한 단계부터 이어갑니다.",
      };
      return NextResponse.json(
        {
          resource: (await withProgress(db, user.id, [r.data]))[0],
          ...queued,
        },
        { status: 202 },
      );
    }
    return NextResponse.json(await analyzeResource(user.id, id, true));
  } catch (e) {
    return errorResponse(e);
  }
}
