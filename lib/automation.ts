import { createHash } from "node:crypto";
import { admin, AppError, checkDb } from "./server";
export const localMode = () => process.env.AI_PROVIDER !== "cloud";
export const localRuntime = () =>
  localMode() && process.env.LOCAL_AI_RUNTIME === "1";
export const queueLocally = () => localMode() && !localRuntime();
export async function enqueue(
  userId: string,
  kind: "analyze" | "daily" | "wiki" | "question",
  payload: Record<string, unknown> = {},
  key?: string,
) {
  const result = await admin().rpc("ai_atlas_enqueue", {
    p_user_id: userId,
    p_kind: kind,
    p_key:
      key || createHash("sha256").update(JSON.stringify(payload)).digest("hex"),
    p_payload: payload,
  });
  if (result.error?.message.includes("QUEUE_"))
    throw new AppError(
      "대기 작업이 많습니다. 진행 중인 작업이 끝난 뒤 다시 시도해 주세요.",
      429,
    );
  checkDb(result.error);
  return {
    queued: true,
    job_id: result.data,
    message:
      kind === "analyze" && payload.manual === true
        ? "수동 자료를 최우선으로 학습하고 있습니다. 연결된 PC가 켜져 있으면 곧 완료됩니다."
        : "무료 AI 작업을 예약했습니다. 연결된 PC가 켜지면 자동으로 처리합니다.",
  };
}
