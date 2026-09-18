import test from "node:test";
import assert from "node:assert/strict";
import {
  cleanAuthCallbackUrl,
  parseAuthCallback,
} from "../lib/browser-auth";

test("browser auth recognizes implicit magic-link sessions", () => {
  assert.deepEqual(
    parseAuthCallback(
      "https://atlas.example/#access_token=access&refresh_token=refresh&type=magiclink",
    ),
    { kind: "implicit", accessToken: "access", refreshToken: "refresh" },
  );
});

test("browser auth recognizes PKCE callbacks and visible auth errors", () => {
  assert.deepEqual(
    parseAuthCallback("https://atlas.example/?code=one-time-code"),
    { kind: "pkce", code: "one-time-code" },
  );
  assert.deepEqual(
    parseAuthCallback(
      "https://atlas.example/#error=access_denied&error_description=Link%20expired",
    ),
    { kind: "error", message: "Link expired" },
  );
});

test("browser auth cleans credentials without removing application links", () => {
  assert.equal(
    cleanAuthCallbackUrl(
      "https://atlas.example/?resource=abc&code=secret#access_token=secret&panel=notes",
    ),
    "/?resource=abc#panel=notes",
  );
});
