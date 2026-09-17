// Authenticated acceptance check; no email is sent and no password is set.
import { createClient } from "@supabase/supabase-js";
import assert from "node:assert/strict";
import { unzipSync, strFromU8 } from "fflate";
import { mkdir, writeFile, access } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve, dirname } from "node:path";
const base = process.env.CHECK_URL || "http://127.0.0.1:3210";
const email = process.env.CHECK_EMAIL;
if (!email) throw Error("CHECK_EMAIL required");
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
const link = await admin.auth.admin.generateLink({
  type: "magiclink",
  email,
  options: { redirectTo: base },
});
if (link.error) throw Error("Session setup failed");
const verified = await client.auth.verifyOtp({
  token_hash: link.data.properties.hashed_token,
  type: "email",
});
if (verified.error || !verified.data.session)
  throw Error("Verification failed");
const api = async (path = "", body) => {
  const res = await fetch(base + "/api/brain" + path, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: "Bearer " + verified.data.session.access_token,
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(290000),
  });
  const data = await res.json();
  if (!res.ok) throw Error(res.status + " " + data.error);
  return data;
};
try {
  for (const path of [
    "/api/brain",
    "/api/brain/export",
    "/api/cron/daily",
    "/api/cron/wiki",
  ])
    assert.equal((await fetch(base + path)).status, 401);
  console.log("PASS anonymous requests blocked");
  let daily = await api("?view=daily");
  assert.equal(daily.sources.length, 6);
  console.log("PASS authenticated preferences and source catalog");
  if (process.argv.includes("--collect")) {
    const report = await api("", { action: "collect" });
    console.log(
      "Collection",
      JSON.stringify({
        mode: report.issue?.mode || report.mode,
        warning: report.issue?.warning || report.warning || null,
      }),
    );
    daily = await api("?view=daily");
  }
  assert.ok(daily.issues.length > 0, "Daily issue must exist");
  assert.ok(daily.items.length > 0);
  const issue = daily.issues[0],
    feed = daily.items.find((i) => i.id === issue.content.stories[0].feed_id);
  assert.ok(feed);
  const first = await api("", { action: "archive", id: feed.id });
  const second = await api("", { action: "archive", id: feed.id });
  assert.equal(first.resource_id, second.resource_id);
  await api("", { action: "review", id: feed.id, favorite: !feed.favorite });
  const changed = await api("?view=daily");
  assert.equal(
    changed.items.find((i) => i.id === feed.id).favorite,
    !feed.favorite,
  );
  await api("", { action: "review", id: feed.id, favorite: feed.favorite });
  console.log(
    "PASS daily saved, archive idempotent, review persisted",
    JSON.stringify({
      items: daily.items.length,
      stories: issue.content.stories.length,
      mode: issue.mode,
      sources: issue.source_report,
    }),
  );
  const wiki = await api("?view=wiki");
  assert.ok(Array.isArray(wiki.pages));
  console.log("PASS wiki and source integrity report");
  const exported = await api("/export");
  const files = Object.fromEntries(
    Object.entries(unzipSync(Buffer.from(exported.archive, "base64"))).map(
      ([p, bytes]) => [p, strFromU8(bytes)],
    ),
  );
  assert.ok(files["index.md"]);
  assert.ok(files["daily/" + issue.issue_date + ".md"]);
  assert.ok(
    !JSON.stringify(files).includes(process.env.SUPABASE_SERVICE_ROLE_KEY),
  );
  console.log("PASS private vault export", Object.keys(files).length, "files");
  if (process.env.VAULT_DIR) {
    const root = resolve(process.env.VAULT_DIR);
    let exists = false;
    try {
      await access(root);
      exists = true;
    } catch {}
    if (exists) throw Error("Refusing to overwrite existing vault");
    const manifest = {};
    for (const [p, text] of Object.entries(files)) {
      const target = resolve(root, p);
      assert.ok(
        target.startsWith(root + "\\") || target.startsWith(root + "/"),
      );
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, text);
      manifest[p] = createHash("sha256").update(text).digest("hex");
    }
    await writeFile(
      resolve(root, ".ai-atlas-manifest.json"),
      JSON.stringify(manifest, null, 2),
    );
    console.log("Created fresh Obsidian vault:", root);
  }
} finally {
  await client.auth.signOut({ scope: "local" });
  console.log("Temporary session signed out");
}
