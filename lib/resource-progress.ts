import type { SupabaseClient } from "@supabase/supabase-js";
import type { Resource } from "./types";
import { checkDb } from "./server";
import { learningProgress, type AnalysisQueueEntry } from "./learning-progress";
import { cardRunProgress, type CardRun } from "./card-workflow";

/** The authenticated client and an explicit owner scope protect every queue read. */
export async function withProgress<T extends Resource>(
  db: SupabaseClient,
  userId: string,
  resources: T[],
) {
  if (!resources.length) return resources;
  const result = await db
    .from("ai_atlas_queue")
    .select("job_key,status,created_at,finished_at")
    .eq("user_id", userId)
    .eq("kind", "analyze")
    .in(
      "job_key",
      resources.map((r) => r.id),
    )
    .order("created_at", { ascending: false })
    .limit(1000);
  checkDb(result.error);
  const cards = await db
    .from("ai_atlas_card_runs")
    .select(
      "resource_id,state,node,message,error_code,input_hash,queue_id,created_at",
    )
    .eq("user_id", userId)
    .in(
      "resource_id",
      resources.map((r) => r.id),
    )
    .order("created_at", { ascending: false })
    .limit(1000);
  checkDb(cards.error);
  const cardLatest = new Map<string, CardRun>();
  for (const card of cards.data || [])
    if (!cardLatest.has(card.resource_id))
      cardLatest.set(card.resource_id, card as CardRun);
  const queueIds = [...cardLatest.values()]
    .map((c) => c.queue_id)
    .filter((id): id is string => !!id);
  const failed = new Set<string>();
  if (queueIds.length) {
    const qs = await db
      .from("ai_atlas_queue")
      .select("id")
      .eq("user_id", userId)
      .in("id", queueIds)
      .eq("status", "failed");
    checkDb(qs.error);
    for (const q of qs.data || []) failed.add(q.id);
  }
  const latest = new Map<string, AnalysisQueueEntry>();
  for (const job of result.data || [])
    if (!latest.has(job.job_key))
      latest.set(job.job_key, job as AnalysisQueueEntry);
  return resources.map((r) => {
    const card = cardLatest.get(r.id);
    if (
      card &&
      r.content_hash &&
      card.input_hash !== r.content_hash &&
      !["running", "recovering"].includes(card.state)
    )
      return {
        ...r,
        progress: {
          phase: "saved" as const,
          label: "새 본문으로 제작",
          message: "원문이 변경됐습니다. 새 내용으로 카드뉴스를 만들어 주세요.",
          action: "analyze" as const,
        },
      };
    if (
      card &&
      card.queue_id &&
      failed.has(card.queue_id) &&
      ["queued", "running", "recovering"].includes(card.state)
    ) {
      card.state = "failed";
      card.message = "처리가 중단됐습니다. 완료한 단계부터 이어갈 수 있습니다.";
    }
    const progress = card
      ? cardRunProgress(card)
      : learningProgress(r, latest.get(r.id));
    return {
      ...r,
      progress:
        !card && progress.phase === "ready"
          ? {
              ...progress,
              label: "분석 완료",
              message:
                "내용 분석을 마쳤습니다. 카드뉴스 이미지를 만들 수 있습니다.",
              action: "analyze" as const,
            }
          : progress,
    };
  });
}
