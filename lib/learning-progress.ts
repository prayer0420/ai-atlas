import type { Resource } from "./types";

export type LearningProgress = {
  phase: "saved" | "queued" | "running" | "ready" | "needs_content" | "failed";
  label: string;
  message: string;
  action: "analyze" | "source" | null;
};
export type AnalysisQueueEntry = {
  status: string;
  created_at: string;
  finished_at: string | null;
};
export const STALE_ANALYSIS_MS = 35 * 60_000;
export function learningProgress(
  r: Pick<Resource, "status" | "updated_at" | "analysis_started_at">,
  job?: AnalysisQueueEntry,
  now = Date.now(),
): LearningProgress {
  if (job?.status === "queued")
    return {
      phase: "queued",
      label: "정리 대기",
      message:
        "정리 요청을 저장했습니다. 연결된 PC에서 순서대로 처리하며, 완료되면 카드와 상세 분석이 여기에 표시됩니다.",
      action: null,
    };
  if (job?.status === "running")
    return {
      phase: "running",
      label: "정리 중",
      message:
        "원문을 읽고 카드와 상세 분석을 만들고 있습니다. 이 화면을 닫아도 작업은 계속됩니다.",
      action: null,
    };
  if (r.status === "ready")
    return {
      phase: "ready",
      label: "읽기 가능",
      message:
        "카드로 핵심을 먼저 읽고, 궁금한 내용은 상세 분석에서 확인하세요.",
      action: null,
    };
  if (r.status === "needs_content")
    return {
      phase: "needs_content",
      label: "도움 필요",
      message:
        "링크에서 충분한 내용을 읽지 못했습니다. 원문이나 자막을 붙여 넣으면 다시 정리할 수 있습니다.",
      action: "source",
    };
  const stale =
    r.status === "analyzing" &&
    (job?.status === "failed" ||
      now - Date.parse(r.analysis_started_at || r.updated_at) >
        STALE_ANALYSIS_MS);
  if (
    r.status === "failed" ||
    stale ||
    (r.status === "saved" &&
      job?.status === "failed" &&
      Date.parse(job.finished_at || job.created_at) >= Date.parse(r.updated_at))
  )
    return {
      phase: "failed",
      label: "다시 시도 필요",
      message: stale
        ? "이전 정리가 중단되었습니다. 원문은 보관되어 있으니 다시 시도해 주세요."
        : "정리를 완료하지 못했습니다. 원문은 보관되어 있습니다. 아래 사유를 확인한 뒤 다시 시도해 주세요.",
      action: "analyze",
    };
  if (r.status === "analyzing")
    return {
      phase: "running",
      label: "정리 중",
      message:
        "카드와 상세 분석을 만들고 있습니다. 완료되면 자동으로 표시됩니다.",
      action: null,
    };
  return {
    phase: "saved",
    label: "제작 전",
    message:
      "자료를 저장했습니다. 카드뉴스 만들기를 누르면 원문 분석부터 장별 이미지까지 이어서 만듭니다.",
    action: "analyze",
  };
}
