import test from "node:test";
import assert from "node:assert/strict";
import { guardAgentWiki } from "../lib/agent-guard";
const source = "00000000-0000-4000-8000-000000000001";
const draft = { slug: "llm-wiki", title: "LLM Wiki", kind: "concept", summary: "근거를 연결한 지식 문서", body: "LLM Wiki는 원문을 보존하면서 관련 지식을 연결하고 수정 이력을 남기는 방식입니다. 이 설명은 읽은 자료에 근거한 초안이며 추가 검토가 필요합니다. 반복해서 활용할 수 있도록 내용을 정리합니다.", source_ids: [source], links: [], caveats: [], expected_revision: 0 };
test("agent cannot cite a source it did not read", () => {
  assert.throws(() => guardAgentWiki(draft, new Set(), new Map(), []), /원문/);
});
test("agent preserves reviewed pages and concurrent revisions", () => {
  const page = { slug: draft.slug, revision: 2, protected: true, source_ids: [source] };
  assert.throws(() => guardAgentWiki({ ...draft, expected_revision: 2 }, new Set([source]), new Map([[draft.slug, 2]]), [page]), /검토 완료/);
  assert.throws(() => guardAgentWiki({ ...draft, expected_revision: 1 }, new Set([source]), new Map([[draft.slug, 1]]), [{ ...page, protected: false }]), /revision/);
});
test("agent cannot invent graph links or erase earlier evidence", () => {
  assert.throws(() => guardAgentWiki({ ...draft, links: ["nonexistent"] }, new Set([source]), new Map(), []), /slug/);
  const oldId = "00000000-0000-4000-8000-000000000002";
  assert.throws(() => guardAgentWiki({ ...draft, expected_revision: 1 }, new Set([source]), new Map([[draft.slug, 1]]), [{ slug: draft.slug, revision: 1, protected: false, source_ids: [oldId] }]), /기존 근거/);
});
test("valid agent draft remains explicitly unreviewed", () => {
  assert.match(guardAgentWiki(draft, new Set([source]), new Map(), []).caveats[0], /AI 초안/);
});
