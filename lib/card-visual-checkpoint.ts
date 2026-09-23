import { createHash } from "node:crypto";
import { generateVisual, ImageProviderError, visualKey } from "./card-image-provider";
import { wantsCardVisual } from "./card-image-options";
import type { CardBrief, CardRun, StoryCard } from "./card-workflow";

type Visual = NonNullable<CardRun["data"]["visuals"]>[string];
type Storage = { read(path: string): Promise<Buffer>; write(path: string, bytes: Buffer): Promise<void> };
export async function ensureCardVisual(args: {
  card: StoryCard; brief: CardBrief; index: number; prefix: string; previous?: Visual;
  checkpoint(state: Visual | undefined): Promise<void>; storage: Storage;
  generate?: typeof generateVisual;
}) {
  const { card, brief, index, prefix, previous, checkpoint, storage } = args;
  if (!wantsCardVisual(brief, index)) return undefined;
  const key = visualKey(card, brief);
  if (previous?.state === "saved") {
    if (previous.key !== key || !previous.path?.startsWith(`${prefix}/visual-`) || previous.path.includes("..") || !/^[a-f0-9]{64}$/.test(previous.sha256 || "")) throw new ImageProviderError("IMAGE_PROVIDER_UNCERTAIN", "저장된 삽화와 현재 설정이 다릅니다. 새 버전으로 제작해 주세요.");
    const bytes = await storage.read(previous.path);
    if (createHash("sha256").update(bytes).digest("hex") !== previous.sha256) throw new ImageProviderError("IMAGE_PROVIDER_STORAGE", "저장된 삽화 무결성을 확인하지 못했습니다. 자동으로 다시 생성하지 않았습니다.");
    return bytes;
  }
  const bytes = await (args.generate || generateVisual)(card, brief, previous, checkpoint);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const file = `${prefix}/visual-${index}-${sha256.slice(0, 16)}.png`;
  await storage.write(file, bytes);
  await checkpoint({ state: "saved", key, provider: brief.imageProvider as "openai" | "comfyui", path: file, sha256 });
  return bytes;
}
