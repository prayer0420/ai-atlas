import test from "node:test";
import assert from "node:assert/strict";
import { buildVault } from "../lib/vault";
import { wikiLint } from "../lib/wiki";
import { classifyWiki, obsidianTag } from "../lib/wiki-classes";
import { demoResources } from "../lib/demo";
import type { WikiPage } from "../lib/brain-types";

const resource = { ...demoResources[0], tags: ["에이전트", "2026", "#오케스트 레이션"] };
const page = (over: Partial<WikiPage>): WikiPage => ({
  id: "00000000-0000-4000-8000-000000000001",
  slug: "agent-harness",
  title: "에이전트 하네스 설계",
  kind: "concept",
  summary: "에이전트에게 일을 맡길 때 지침·도구·점검을 묶는 하네스 구조를 설명한다.",
  body: "본문 ".repeat(40),
  source_ids: [resource.id],
  links: ["rag-basics", "missing-page"],
  caveats: [],
  revision: 2,
  protected: false,
  updated_at: "2026-09-28T00:00:00.000Z",
  ...over,
});

test("wiki frontmatter carries routing metadata: description, class, author, tags, related", () => {
  const pages = [
    page({}),
    page({ id: "00000000-0000-4000-8000-000000000002", slug: "rag-basics", title: "RAG 검색 근거", summary: "검색 기반 답변에서 근거를 확인하는 방법을 정리한다.", links: ["agent-harness"] }),
  ];
  const files = buildVault({ resources: [resource], pages, issues: [], items: [], tasks: [] });
  const doc = files["wiki/agent-harness.md"];
  const head = doc.slice(0, doc.indexOf("\n---\n", 4));
  assert.match(head, /description: "에이전트에게 일을 맡길 때/);
  assert.match(head, /class: "200"/);
  assert.match(head, /author: "llm"/);
  assert.match(head, /tags: \["에이전트","n2026","오케스트-레이션"\]/);
  // 없는 문서로의 링크는 머리말에 싣지 않는다.
  assert.match(head, /related: \["\[\[wiki\/rag-basics\]\]"\]/);
  assert.ok(!head.includes("\t"), "YAML 머리말에 탭을 쓰지 않는다");
  // 목차는 분류 번호로 묶인다.
  assert.ok(files["index.md"].includes("### 200 에이전트·자동화 워크플로"));
  assert.ok(files["index.md"].includes("### 500 지식관리·검색"));
  assert.ok(files["SCHEMA.md"].includes("## 십진 분류 번호"));
  assert.ok(files["AGENTS.md"].includes("## 읽는 순서"));
  assert.ok(files["CLAUDE.md"].startsWith("@AGENTS.md"));
  // 학습 노트 태그도 Obsidian 규칙에 맞춘다.
  assert.match(files["library/" + resource.id + ".md"], /tags: \["에이전트","n2026","오케스트-레이션"\]/);
});

test("classification is deterministic and falls back to 000 when nothing matches", () => {
  assert.equal(classifyWiki("유튜브 광고 수익").code, "400");
  const none = classifyWiki("zzz qqq");
  assert.equal(none.code, "000");
  assert.equal(none.matched, false);
  assert.equal(obsidianTag("  #AI 에이전트,팀 "), "AI-에이전트-팀");
  assert.equal(obsidianTag("###"), "");
});

test("lint flags thin descriptions and unclassifiable pages", () => {
  const checks = wikiLint(
    [page({ title: "zzz", slug: "zzz", summary: "짧음", links: [] })],
    [{ id: resource.id, updated_at: "2026-01-01T00:00:00.000Z" }],
  );
  const kinds = checks.map((c) => c.kind);
  assert.ok(kinds.includes("meta"));
  assert.ok(kinds.includes("class"));
});
