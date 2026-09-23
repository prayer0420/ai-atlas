import type { CardBrief } from "./card-workflow";

export const imageProviders = {
  editorial: { name: "기존 편집형 · 무료", description: "글자·도형을 배치합니다. 사진·삽화 생성 AI는 사용하지 않습니다." },
  comfyui: { name: "내 PC 이미지 AI · ComfyUI", description: "설치한 공개 모델로 사진·삽화를 만듭니다. API 요금은 없고 PC 성능에 따라 시간이 걸립니다." },
  openai: { name: "OpenAI 이미지 AI · 유료", description: "카드의 문구·화면 설명을 OpenAI로 전송합니다. 이미지 API 사용료가 별도로 발생합니다." },
} as const;

export function wantsCardVisual(brief: CardBrief, index: number) {
  return brief.imageProvider !== "editorial" && (brief.imageScope === "all" || index === 0);
}

export function imageModeLabel(brief: CardBrief) {
  if (brief.imageProvider === "editorial") return "편집형 PNG · 글자·도형 자동 배치";
  return `${brief.imageProvider === "openai" ? "OpenAI" : "ComfyUI"} 생성 삽화 ${brief.imageScope === "all" ? "모든 장" : "표지 1장"} + 한글 편집 · 실제 사진·서비스 화면 아님`;
}

/** Preserve the original JSON identity so adding defaults does not requeue completed free decks. */
export function persistedCardBrief(brief: CardBrief) {
  if (brief.imageProvider !== "editorial" || brief.imageScope !== "cover" || brief.imageQuality !== "medium") return brief;
  const { imageProvider: _, imageScope: __, imageQuality: ___, ...legacy } = brief;
  return legacy;
}
