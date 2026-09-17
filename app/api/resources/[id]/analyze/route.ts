import { NextRequest, NextResponse } from "next/server";
import {
  authenticate,
  admin,
  checkDb,
  errorResponse,
  AppError,
  ensureAIAllowed,
  dailyLimit,
  uuid,
} from "@/lib/server";
import { extract } from "@/lib/extract";
import { createLesson } from "@/lib/analyze";
export const maxDuration = 300;
export const runtime = "nodejs";
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  let jobId: string | undefined;
  let resourceId: string | undefined;
  let userId: string | undefined;
  try {
    const { db, user } = await authenticate(req);
    ensureAIAllowed(user.email);
    userId = user.id;
    const id = uuid.parse((await params).id);
    resourceId = id;
    const { data: r, error } = await db
      .from("ai_atlas_resources")
      .select("*")
      .eq("id", id)
      .eq("user_id", user.id)
      .is("deleted_at", null)
      .maybeSingle();
    checkDb(error);
    if (!r) throw new AppError("자료를 찾을 수 없습니다.", 404);
    const { data: claim, error: claimError } = await admin().rpc(
      "ai_atlas_claim_analysis",
      { p_resource_id: id, p_user_id: user.id, p_limit: dailyLimit() },
    );
    if (claimError) {
      if (claimError.message.includes("DAILY_LIMIT"))
        throw new AppError(
          "오늘의 분석 횟수를 모두 사용했습니다. 내일 다시 분석할 수 있습니다.",
          429,
        );
      if (claimError.message.includes("ALREADY_RUNNING"))
        throw new AppError(
          "이미 분석 중인 자료입니다. 잠시 후 확인해 주세요.",
          409,
        );
      checkDb(claimError);
    }
    jobId = claim as string;
    // Read the input after taking the database claim so concurrent edits cannot
    // make the analysis use a snapshot from before the claim.
    const { data: claimed, error: claimedError } = await admin()
      .from("ai_atlas_resources")
      .select("raw_text,source_url,source_method")
      .eq("id", id)
      .eq("user_id", user.id)
      .eq("analysis_job_id", jobId)
      .is("deleted_at", null)
      .maybeSingle();
    checkDb(claimedError);
    if (!claimed)
      throw new AppError("자료가 변경되어 분석을 중단했습니다.", 409);
    let text = claimed.raw_text as string;
    let method = claimed.source_method as string | null;
    if (text.trim().length < 80) {
      if (!claimed.source_url)
        throw new AppError(
          "충실한 학습 노트를 위해 본문을 80자 이상 추가해 주세요.",
          422,
        );
      const content = await extract(claimed.source_url);
      text = content.text;
      method = content.method;
      const { error: saveError } = await admin()
        .from("ai_atlas_resources")
        .update({ raw_text: text, source_method: method })
        .eq("id", id)
        .eq("analysis_job_id", jobId);
      checkDb(saveError);
    }
    const { lesson, model, usage } = await createLesson(
      text,
      claimed.source_url,
    );
    const { data: resource, error: saveError } = await admin()
      .from("ai_atlas_resources")
      .update({
        title: lesson.title,
        category: lesson.category,
        tags: lesson.tags,
        lesson,
        status: "ready",
        error_message: null,
        model,
        source_method: method,
      })
      .eq("id", id)
      .eq("user_id", user.id)
      .eq("analysis_job_id", jobId)
      .is("deleted_at", null)
      .select("*")
      .maybeSingle();
    checkDb(saveError);
    if (!resource)
      throw new AppError(
        "분석 중 자료가 변경되어 결과를 저장하지 않았습니다.",
        409,
      );
    await admin()
      .from("ai_atlas_analysis_jobs")
      .update({
        status: "completed",
        finished_at: new Date().toISOString(),
        model,
        input_tokens: usage?.input_tokens || 0,
        output_tokens: usage?.output_tokens || 0,
      })
      .eq("id", jobId);
    return NextResponse.json({ resource });
  } catch (e) {
    let problem = e;
    if (!(e instanceof AppError)) {
      const candidate = e as { status?: number; name?: string };
      problem = new AppError(
        candidate.status === 429
          ? "AI 서비스의 사용 한도에 도달했습니다. 잠시 후 다시 시도해 주세요."
          : candidate.status === 401
            ? "AI API 인증에 실패했습니다. 서버의 API 키를 확인해 주세요."
            : candidate.name?.includes("Timeout")
              ? "분석 시간이 초과되었습니다. 본문을 나누어 다시 시도해 주세요."
              : "분석을 완료하지 못했습니다. 원문은 보존되어 있으니 다시 시도해 주세요.",
        502,
      );
    }
    if (jobId && resourceId && userId) {
      try {
        await admin()
          .from("ai_atlas_resources")
          .update({
            status:
              (problem as AppError).status === 422 ? "needs_content" : "failed",
            error_message: (problem as Error).message,
          })
          .eq("id", resourceId)
          .eq("user_id", userId)
          .eq("analysis_job_id", jobId);
        await admin()
          .from("ai_atlas_analysis_jobs")
          .update({ status: "failed", finished_at: new Date().toISOString() })
          .eq("id", jobId);
      } catch {}
    }
    return errorResponse(problem);
  }
}
