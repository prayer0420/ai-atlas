import { z } from "zod";
import type { Lesson } from "./types";
import { readableText } from "./content-text";
import { readingExcerpt } from "./reading";

export const lessonCardSchema = z.object({
  title: z.string().trim().min(1).max(60),
  takeaway: z.string().trim().min(1).max(180),
  visual: z.enum(["flow", "compare", "concept"]),
  nodes: z.array(z.object({
    label: z.string().trim().min(1).max(32),
    detail: z.string().trim().min(1).max(90),
  })).min(2).max(4),
  note: z.string().trim().min(1).max(160),
  sectionIndex: z.number().int().min(0).max(6),
  evidence: z.string().trim().min(8).max(220),
});
export const lessonCardsSchema = z.array(lessonCardSchema).min(1).max(6);
export type LessonCard = z.infer<typeof lessonCardSchema>;

export function validateCardEvidence(cards: LessonCard[], text: string, sectionCount: number) {
  const normalized = (s: string) => readableText(s).replace(/\s+/g, " ");
  const source = normalized(text);
  return cards.every(card => card.sectionIndex < sectionCount && source.includes(normalized(card.evidence)));
}

/** Historical notes remain readable without claiming a new analysis has run. */
export function cardsForLesson(lesson: Lesson): { cards: LessonCard[]; legacy: boolean } {
  const parsed = lessonCardsSchema.safeParse(lesson.cards);
  if (parsed.success) return { cards: parsed.data, legacy: false };
  const cards: LessonCard[] = [{
    title: lesson.title,
    takeaway: readingExcerpt(lesson.summary, 180),
    visual: "concept",
    nodes: lesson.takeaways.slice(0, 3).map((text, i) => ({ label: `핵심 ${i + 1}`, detail: readingExcerpt(text, 90) })),
    note: readingExcerpt(lesson.caveats[0] || "원문과 함께 확인하세요.", 160),
    sectionIndex: 0, evidence: "",
  }, {
    title: lesson.diagram.title,
    takeaway: readingExcerpt(lesson.diagram.caption, 180),
    visual: lesson.diagram.kind === "flow" ? "flow" : "concept",
    nodes: lesson.diagram.nodes.slice(0, 4).map(n => ({ label: n.label, detail: readingExcerpt(n.description, 90) })),
    note: "기존에 저장된 분석을 시각 요약한 카드입니다. 전체 설명은 상세분석에 보존되어 있습니다.",
    sectionIndex: 0, evidence: "",
  }];
  return { cards, legacy: true };
}
