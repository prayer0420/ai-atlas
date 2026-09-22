import { admin, AppError, checkDb } from "./server";
import {
  CARD_PROMPT_VERSION,
  cardBriefSchema,
  type CardRun,
} from "./card-workflow";
export const CARD_BUCKET = "ai-atlas-cards";
export async function startCards(
  userId: string,
  resourceId: string,
  input: unknown = {},
  origin: "manual" | "automatic" = "manual",
) {
  const parsed = cardBriefSchema.safeParse(input);
  if (!parsed.success)
    throw new AppError(
      "장수는 3~12장으로 설정하고 독자·목적 등 입력 길이를 확인해 주세요.",
      400,
    );
  const brief = parsed.data;
  const result = await admin().rpc("ai_atlas_request_cards", {
    p_user_id: userId,
    p_resource_id: resourceId,
    p_brief: brief,
    p_origin: origin,
    p_version: CARD_PROMPT_VERSION,
  });
  if (result.error?.message.includes("RESOURCE_NOT_FOUND"))
    throw new AppError("자료를 찾을 수 없습니다.", 404);
  checkDb(result.error);
  return result.data as CardRun;
}
export async function cardSource(userId: string, resourceId: string) {
  const r = await admin()
    .from("ai_atlas_resources")
    .select("*")
    .eq("user_id", userId)
    .eq("id", resourceId)
    .is("deleted_at", null)
    .maybeSingle();
  checkDb(r.error);
  if (!r.data) throw new AppError("자료를 찾을 수 없습니다.", 404);
  return r.data;
}
export async function latestCards(userId: string, resourceId: string) {
  const source = await cardSource(userId, resourceId);
  const result = await admin()
    .from("ai_atlas_card_runs")
    .select("*")
    .eq("user_id", userId)
    .eq("resource_id", resourceId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  checkDb(result.error);
  const run = result.data as CardRun | null;
  if (
    run &&
    ["queued", "running", "recovering"].includes(run.state) &&
    run.queue_id
  ) {
    const q = await admin()
      .from("ai_atlas_queue")
      .select("status")
      .eq("user_id", userId)
      .eq("id", run.queue_id)
      .maybeSingle();
    checkDb(q.error);
    if (q.data?.status === "failed") {
      run.state = "failed";
      run.message =
        "처리 연결이 반복 중단됐습니다. 저장한 단계부터 이어갈 수 있습니다.";
      run.next_action = "이어서 제작";
    }
  }
  return {
    source,
    run,
    stale: !!run && run.input_hash !== source.content_hash,
  };
}
export function assertCardPath(
  userId: string,
  run: CardRun,
  assetPath: string,
) {
  if (
    !assetPath.startsWith(`${userId}/${run.id}/`) ||
    assetPath.includes("..") ||
    !run.manifest.some((a) => a.path === assetPath)
  )
    throw new AppError("이미지를 찾을 수 없습니다.", 404);
}
