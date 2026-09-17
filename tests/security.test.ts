import test from "node:test";
import assert from "node:assert/strict";
import { isPublicAddress, sourceType, validateUrl } from "../lib/extract";
import { lessonSchema } from "../lib/types";
import { demoResources } from "../lib/demo";
import { youtubeId } from "../lib/youtube";
test("Rejects local and reserved addresses, including IPv6 tunneling", () => {
  for (const ip of [
    "127.0.0.1",
    "10.1.2.3",
    "172.16.5.1",
    "192.168.0.1",
    "169.254.169.254",
    "100.64.0.2",
    "0.0.0.0",
    "224.0.0.1",
    "::1",
    "::ffff:127.0.0.1",
    "fd00::1",
    "fe80::1",
    "2002:7f00:1::",
    "2001:db8::1",
    "not-an-ip",
  ])
    assert.equal(isPublicAddress(ip), false, ip);
  assert.equal(isPublicAddress("8.8.8.8"), true);
  assert.equal(isPublicAddress("2606:4700:4700::1111"), true);
});
test("Blocks credential-bearing URLs, internal hosts and dangerous schemes", () => {
  for (const url of [
    "file:///etc/passwd",
    "javascript:alert(1)",
    "https://user:pass@example.com",
    "http://localhost",
    "http://127.1",
    "http://2130706433",
    "http://[::1]",
    "http://192.168.1.1",
    "https://a.local",
    "https://example.com:8443",
  ])
    assert.throws(() => validateUrl(url), url);
  assert.equal(
    validateUrl("https://example.com/a#top").href,
    "https://example.com/a",
  );
});
test("Source classification respects hostname boundaries", () => {
  assert.equal(sourceType("https://www.youtube.com/watch?v=test"), "youtube");
  assert.equal(sourceType("https://youtube.com.evil.example/a"), "web");
  assert.equal(sourceType("https://instagram.com/x"), "instagram");
  assert.equal(sourceType("https://www.threads.com/x"), "threads");
  assert.equal(sourceType(""), "text");
});
test("YouTube identifiers accept individual videos, never arbitrary URLs", () => {
  assert.equal(youtubeId("https://youtu.be/abcdefghijk"), "abcdefghijk");
  assert.equal(
    youtubeId("https://www.youtube.com/shorts/abcdefghijk"),
    "abcdefghijk",
  );
  assert.equal(
    youtubeId("https://www.youtube.com/watch?v=abcdefghijk"),
    "abcdefghijk",
  );
  assert.equal(youtubeId("https://evil.example/watch?v=abcdefghijk"), null);
  assert.equal(youtubeId("https://youtube.com/@channel"), null);
  assert.equal(youtubeId("https://youtube.com/watch?v=../../admin"), null);
});
test("Education schema validates the complete example and rejects invalid answers", () => {
  const lesson = demoResources[0].lesson!;
  assert.equal(lessonSchema.safeParse(lesson).success, true);
  assert.equal(
    lessonSchema.safeParse({
      ...lesson,
      quiz: [{ ...lesson.quiz[0], answer: 4 }, lesson.quiz[1]],
    }).success,
    false,
  );
  assert.equal(
    lessonSchema.safeParse({
      ...lesson,
      diagram: { ...lesson.diagram, nodes: [] },
    }).success,
    false,
  );
});
