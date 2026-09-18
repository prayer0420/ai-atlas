import test from "node:test";
import assert from "node:assert/strict";
import { parseSocialPage, socialUrl, socialBrowserCode } from "../lib/social-capture";
const body = "AI 자동화를 시작할 때에는 반복 업무의 입력과 출력을 먼저 정의하고 작은 작업부터 실행합니다. 결과에 근거가 있는지 검토하고 실패한 부분은 기록하여 다음 실행에 반영합니다.";
test("social capture only accepts canonical public post URLs", () => {
  assert.equal(socialUrl("https://threads.net/@author/post/abc?utm_source=x").url, "https://www.threads.com/@author/post/abc/");
  for (const url of ["https://instagram.com.evil.test/p/abc", "https://www.instagram.com/direct/inbox/", "https://user:secret@instagram.com/p/abc", "http://instagram.com/p/abc", "https://127.0.0.1/p/abc"]) assert.throws(() => socialUrl(url));
});
test("Threads captures the first post and excludes replies", () => {
  const result = parseSocialPage({ url: "https://www.threads.com/@author/post/abc", tree: `- region "칼럼 본문" [ref=e1]:\n  - generic [ref=e2]:\n    - link "2026. 9. 18. 오후 1:00" [ref=e3]\n    - text: "${body}"\n    - button [ref=e4]:\n      - img "좋아요"\n      - text: "12"\n  - generic [ref=e5]:\n    - text: "${"댓글입니다 ".repeat(40)}"` });
  assert.equal(result.status, "read");
  assert.ok(result.item?.text.includes(body));
  assert.ok(!result.item?.text.includes("댓글입니다"));
  assert.equal(result.item?.metrics.likes, 12);
});
test("Instagram excludes comments and marks images as not analyzed", () => {
  const result = parseSocialPage({ url: "https://instagram.com/p/abc/", tree: `- main:\n  - generic [ref=e1] [scrollable]:\n    - text: "${body}"\n    - button [ref=e2]:\n      - img "댓글 더 읽어들이기"\n    - text: "${"광고성 댓글 ".repeat(60)}"\n  - region: "좋아요  305 개"` });
  assert.equal(result.status, "read");
  assert.equal(result.item?.metrics.likes, 305);
  assert.ok(!result.item?.text.includes("광고성 댓글"));
  assert.ok(result.item?.text.includes("미분석"));
});
test("login screens and search snippets never become saved evidence", () => {
  const result = parseSocialPage({ url: "https://instagram.com/p/abc/", tree: `- title: "${body}"\n- textbox "비밀번호"\n- button "로그인"` });
  assert.equal(result.status, "login_required");
  assert.equal(result.item, undefined);
});
test("a short Threads post must not be replaced by its longer quote", () => {
  const result = parseSocialPage({ url: "https://threads.com/@author/post/abc", tree: `- region "칼럼 본문":\n  - generic [ref=e1]:\n    - text: "짧은 본문"\n    - link [ref=e2]:\n      - text: "${body}"` });
  assert.equal(result.item, undefined);
});
test("logged-in Instagram skips the image carousel and longer replies", () => {
  const result = parseSocialPage({ url: "https://instagram.com/p/abc/", tree: `- main:\n  - generic [ref=e1] [scrollable]:\n    - list:\n      - listitem\n  - generic [ref=e2] [scrollable]:\n    - text: "${body}"\n    - text: "${"댓글입니다 ".repeat(60)}"` });
  assert.equal(result.status, "read");
  assert.ok(result.item?.text.includes(body));
  assert.ok(!result.item?.text.includes("댓글입니다"));
});
test("Threads injected home view resolves only the first post permalink", async () => {
  const tree = `- region "칼럼 본문" [ref=e1]:\n  - generic [ref=e2]:\n    - link "2026년 9월 18일" [ref=e3]\n    - text: "${body}"\n  - generic [ref=e4]:\n    - link "2026년 9월 18일" [ref=e5]\n    - text: "${body.repeat(2)}"`;
  const output: string[] = [];
  const page = { url: () => "https://www.threads.com/?injected_media_ids=123", locator: (ref: string) => ({ getAttribute: async () => { assert.equal(ref, "e3"); return "/@author/post/abc"; } }) };
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  await new AsyncFunction("openTab", "closeTab", "snapshot", "sleep", "console", socialBrowserCode("threads", 1, "https://www.threads.com/@author/post/abc"))(
    async () => page, async () => {}, async () => ({ tree }), async () => {}, { log: (line: string) => output.push(line) },
  );
  const result = JSON.parse(output[0].slice("ATLAS_SOCIAL_RESULT=".length));
  assert.equal(result.pages[0].url, "https://www.threads.com/@author/post/abc");
  assert.equal(parseSocialPage(result.pages[0]).item?.title, body.slice(0, 100));
});
test("browser code has valid JS and clamps per-platform work", () => {
  const code = socialBrowserCode("instagram", 100);
  assert.ok(code.includes("limit=3"));
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  assert.doesNotThrow(() => new AsyncFunction(code));
  assert.throws(() => socialBrowserCode("threads", 1, "https://instagram.com/p/abc/"));
});
