import type { SupabaseClient } from "@supabase/supabase-js";
import type { Resource } from "./types";
import { checkDb } from "./server";
import { learningProgress, type AnalysisQueueEntry } from "./learning-progress";

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
  const latest = new Map<string, AnalysisQueueEntry>();
  for (const job of result.data || [])
    if (!latest.has(job.job_key))
      latest.set(job.job_key, job as AnalysisQueueEntry);
  return resources.map((r) => ({
    ...r,
    progress: learningProgress(r, latest.get(r.id)),
  }));
}
