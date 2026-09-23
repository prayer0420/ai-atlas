import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { sourceEvidence } from "../lib/source-evidence";
import { readableText } from "../lib/content-text";
import { validateCardEvidence } from "../lib/lesson-cards";
import { createLesson, AnalysisEvidenceError } from "../lib/analyze";
import { LocalResponseError, localStructured } from "../lib/local-ai";
import { recoveryFor, localStoryboardSchema, cardBriefSchema, validateStoryboard } from "../lib/card-workflow";
import { z } from "zod";

const source = "자료를 모으는 것만으로 내용이 정리되지는 않습니다. 읽을 사람과 전하고 싶은 내용을 정해야 합니다. 한 장에는 하나의 생각만 담습니다. 조건과 한계를 생략하지 않습니다. 출처를 남기고 완성한 이미지를 확인합니다.";
const card = {
  title: "독자와 핵심", takeaway: "누구에게 어떤 내용을 전할지 먼저 정합니다.", visual: "concept",
  nodes: [{ label: "독자", detail: "읽을 사람" }, { label: "핵심", detail: "남길 생각" }],
  note: "조건과 한계를 함께 확인합니다.", sectionIndex: 0, evidence: sourceEvidence(source)[0],
};
function lesson() {
  return {
    cards: [structuredClone(card)], title: "자료를 카드로 정리하기", summary: "독자와 핵심을 정하고 근거를 확인합니다.",
    category: "생산성", tags: ["정리"], level: "입문", readMinutes: 3,
    objectives: ["독자 정하기", "근거 확인하기"], takeaways: ["독자", "핵심", "근거"],
    sections: Array.from({ length: 3 }, (_, i) => ({ heading: `정리 ${i}`, body: source, example: "가상 예시: 자료를 독자에게 설명합니다.", sourceBasis: "원문 기반" })),
    diagram: { title: "정리 과정", kind: "flow", nodes: ["독자", "핵심", "근거"].map(label => ({ label, description: label })), caption: "자료를 확인합니다." },
    comparison: { title: "정리 전후", columns: ["수집", "정리"], rows: [{ label: "독자", values: ["미정", "설정"] }, { label: "핵심", values: ["미정", "설정"] }] },
    glossary: ["독자", "근거", "핵심"].map(term => ({ term, definition: term })),
    practice: { title: "정리", steps: ["읽기", "정하기", "확인하기"], prompt: "자료의 핵심을 정합니다." },
    quiz: Array.from({ length: 2 }, () => ({ question: "먼저 할 일은?", choices: ["독자 정하기", "삭제", "반복", "과장"], answer: 0, explanation: "독자를 정합니다." })),
    caveats: ["제공된 자료만 확인했습니다."],
  };
}
function stream(value: unknown) {
  return new Response(JSON.stringify({ message: { content: JSON.stringify(value) }, done: true, done_reason: "stop", prompt_eval_count: 20, eval_count: 30 }) + "\n");
}
function local(t: TestContext) {
  const vars = { AI_PROVIDER: "local", LOCAL_AI_RUNTIME: "1", ATLAS_AI_PROVIDER: "ollama" };
  const old = Object.fromEntries(Object.keys(vars).map(key => [key, process.env[key]]));
  Object.assign(process.env, vars);
  t.after(() => { for (const [key, value] of Object.entries(old)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } });
}

test("Evidence choices preserve exact source substrings and cover both ends of long input", () => {
  for (const text of [source, "가".repeat(185), "짧음. ".repeat(25), Array.from({ length: 300 }, (_, i) => `자료 ${i}의 정확한 원문 구절입니다.`).join("\n"), "출처 경로 `C:\\new\\notes`와 https://example.com/path 를 확인합니다."]) {
    const quotes = sourceEvidence(text), normalized = readableText(text).replace(/\s+/g, " ");
    assert.ok(quotes.length > 0 && quotes.length <= 64);
    for (const quote of quotes) { assert.ok(quote.length >= 8 && quote.length <= 220); assert.ok(normalized.includes(quote)); }
  }
  const long = Array.from({ length: 300 }, (_, i) => `자료 ${i}의 정확한 원문 구절입니다.`).join("\n");
  assert.match(sourceEvidence(long)[0], /자료 0/);
  assert.match(sourceEvidence(long).at(-1)!, /자료 299/);
  assert.throws(() => sourceEvidence("짧음"), /SOURCE_EVIDENCE_EMPTY/);
});

test("Actual local request constrains evidence while keeping original evidence verification", async t => {
  local(t);
  let calls = 0;
  t.mock.method(globalThis, "fetch", async (url: string | URL | Request, init?: RequestInit) => {
    assert.equal(url, "http://127.0.0.1:11434/api/chat");
    const body = JSON.parse(String(init?.body)); calls++;
    assert.deepEqual(body.format.properties.cards.items.properties.evidence.enum, sourceEvidence(source));
    assert.equal(body.options.num_predict, 8000);
    assert.equal(body.think, false);
    assert.equal(body.tools, undefined);
    return stream(lesson());
  });
  const result = await createLesson(source, null);
  assert.equal(calls, 1);
  assert.ok(validateCardEvidence(result.lesson.cards!, source, 3));
  assert.equal(validateCardEvidence([{ ...result.lesson.cards![0], evidence: "원문에 없는 주장을 만들어 냈습니다." }], source, 3), false);
});

