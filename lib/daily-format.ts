import type { FeedItem, IssueContent } from "./brain-types";
import { readingExcerpt } from "./reading";
/** Formatting only: provenance and actual recall questions, with facts left unchanged. */
export function formatDaily(
  content: IssueContent,
  items: FeedItem[],
  date: string,
): IssueContent {
  return {
    ...content,
    title: `오늘의 AI · ${date}`,
    introduction:
      content.stories.map((s) => readingExcerpt(s.headline, 35)).join(" · ") +
      " — 핵심을 읽고, 출처를 확인하고, 복습 질문으로 기억하세요.",
    stories: content.stories.map((s) => {
      const source = items.find((i) => i.id === s.feed_id)?.source_name;
      const prefix = source ? source + "의 설명: " : "출처의 설명: ";
      return {
        ...s,
        takeaway: s.takeaway.startsWith(prefix)
          ? s.takeaway
          : prefix + readingExcerpt(s.takeaway, 240 - prefix.length),
        slides: s.slides.map((slide, i) =>
          i === s.slides.length - 1
            ? {
                kind: "check" as const,
                title: "잠깐, 기억했나요?",
                body: s.quiz.question,
                bullets: ["원문의 근거를 찾아 한 문장으로 설명해 보세요."],
              }
            : slide,
        ),
      };
    }),
  };
}
