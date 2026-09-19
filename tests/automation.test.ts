import test from "node:test";
import assert from "node:assert/strict";
import {
  readFile,
  mkdtemp,
  writeFile,
  readFile as read,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { syncLocalVault } from "../lib/vault-sync";
import { localStructured, parseHermesJson } from "../lib/local-ai";
import { z } from "zod";
import { cardSvg } from "../lib/card-image";
import { formatDaily } from "../lib/daily-format";
test("Local queue isolates users, deduplicates work, recovers expired leases, and fences old workers", async () => {
  const db = new PGlite();
  const alice = "11111111-1111-4111-8111-111111111111",
    bob = "22222222-2222-4222-8222-222222222222";
  try {
    await db.exec(
      `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;insert into auth.users values('${alice}'),('${bob}');`,
    );
    for (const file of [
      "202609170001_ai_atlas.sql",
      "20260917154144_atlas_daily_wiki.sql",
      "202609180001_local_automation.sql",
      "20260918233654_manual_analysis_unlimited.sql",
      "20260918235945_ai_provider_preference.sql",
    ])
      await db.exec(
        await readFile(
          new URL("../supabase/migrations/" + file, import.meta.url),
          "utf8",
        ),
      );
    const matches = await db.query<{ value: string }>(
      "select value from (values ('RAG는 근거를 검색합니다'),('paragraph'),('coverage'),('rag-fusion')) t(value) where value ~* '(^|[^a-z0-9])RAG([^a-z0-9]|$)'",
    );
    assert.deepEqual(
      matches.rows.map((r) => r.value),
      ["RAG는 근거를 검색합니다", "rag-fusion"],
    );
    const id = async (user: string) =>
      (
        await db.query<{ id: string }>(
          `select ai_atlas_enqueue($1,'daily','today') id`,
          [user],
        )
      ).rows[0].id;
    const a = await id(alice);
    assert.equal(a, await id(alice));
    assert.notEqual(a, await id(bob));
    await db.exec(
      `set role authenticated;set request.jwt.claim.sub='${alice}';`,
    );
    assert.equal(
      (await db.query("select * from ai_atlas_queue")).rows.length,
      1,
    );
    await assert.rejects(
      () => db.query(`select ai_atlas_take_job('${alice}')`),
      /permission denied/,
    );
    await assert.rejects(
      () => db.query(`update ai_atlas_queue set status='completed'`),
      /permission denied/,
    );
    await db.exec("reset role;");
    const claim = async () =>
      (
        await db.query<{ id: string; lease_token: string; attempts: number }>(
          `select * from ai_atlas_take_job('${alice}')`,
        )
      ).rows;
    const first = (await claim())[0];
    assert.equal(first.attempts, 1);
    assert.equal((await claim()).length, 0);
    await db.exec(
      `update ai_atlas_queue set lease_until=now()-interval '1 minute' where id='${a}'`,
    );
    const second = (await claim())[0];
    assert.equal(second.attempts, 2);
    assert.notEqual(second.lease_token, first.lease_token);
    assert.equal(
      (
        await db.query(
          `update ai_atlas_queue set status='completed' where id=$1 and lease_token=$2 returning id`,
          [a, first.lease_token],
        )
      ).rows.length,
      0,
    );
    await db.exec(
      `update ai_atlas_queue set attempts=3,lease_until=now()-interval '1 minute' where id='${a}'`,
    );
    assert.equal((await claim()).length, 0);
    assert.equal(
      (
        await db.query<{ status: string }>(
          `select status from ai_atlas_queue where id='${a}'`,
        )
      ).rows[0].status,
      "failed",
    );
    assert.notEqual(await id(alice), a);
    const collect = await db.query<{ id: string }>(
      `select ai_atlas_enqueue($1,'daily','manual:all',$2) id`,
      [alice, JSON.stringify({ action: "manual-collect", channel: "all" })],
    );
    assert.ok(collect.rows[0].id);
    for (let i = 0; i < 65; i++)
      await db.query(
        `select ai_atlas_enqueue($1,'analyze',$2,$3)`,
        [
          alice,
          `manual-${i}`,
          JSON.stringify({
            resourceId: "33333333-3333-4333-8333-333333333333",
            manual: true,
          }),
        ],
      );
    assert.equal(
      (
        await db.query<{ count: number }>(
          `select count(*)::int as count from ai_atlas_queue where user_id=$1 and kind='analyze'`,
          [alice],
        )
      ).rows[0].count,
      65,
    );
  } finally {
    await db.close();
  }
});
test("Hermes provider output accepts plain or fenced JSON and rejects prose-only output", () => {
  assert.deepEqual(parseHermesJson('{"answer":"ok"}'), { answer: "ok" });
  assert.deepEqual(parseHermesJson('```json\n{"answer":"ok"}\n```'), {
    answer: "ok",
  });
  assert.throws(() => parseHermesJson("완료했습니다"), /no JSON object/);
});
test("Local inference consumes split streaming JSON, preserves Korean UTF-8, and never calls a paid provider", async () => {
  const original = globalThis.fetch;
  const encoded = new TextEncoder().encode(
    JSON.stringify({ message: { content: '{"answer":"안녕하세요"}' } }) +
      "\n" +
      JSON.stringify({
        done: true,
        done_reason: "stop",
        eval_count: 9,
        prompt_eval_count: 20,
      }) +
      "\n",
  );
  try {
    globalThis.fetch = async (url, init) => {
      assert.equal(url, "http://127.0.0.1:11434/api/chat");
      assert.equal(JSON.parse(init?.body as string).stream, true);
      return new Response(
        new ReadableStream({
          start(controller) {
            for (let i = 0; i < encoded.length; i += 5)
              controller.enqueue(encoded.slice(i, i + 5));
            controller.close();
          },
        }),
      );
    };
    const result = await localStructured(
      z.object({ answer: z.string() }),
      "한국어",
      {},
      100,
    );
    assert.equal(result.value.answer, "안녕하세요");
    assert.equal(result.output_tokens, 9);
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          message: { content: '{"answer":"unfinished"}' },
          done: true,
          done_reason: "length",
        }) + "\n",
      );
    await assert.rejects(
      () => localStructured(z.object({ answer: z.string() }), "", {}, 100),
      /출력이 길어/,
    );
  } finally {
    globalThis.fetch = original;
  }
});
test("Archived card images escape source text and preserve the complete message", () => {
  const svg = cardSvg(
    {
      feed_id: "11111111-1111-4111-8111-111111111111",
      headline: "Test",
      takeaway: "Test",
      concepts: [],
      quiz: { question: "?", answer: "!" },
      slides: [
        {
          kind: "hook",
          title: '<script> & "title"',
          body: "본문 ".repeat(60),
          bullets: ["내용"],
        },
      ],
    },
    0,
    undefined,
    "2026-09-18",
    "ai",
  );
  assert.ok(!svg.includes("<script>"));
  assert.ok(svg.includes("&lt;script&gt;"));
  assert.ok(svg.includes('width="1080" height="1350"'));
  assert.ok(svg.includes('role="img"'));
});
test("Daily cards keep their source and end in the actual recall question", () => {
  const story = {
    feed_id: "11111111-1111-4111-8111-111111111111",
    headline: "주제",
    takeaway: "자료의 주장",
    concepts: [],
    quiz: { question: "무엇을 배웠나요?", answer: "핵심 설명" },
    slides: [
      {
        kind: "hook" as const,
        title: "처음",
        body: "원문의 설명",
        bullets: [],
      },
      {
        kind: "explain" as const,
        title: "다음",
        body: "개념 설명",
        bullets: [],
      },
      {
        kind: "check" as const,
        title: "마지막",
        body: "질문이 아닌 반복 문장",
        bullets: [],
      },
    ],
  };
  const formatted = formatDaily(
    { title: "한 소식만 가리키는 제목", introduction: "", stories: [story] },
    [],
    "2026-09-18",
  );
  assert.equal(formatted.title, "오늘의 AI · 2026-09-18");
  assert.equal(formatted.stories[0].slides.at(-1)?.body, story.quiz.question);
  assert.equal(formatted.stories[0].slides[1].body, story.slides[1].body);
  assert.ok(formatted.stories[0].takeaway.startsWith("출처의 설명:"));
});
test("Automatic Obsidian sync updates generated files and preserves user edits and immutable raw sources", async () => {
  const root = await mkdtemp(join(tmpdir(), "atlas-sync-test-"));
  try {
    assert.deepEqual(
      await syncLocalVault(root, {
        "wiki/test.md": "first",
        "raw/source.md": "original",
        "personal/note.md": "mine",
      }),
      { written: 3, conflicts: 0 },
    );
    await writeFile(join(root, "wiki/test.md"), "user edited");
    const result = await syncLocalVault(root, {
      "wiki/test.md": "new generation",
      "raw/source.md": "changed source",
      "personal/note.md": "replacement",
      "wiki/new.md": "new",
    });
    assert.deepEqual(result, { written: 1, conflicts: 1 });
    assert.equal(await read(join(root, "raw/source.md"), "utf8"), "original");
    assert.equal(await read(join(root, "wiki/test.md"), "utf8"), "user edited");
    assert.equal(await read(join(root, "personal/note.md"), "utf8"), "mine");
    assert.deepEqual(await syncLocalVault(root, { "wiki/new.md": "updated" }), {
      written: 1,
      conflicts: 0,
    });
    await assert.rejects(
      () => syncLocalVault(root, { "../outside.md": "bad" }),
      /Invalid vault path/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
