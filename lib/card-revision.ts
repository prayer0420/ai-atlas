import { z } from "zod";
import { cardBriefSchema, storyCardSchema, validateStoryboard, type CardRun } from "./card-workflow";
import { designDirection } from "./card-style";
/** Partial edits must never fall back to rewriting the user's other cards. */
export function isCardRevision(data: CardRun["data"]) {
  return !!data.parentRunId || (Number.isInteger(data.editedIndex) && data.editedIndex! >= 0);
}
export const cardRevisionSchema = z.object({
  runId: z.string().uuid(), revision: z.number().int().nonnegative(),
  design: z.enum(["cream", "magazine"]).optional(),
  imageProvider: cardBriefSchema.shape.imageProvider.removeDefault().optional(),
  imageScope: cardBriefSchema.shape.imageScope.removeDefault().optional(),
  imageQuality: cardBriefSchema.shape.imageQuality.removeDefault().optional(),
  index: z.number().int().min(0).max(11).optional(),
  card: storyCardSchema.pick({ title: true, copy: true, condition: true, layout: true, items: true }).partial().strict().optional(),
}).strict().refine((v) => (v.card !== undefined && v.index !== undefined) || (!v.card && (v.design !== undefined || v.imageProvider !== undefined || v.imageScope !== undefined || v.imageQuality !== undefined)), "수정할 카드 또는 디자인·이미지 방식을 선택해 주세요.");
export function prepareCardRevision(base: CardRun, input: z.infer<typeof cardRevisionSchema>, source: string) {
  if (!base.data.story) throw new Error("완성 원고가 없습니다.");
  const story = structuredClone(base.data.story);
  const brief = cardBriefSchema.parse({ ...base.brief, ...Object.fromEntries(["design", "imageProvider", "imageScope", "imageQuality"].filter((key) => input[key as keyof typeof input] !== undefined).map((key) => [key, input[key as keyof typeof input]])) });
  if (input.card && input.index !== undefined) {
    if (!story.cards[input.index]) throw new Error("수정할 장을 찾을 수 없습니다.");
    story.cards[input.index] = storyCardSchema.parse({ ...story.cards[input.index], ...input.card });
  }
  if (input.design) story.direction = designDirection(brief);
  const canonicalCards = (cards: typeof story.cards) => JSON.stringify(cards.map((card) => storyCardSchema.parse(card)));
  if (JSON.stringify(brief) === JSON.stringify(cardBriefSchema.parse(base.brief)) && canonicalCards(story.cards) === canonicalCards(base.data.story.cards)) throw new Error("문구·디자인·이미지 방식을 바꾼 뒤 수정본을 만들어 주세요.");
  const issues = validateStoryboard(story, brief, source);
  if (issues.length) throw new Error(issues.slice(0, 3).join(" "));
  return { brief, data: { story, sourceHash: base.input_hash, model: base.data.model, ...(input.index !== undefined ? { editedIndex: input.index } : {}) } };
}
