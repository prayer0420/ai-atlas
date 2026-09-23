import { cardBriefSchema, type CardBrief, type Storyboard } from "./card-workflow";

export const cardDesigns = {
  magazine: { name: "독립 잡지", paper: "#F4F0E6", ink: "#202021", red: "#EE513B", blue: "#2C49C6", highlight: "#F6DFD6" },
  cream: { name: "크림 노트", paper: "#F6F1E7", ink: "#182C3C", red: "#B8643C", blue: "#385C70", highlight: "#F1DEA9" },
} as const;
export function normalizeCardBrief(value: unknown): CardBrief {
  return cardBriefSchema.parse(value);
}
export function designDirection(brief: CardBrief) {
  return brief.design === "cream"
    ? "크림색 종이 위에 네이비 제목과 따뜻한 강조색을 사용합니다. 핵심 문구, 비교 상자, 단계별 메모를 내용의 역할에 맞게 배치하고 여백을 넉넉하게 둡니다."
    : "따뜻한 종이색과 선명한 빨강·파랑을 사용하는 독립 잡지 편집 디자인입니다. 큰 타이포그래피와 장별로 다른 구도로 이야기의 흐름을 이어갑니다.";
}
export function cardHashtags(tags: unknown): string[] {
  if (!Array.isArray(tags)) return [];
  return [...new Set(tags.filter((x): x is string => typeof x === "string")
    .map((x) => x.replace(/[^\p{L}\p{N}_]/gu, "").slice(0, 25)).filter(Boolean))].slice(0, 8).map((x) => `#${x}`);
}
/** A layout change can reuse a passed editorial review only when all content agrees. */
export function sameEditorialContent(a: Storyboard, b: Storyboard) {
  const content = (s: Storyboard) => JSON.stringify({
    narrative: s.narrative, caption: s.caption, caveats: s.caveats,
    cards: s.cards.map((c) => ({ role: c.role, title: c.title, copy: c.copy, condition: c.condition, evidence: c.evidence, items: c.items.map((x) => ({ label: x.label, detail: x.detail })) })),
  });
  return content(a) === content(b);
}
