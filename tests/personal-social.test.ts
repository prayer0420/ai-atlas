import test from "node:test";
import assert from "node:assert/strict";
import { relevance, keyFor, needsRead, listingCode } from "../lib/personal-social";
test("Instagram relevance keeps technical material and excludes unrelated lifestyle", () => {
  assert.equal(relevance("Claude Code로 개발 자동화"), "include");
  assert.equal(relevance("Python 개발자가 만든 여행 계획 AI"), "include");
  assert.equal(relevance("여행갔는데 항상 보이는 사람 #도쿄"), "exclude");
  assert.equal(relevance("하나님께 드리는 기도"), "exclude");
  assert.equal(relevance("이 도구 꼭 보세요"), "uncertain");
  assert.equal(relevance("fair daily tips"), "uncertain");
});
test("personal identity ignores tracking and retries failures without resaving reviewed URLs", () => {
  assert.equal(keyFor("instagram_saved", "owner", "https://instagram.com/p/abc/?utm_source=test"), keyFor("instagram_saved", "owner", "https://www.instagram.com/p/abc/"));
  assert.equal(needsRead({ status: "saved", reason: "", checked_at: "" }), false);
  assert.equal(needsRead({ status: "excluded", reason: "", checked_at: "" }), false);
  assert.equal(needsRead({ status: "retry", reason: "", checked_at: "" }), true);
});
test("repost enumeration excludes quoted posts and traverses the list", async () => {
  const tree = '- region "칼럼 본문" [ref=e1]:\n  - generic [ref=e2]:\n    - link "2026년 9월 18일" [ref=e3]\n    - text: "first"\n    - link "2026년 9월 17일" [ref=e4]\n  - generic [ref=e5]:\n    - link "2026년 9월 16일" [ref=e6]';
  const read: string[] = []; let scrolled = 0;
  const page = { url: () => "https://www.threads.com/@owner/reposts", locator: (ref: string) => ({ getAttribute: async () => { read.push(ref); return '/@author/post/' + ref; }, scrollIntoViewIfNeeded: async () => {}, hover: async () => {} }), mouse: { wheel: async () => { scrolled++; } } };
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const result = await new AsyncFunction("snapshot", "atlasPersonalPage", listingCode("threads_reposts"))(async () => ({ tree }), page);
  assert.deepEqual(read, ["e3", "e6"]);
  assert.equal(result.rows.length, 2); assert.equal(scrolled, 1);
});
test("empty saved list differs from login failure", async () => {
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const run = (tree: string) => new AsyncFunction("snapshot", "atlasPersonalPage", listingCode("instagram_saved"))(async () => ({ tree }), {});
  assert.equal((await run('- heading "저장하기" [level=1]\n- text: "컬렉션에 사진과 동영상을 저장해보세요."')).hasContainer, true);
  assert.equal((await run('- textbox "비밀번호"')).blocked, "login_required");
});
