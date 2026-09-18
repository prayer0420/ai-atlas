import test from "node:test";
import assert from "node:assert/strict";
import { messageFingerprint, newMessageIndexes } from "../lib/instagram-dm";

test("first DM connection establishes a baseline without importing old messages", () => {
  assert.deepEqual(newMessageIndexes(["old1", "old2"]), { indexes: [], baseline: true, anchorFound: true });
  assert.deepEqual(newMessageIndexes([]), { indexes: [], baseline: true, anchorFound: true });
});
test("DM delta only includes messages after the previous boundary", () => {
  assert.deepEqual(newMessageIndexes(["old1", "old2", "new1", "new2"], "old2"), { indexes: [2, 3], baseline: false, anchorFound: true });
  assert.deepEqual(newMessageIndexes(["old1", "old2"], "old2").indexes, []);
  assert.equal(newMessageIndexes(["new1", "new2"], "missing").anchorFound, false);
  assert.deepEqual(newMessageIndexes(["a", "same", "same"], "same", ["a", "same"]).indexes, [2]);
});
test("DM checkpoint stores an opaque digest and ignores ephemeral browser refs", () => {
  const first = messageFingerprint('- group:\n  - article "private message" [ref=e1]');
  assert.equal(first, messageFingerprint('- group:\n  - article "private message" [ref=e42] [focused]'));
  assert.match(first, /^[a-f0-9]{64}$/);
  assert.ok(!first.includes("private"));
  assert.notEqual(first, messageFingerprint('- group:\n  - article "different message" [ref=e1]'));
});
