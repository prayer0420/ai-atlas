import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
const base = process.env.CHECK_URL || "http://127.0.0.1:3210";
const config = await (await fetch(base + "/api/config")).json();
assert.equal(config.aiMode, "local");
assert.equal(config.database, true);
assert.equal((await fetch(base + "/api/automation")).status, 401);
assert.equal(
  (
    await fetch(base + "/api/automation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paused: true }),
    })
  ).status,
  401,
);
const manifest = await (await fetch(base + "/manifest.webmanifest")).json();
assert.equal(manifest.share_target.method, "GET");
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  options,
);
const client = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY,
  options,
);
const email = (process.env.ALLOWED_EMAILS || "").split(",")[0].trim();
const generated = await admin.auth.admin.generateLink({
  type: "magiclink",
  email,
  options: { redirectTo: base },
});
if (generated.error) throw Error("Owner session setup failed");
const verified = await client.auth.verifyOtp({
  token_hash: generated.data.properties.hashed_token,
  type: "email",
});
if (verified.error) throw Error("Owner session verification failed");
const api = async (path, body) => {
  const res = await fetch(base + path, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: "Bearer " + verified.data.session.access_token,
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const result = await res.json();
  assert.ok(res.ok, result.error);
  return { status: res.status, ...result };
};
try {
  const state = await api("/api/automation");
  assert.equal(state.mode, "local");
  assert.ok(Array.isArray(state.jobs));
  console.log(
    "PASS private automation status, local-only configuration, manifest and anonymous access checks",
  );
  if (process.argv.includes("--enqueue")) {
    const resources = await api("/api/resources?q=RAG");
    const resource = resources.resources.find(
      (r) => r.source_type === "text" && r.title.includes("RAG"),
    );
    assert.ok(resource, "Existing RAG starter lesson required");
    const first = await api(`/api/resources/${resource.id}/analyze`, {});
    const again = await api(`/api/resources/${resource.id}/analyze`, {});
    assert.equal(first.status, 202);
    assert.equal(first.queued, true);
    assert.equal(first.job_id, again.job_id);
    console.log("PASS analysis queued once with an addressable durable job");
  }
  const wiki = await api("/api/brain?view=wiki");
  console.log(
    "Wiki pages:",
    wiki.pages.length,
    "Worker online:",
    state.online,
    "Pending:",
    state.pending,
  );
} finally {
  await client.auth.signOut({ scope: "local" });
}
