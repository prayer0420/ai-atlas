import test from "node:test";
import assert from "node:assert/strict";
import { readableText, readableValue, sourceProblem } from "../lib/content-text";
import { lessonCardsSchema, cardsForLesson, validateCardEvidence } from "../lib/lesson-cards";
import { demoResources } from "../lib/demo";
import { validateUrl } from "../lib/extract";

test("Repairs captured escaped newlines while preserving code, URLs and Windows paths", () => {
  assert.equal(readableText(String.raw`첫 문장\\n다음 문장\n마지막`), "첫 문장\n다음 문장\n마지막");
  assert.equal(readableText("문장/n다음 문장"), "문장\n다음 문장");
  const protectedText = '```js\nconst x = "\\n";\n```\n`\\n` https://example.com/news C:\\new\\notes';
  assert.equal(readableText(protectedText), protectedText);
  const source = { body: String.raw`가\n나`, nested: [String.raw`다\n라`] };
  assert.equal(readableValue(source).body, "가\n나");
  assert.equal(source.body, String.raw`가\n나`);
});
test("No fake analysis from empty or blocked source pages, and no merged URLs", () => {
  assert.ok(sourceProblem(""));
  assert.ok(sourceProblem("Just a moment " + "checking ".repeat(50)));
  assert.equal(sourceProblem("이 문서는 인공지능 도구의 접근 권한 설정과 실행 원리를 설명합니다. ".repeat(10)), null);
  assert.throws(() => validateUrl("https://example.com/a%20https://example.com/b"));
});
test("Cards require readable content, 1–6 slides, exact source evidence and valid deep links", () => {
  const card = { title: "검색 후 답변", takeaway: "원문을 검색해 답변의 근거를 제공합니다.", visual: "flow", nodes: [{ label: "검색", detail: "관련 문서를 찾습니다." }, { label: "답변", detail: "찾은 문서를 참고합니다." }], note: "검색 결과의 정확성을 확인하세요.", sectionIndex: 0, evidence: "검색한 문서를 근거로 답변합니다." };
  const cards = lessonCardsSchema.parse([card]);
  assert.ok(validateCardEvidence(cards, "이 기술은 검색한 문서를 근거로 답변합니다. 근거를 확인하세요.", 3));
  assert.equal(validateCardEvidence(cards, "근거 없는 완전히 다른 내용", 3), false);
  assert.equal(validateCardEvidence(cards, card.evidence, 0), false);
  assert.equal(lessonCardsSchema.safeParse([]).success, false);
  assert.equal(lessonCardsSchema.safeParse(Array(7).fill(card)).success, false);
  assert.equal(lessonCardsSchema.safeParse([{ ...card, takeaway: " " }]).success, false);
});
test("Existing detailed notes are preserved and can be viewed as legacy cards", () => {
  const lesson = demoResources[0].lesson!;
  const before = JSON.stringify(lesson);
  const result = cardsForLesson(lesson);
  assert.equal(result.legacy, true);
  assert.ok(result.cards.length >= 1 && result.cards.length <= 6);
  assert.equal(JSON.stringify(lesson), before);
  assert.ok(lesson.sections.every(s => s.body.length > 0));
});
