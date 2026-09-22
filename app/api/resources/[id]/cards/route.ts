import { NextRequest, NextResponse } from "next/server";
import {
  authenticate,
  body,
  checkDb,
  errorResponse,
  uuid,
  ensureAIAllowed,
} from "@/lib/server";
import { latestCards, startCards } from "@/lib/card-service";
import { cardGraph, imagePrompt } from "@/lib/card-workflow";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
export async function GET(req: NextRequest, ctx: Context) {
  try {
    const { db, user } = await authenticate(req);
    const id = uuid.parse((await ctx.params).id);
    const { run, source, stale } = await latestCards(user.id, id);
    const versions = run
      ? await db
          .from("ai_atlas_card_runs")
          .select("id")
          .eq("user_id", user.id)
          .eq("resource_id", id)
          .order("created_at", { ascending: false })
          .limit(20)
      : { data: [], error: null };
    checkDb(versions.error);
    const events = run
      ? await db
          .from("ai_atlas_card_events")
          .select("id,node,state,code,strategy,message,created_at")
          .eq("user_id", user.id)
          .in(
            "run_id",
            (versions.data || []).map((v) => v.id),
          )
          .order("id", { ascending: false })
          .limit(100)
      : { data: [], error: null };
    checkDb(events.error);
    return NextResponse.json(
      {
        run,
        stale,
        events: events.data,
        graph: cardGraph,
        sources: [source.source_url || "사용자가 제공한 본문"],
        sourceIssue:
          !run && source.status === "needs_content"
            ? source.error_message || "읽을 수 있는 본문을 추가해 주세요."
            : null,
        verification:
          "원문 일치·파일·배치 자동 검수입니다. 최신 사실의 독립 검증과 사람의 최종 교정은 별도로 필요합니다.",
        imageMode: "편집형 PNG · 사진 생성 AI 미연결",
        prompts:
          run?.data.story?.cards.map((c, i) => imagePrompt(c, i, run.brief)) ||
          [],
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
export async function POST(req: NextRequest, ctx: Context) {
  try {
    const { user } = await authenticate(req);
    ensureAIAllowed(user.email);
    const id = uuid.parse((await ctx.params).id);
    const input = await body(req);
    const run = await startCards(user.id, id, input);
    return NextResponse.json(
      {
        run,
        queued: run.state !== "completed",
        message: "카드뉴스 제작을 예약했습니다. 완료한 단계부터 이어갑니다.",
      },
      { status: run.state === "completed" ? 200 : 202 },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