test("Only invalid section links are repaired against real section count; usage is accumulated", async t => {
  local(t); let calls = 0;
  const initial = lesson(); initial.cards[0].sectionIndex = 6;
  t.mock.method(globalThis, "fetch", async (_url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)); calls++;
    if (calls === 1) return stream(initial);
    assert.equal(calls, 2);
    assert.equal(body.format.properties.cards.items.properties.sectionIndex.maximum, 2);
    const input = JSON.parse(body.messages[1].content);
    assert.equal(input.sections.length, 3);
    assert.equal(input.invalidCards.length, 1);
    return stream({ cards: [{ ...card, sectionIndex: 2 }] });
  });
  const result = await createLesson(source, null);
  assert.equal(calls, 2);
  assert.equal(result.lesson.cards![0].sectionIndex, 2);
  assert.deepEqual(result.lesson.sections, initial.sections);
  assert.deepEqual(result.usage, { input_tokens: 40, output_tokens: 60 });
});

test("A failed bounded repair is classified as evidence failure, never a connection retry", async t => {
  local(t); let calls = 0;
  const initial = lesson(); initial.cards[0].sectionIndex = 6;
  t.mock.method(globalThis, "fetch", async () => ++calls === 1 ? stream(initial) : stream({ cards: [{ ...card, evidence: "PRIVATE_SYNTHETIC_PROMPT_NOT_IN_SOURCE" }] }));
  await assert.rejects(() => createLesson(source, null), e => {
    assert.ok(e instanceof AnalysisEvidenceError);
    assert.doesNotMatch(String(e), /PRIVATE_SYNTHETIC/);
    assert.equal(recoveryFor("analysis", e, 1).state, "failed");
    assert.equal(recoveryFor("analysis", e, 1).code, "ANALYSIS_EVIDENCE_INVALID");
    return true;
  });
  assert.equal(calls, 2);
});

test("Malformed model JSON stays private and is not reported as a transient connection failure", async t => {
  local(t);
  t.mock.method(globalThis, "fetch", async () => new Response(JSON.stringify({ message: { content: "PRIVATE_SYNTHETIC_PROMPT" }, done: true }) + "\n"));
  await assert.rejects(() => localStructured(z.object({ ok: z.boolean() }), "private instructions", {}, 100), e => {
    assert.ok(e instanceof LocalResponseError);
    assert.doesNotMatch(String(e), /PRIVATE_SYNTHETIC|private instructions/);
    assert.equal(recoveryFor("analysis", e, 1).code, "AI_RESPONSE_INVALID");
    return true;
  });
});

test("Local story layouts require supported pairs only when needed, without filling invented items", async t => {
  local(t);
  const schema = localStoryboardSchema(sourceEvidence(source), 3);
  const item = { label: "독자", detail: "읽을 사람을 정합니다." };
  const scene = {
    role: "설명", title: "독자", copy: "자료를 읽을 사람을 먼저 정합니다.", condition: "", layout: "scene" as const,
    composition: "자료와 독자를 나란히 놓아 읽는 관계를 보여 줍니다.", items: [], evidence: sourceEvidence(source)[0],
  };
  const story = {
    direction: "자료의 독자와 핵심을 정하는 과정을 차분하게 설명하는 편집 구성입니다.",
    narrative: "자료를 모은 뒤 누구에게 전달할지 정합니다. 한 장에 하나의 생각을 담고 마지막에 근거와 출처를 확인합니다.",
    cards: [scene, { ...scene, layout: "relation" as const, copy: "전달할 핵심과 읽을 사람을 연결합니다.", items: [item, { label: "핵심", detail: "전하고 싶은 내용" }] }, { ...scene, layout: "closing" as const, copy: "출처와 완성한 이미지를 확인합니다." }],
    caption: "독자와 핵심을 정한 뒤 조건과 한계를 함께 확인합니다. 완성한 이미지에서 출처와 근거가 남아 있는지 확인합니다.", caveats: [],
  };
  assert.ok(schema.safeParse(story).success);
  assert.deepEqual(validateStoryboard(schema.parse(story), cardBriefSchema.parse({ count: 3 }), source), []);
  for (const layout of ["relation", "steps", "comparison"]) {
    assert.equal(schema.safeParse({ ...story, cards: [scene, { ...scene, layout, items: [item] }, story.cards[2]] }).success, false);
  }
  assert.equal(schema.safeParse({ ...story, cards: [scene, { ...scene, layout: "comparison", items: [item, item, item] }, story.cards[2]] }).success, false);
  assert.equal(schema.safeParse({ ...story, cards: story.cards.slice(0, 2) }).success, false);
  assert.equal(schema.safeParse({ ...story, cards: [{ ...scene, evidence: "출처에 없는 인용문입니다." }, ...story.cards.slice(1)] }).success, false);
  let calls = 0;
  t.mock.method(globalThis, "fetch", async (_url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)); calls++;
    const variants = body.format.properties.cards.items.oneOf;
    assert.equal(variants.length, 3);
    assert.equal(variants[1].properties.items.minItems, 2);
    assert.equal(variants[2].properties.items.minItems, 2);
    assert.equal(variants[2].properties.items.maxItems, 2);
    return stream(story);
  });
  const result = await localStructured(schema, "Use only supported source details.", {}, 7500);
  assert.equal(calls, 1);
  assert.equal(result.value.cards[0].items.length, 0);
});
