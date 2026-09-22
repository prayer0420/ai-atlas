import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { GET } from "../app/api/resources/[id]/cards/asset/route";

test("previous completed images stay downloadable during regeneration without crossing owner/source/version boundaries", async (t) => {
  const owner = "11111111-1111-4111-8111-111111111111";
  const resourceId = "22222222-2222-4222-8222-222222222222";
  const good = "33333333-3333-4333-8333-333333333333";
  const foreign = "44444444-4444-4444-8444-444444444444";
  const pending = "55555555-5555-4555-8555-555555555555";
  const stale = "66666666-6666-4666-8666-666666666666";
  const vars = { SUPABASE_URL: "https://test.supabase.co", SUPABASE_ANON_KEY: "public-test-key", SUPABASE_SERVICE_ROLE_KEY: "test-server-key", ALLOWED_EMAILS: "owner@example.com" };
  const previous = Object.fromEntries(Object.keys(vars).map((k) => [k, process.env[k]]));
  Object.assign(process.env, vars);
  const assetPath = `${owner}/${good}/0.png`;
  const rows = [
    { id: good, user_id: owner, resource_id: resourceId, input_hash: "current", state: "completed", manifest: [{ index: 0, path: assetPath }] },
    { id: foreign, user_id: foreign, resource_id: resourceId, input_hash: "current", state: "completed" },
    { id: pending, user_id: owner, resource_id: resourceId, input_hash: "current", state: "running" },
    { id: stale, user_id: owner, resource_id: resourceId, input_hash: "old", state: "completed" },
  ];
  let downloads = 0;
  let otherUser = false;
  const json = (value: unknown) => new Response(JSON.stringify(value), { headers: { "Content-Type": "application/json" } });
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
    const url = new URL(String(input));
    if (url.pathname === "/auth/v1/user") return json({ id: owner, email: otherUser ? "other@example.com" : "owner@example.com", aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-09-22T00:00:00Z" });
    if (url.pathname.endsWith("/ai_atlas_resources")) {
      assert.equal(url.searchParams.get("user_id"), `eq.${owner}`);
      assert.equal(url.searchParams.get("deleted_at"), "is.null");
      return json([{ id: resourceId, content_hash: "current" }]);
    }
    if (url.pathname.endsWith("/ai_atlas_card_runs")) {
      for (const [key, value] of Object.entries({ user_id: owner, resource_id: resourceId, input_hash: "current", state: "completed" }))
        assert.equal(url.searchParams.get(key), `eq.${value}`);
      return json(rows.filter((row) => ["id", "user_id", "resource_id", "input_hash", "state"].every((key) => !url.searchParams.has(key) || url.searchParams.get(key) === `eq.${row[key as keyof typeof row]}`)).slice(0, 1));
    }
    if (url.pathname.includes("/storage/v1/object/")) {
      assert.ok(url.pathname.endsWith(assetPath));
      downloads++;
      return new Response(new Uint8Array([137, 80, 78, 71]), { headers: { "Content-Type": "image/png" } });
    }
    throw new Error("Unexpected test request");
  });
  const get = (query: string, authenticated = true) => GET(new NextRequest(`http://localhost/api/resources/${resourceId}/cards/asset?index=0${query}`, { headers: authenticated ? { Authorization: "Bearer synthetic" } : {} }), { params: Promise.resolve({ id: resourceId }) });
  try {
    assert.equal((await get("")).status, 200);
    assert.equal((await get(`&run=${good}`)).status, 200);
    for (const id of [foreign, pending, stale]) assert.equal((await get(`&run=${id}`)).status, 409);
    assert.equal((await get("&run=malformed")).status, 400);
    assert.equal((await get(`&run=${good}`, false)).status, 401);
    otherUser = true;
    assert.equal((await get(`&run=${good}`)).status, 403);
    assert.equal(downloads, 2);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});
