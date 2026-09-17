// Read-only live smoke checks. Never logs keys or raw resource contents.
import assert from "node:assert/strict";
const base = process.env.CHECK_URL || "http://127.0.0.1:3210";
const root = await fetch(base);
assert.equal(root.status, 200);
console.log("PASS homepage HTTP 200");
const config = await (await fetch(base + "/api/config")).json();
assert.ok(typeof config.database === "boolean");
console.log(
  "Connection state:",
  JSON.stringify({ database: config.database, ai: config.ai }),
);
const routes = [
  ["GET", "/api/resources"],
  ["POST", "/api/resources"],
  ["GET", "/api/resources/11111111-1111-4111-8111-111111111111"],
  ["PATCH", "/api/resources/11111111-1111-4111-8111-111111111111"],
  ["DELETE", "/api/resources/11111111-1111-4111-8111-111111111111"],
  ["POST", "/api/resources/11111111-1111-4111-8111-111111111111/analyze"],
];
for (const [method, path] of routes) {
  const response = await fetch(base + path, {
    method,
    headers: { "Content-Type": "application/json" },
    ...(["POST", "PATCH"].includes(method) ? { body: "{}" } : {}),
  });
  assert.equal(response.status, 401, `${method} ${path}`);
  console.log(`PASS unauthenticated ${method} blocked`);
}
const html = await root.text();
for (const secret of [
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  process.env.OPENAI_API_KEY,
].filter(Boolean)) {
  assert.equal(html.includes(secret), false);
  assert.equal(JSON.stringify(config).includes(secret), false);
}
console.log("PASS no server secrets in HTML or public config");
