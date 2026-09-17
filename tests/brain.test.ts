import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { parseFeed, feedSources, kstDate } from "../lib/feeds";
import { buildVault, safeNoteName } from "../lib/vault";
import { demoResources } from "../lib/demo";
test("Daily feeds reject unsafe/old links, deduplicate tracking URLs and preserve real metrics", () => {
  const item = (url: string, date: string) =>
    `<entry><title>AI example</title><link href="${url}"/><published>${date}</published><media:statistics views="12345"/><media:description>Source text</media:description></entry>`;
  const xml =
    "<feed>" +
    item("https://youtube.com/watch?v=example&amp;utm_source=x", "2026-09-17") +
    item("https://youtube.com/watch?v=example", "2026-09-17") +
    item("http://127.0.0.1/private", "2026-09-17") +
    item("https://example.com/old", "2020-01-01") +
    "</feed>";
  const result = parseFeed(
    xml,
    feedSources[4],
    new Date("2026-09-18T00:00:00Z"),
  );
  assert.equal(result.length, 1);
  assert.equal(result[0].metrics.views, 12345);
  assert.equal(result[0].metrics.likes, undefined);
  assert.equal(kstDate(new Date("2026-09-17T15:00:00Z")), "2026-09-18");
});
test("Obsidian export preserves raw text safely and all generated links resolve", () => {
  const r = { ...demoResources[0], raw_text: "```\n[[malicious]]\n```" };
  const files = buildVault({
    resources: [r],
    pages: [],
    issues: [],
    items: [],
    tasks: [],
  });
  const raw = Object.keys(files).find((p) => p.startsWith("raw/"))!;
  assert.ok(files[raw].includes("````text\n" + r.raw_text + "\n````"));
  assert.ok(
    files["library/" + r.id + ".md"].includes("[[" + raw.slice(0, -3) + "|"),
  );
  assert.ok(JSON.parse(files["지식 지도.canvas"]).nodes);
  assert.equal(safeNoteName("CON"), "note-CON");
  assert.ok(!safeNoteName("../x\\y").includes("/"));
  const again = buildVault({
    resources: [{ ...r, raw_text: "updated" }],
    pages: [],
    issues: [],
    items: [],
    tasks: [],
  });
  assert.notEqual(
    Object.keys(again).find((p) => p.startsWith("raw/")),
    raw,
  );
});
test("Brain database enforces ownership, generation leases, retry limits and protected wiki revisions", async () => {
  const db = new PGlite();
  const alice = "11111111-1111-4111-8111-111111111111",
    bob = "22222222-2222-4222-8222-222222222222";
  try {
    await db.exec(
      `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;insert into auth.users values('${alice}'),('${bob}');`,
    );
    for (const f of [
      "202609170001_ai_atlas.sql",
      "20260917154144_atlas_daily_wiki.sql",
    ])
      await db.exec(
        await readFile(
          new URL("../supabase/migrations/" + f, import.meta.url),
          "utf8",
        ),
      );
    const a = (
      await db.query<{ id: string }>(
        `insert into ai_atlas_resources(user_id,title,fingerprint) values($1,'Mine','a') returning id`,
        [alice],
      )
    ).rows[0].id;
    const b = (
      await db.query<{ id: string }>(
        `insert into ai_atlas_resources(user_id,title,fingerprint) values($1,'Other','b') returning id`,
        [bob],
      )
    ).rows[0].id;
    await db.exec("set role service_role");
    const claim = async (key: string, limit = 10) =>
      (
        await db.query<{ id: string }>(
          `select ai_atlas_claim_task($1,'wiki',$2,$3) as id`,
          [alice, key, limit],
        )
      ).rows[0].id;
    const job = await claim("first");
    await assert.rejects(() => claim("parallel"), /ALREADY_RUNNING/);
    const draft = {
      slug: "rag",
      title: "RAG",
      kind: "concept",
      summary: "Evidence",
      body: "Body",
      source_ids: [a],
      links: [],
      caveats: [],
      expected_revision: 0,
    };
    const write = async (d: object) =>
      (
        await db.query<{ n: number }>(
          `select ai_atlas_write_wiki($1,$2::jsonb) as n`,
          [job, JSON.stringify([d])],
        )
      ).rows[0].n;
    await assert.rejects(
      () => write({ ...draft, source_ids: [b] }),
      /INVALID_SOURCES/,
    );
    assert.equal(await write(draft), 1);
    assert.equal(await write(draft), 0);
    assert.equal(await write({ ...draft, expected_revision: 1 }), 1);
    await db.query(
      `update ai_atlas_wiki_pages set protected=true where user_id=$1`,
      [alice],
    );
    assert.equal(await write({ ...draft, expected_revision: 2 }), 0);
    assert.equal(
      (await db.query("select * from ai_atlas_wiki_revisions")).rows.length,
      2,
    );
    await db.query(`update ai_atlas_tasks set status='failed' where id=$1`, [
      job,
    ]);
    await assert.rejects(() => claim("quota", 1), /DAILY_LIMIT/);
    await claim("first");
    await db.query(`update ai_atlas_tasks set status='failed' where id=$1`, [
      job,
    ]);
    await claim("first");
    await db.query(`update ai_atlas_tasks set status='failed' where id=$1`, [
      job,
    ]);
    await assert.rejects(() => claim("first"), /RETRY_LIMIT/);
    await db.query(
      `update ai_atlas_tasks set attempt_day=attempt_day-1 where id=$1`,
      [job],
    );
    await claim("first");
    assert.equal(
      (
        await db.query<{ n: number }>(
          `select daily_attempts as n from ai_atlas_tasks where id=$1`,
          [job],
        )
      ).rows[0].n,
      1,
    );
    await db.query(`update ai_atlas_tasks set status='completed' where id=$1`, [
      job,
    ]);
    assert.equal(await claim("first"), job);
    await db.exec(
      `reset role;set role authenticated;set request.jwt.claim.sub='${bob}';`,
    );
    assert.equal(
      (await db.query("select * from ai_atlas_wiki_pages")).rows.length,
      0,
    );
    await assert.rejects(() => claim("intrusion"));
    await assert.rejects(() =>
      db.exec(`update ai_atlas_wiki_pages set body='changed'`),
    );
    await db.exec(`set request.jwt.claim.sub='${alice}'`);
    assert.equal(
      (await db.query("select * from ai_atlas_wiki_pages")).rows.length,
      1,
    );
    await db.exec("reset role;set role anon");
    await assert.rejects(() => db.query("select * from ai_atlas_feed_items"));
  } finally {
    await db.close();
  }
});
