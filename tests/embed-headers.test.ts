import test from "node:test";
import assert from "node:assert/strict";
import config from "../next.config";

test("NOA framing is limited to the dedicated page and exact loopback origins", async () => {
  const rules = await config.headers!();
  const framed = rules.filter(rule => rule.headers.some(header => header.key === "Content-Security-Policy"));
  assert.equal(framed.length, 1);
  assert.equal(framed[0].source, "/embed");
  const policy = framed[0].headers.find(header => header.key === "Content-Security-Policy")!.value;
  const origins = policy.replace(/;$/, "").split(/\s+/);
  assert.equal(origins.shift(), "frame-ancestors");
  assert.deepEqual(origins.sort(), ["http://127.0.0.1:4190", "http://localhost:4190"]);
  for (const untrusted of ["*", "http:", "https:", "http://127.0.0.1:4191", "https://example.com", "http://localhost.evil.test:4190"])
    assert.equal(origins.includes(untrusted), false);
});

test("normal routes and legacy browsers retain framing denial and existing response protections", async () => {
  const rules = await config.headers!();
  const defaults = rules.find(rule => rule.source === "/(.*)")!;
  const headers = Object.fromEntries(defaults.headers.map(header => [header.key, header.value]));
  assert.equal(headers["X-Frame-Options"], "DENY");
  assert.equal(headers["X-Content-Type-Options"], "nosniff");
  assert.equal(headers["Referrer-Policy"], "strict-origin-when-cross-origin");
  assert.equal(headers["Permissions-Policy"], "camera=(), microphone=(), geolocation=()");
  assert.equal(headers["Content-Security-Policy"], undefined);
});
