import test from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import sharp from "sharp";
import {
  cardBriefSchema,
  validateStoryboard,
  recoveryFor,
  CardWorkflowError,
  imagePrompt,
  type Storyboard,
} from "../lib/card-workflow";
import { renderCard } from "../lib/card-renderer";
import { NextRequest } from "next/server";
import {
  GET as cardsGet,
  POST as cardsPost,
} from "../app/api/resources/[id]/cards/route";
import { GET as assetGet } from "../app/api/resources/[id]/cards/asset/route";
import { assertCardPath } from "../lib/card-service";
const alice = "11111111-1111-4111-8111-111111111111",
  bob = "22222222-2222-4222-8222-222222222222";
const source =
  "자료를 모으는 것만으로 내용이 정리되지는 않습니다. 읽을 사람과 전하고 싶은 내용을 정해야 합니다. 한 장에는 하나의 생각만 담습니다. 문구를 짧게 줄이고 장면에 맞게 구도를 고릅니다. 조건과 한계를 생략하지 않습니다. 마지막에는 한 가지 행동을 제안합니다. 출처는 별도로 남기고 이미지를 확인합니다.";
export const fixtureStory: Storyboard = {
  direction:
    "친한 동료에게 설명하듯 담백하게 이어갑니다. 종이색과 선명한 색을 사용한 편집형 PNG 이미지로 내용을 보여줍니다.",
  narrative:
    "모아 둔 자료가 잘 읽히지 않는 상황에서 시작해 독자와 핵심을 정하고, 한 장씩 나누어 출처와 함께 확인하는 흐름입니다.",
  cards: [
    {
      role: "공감",
      title: "저장한 다음은?",
      copy: "자료를 모았는데, 무슨 말을 전할지는 아직 흐릿할 수 있어요.",
      layout: "scene",
      items: [],
    },
    {
      role: "불편",
      title: "자료가 쌓일수록",
      copy: "읽을 사람과 전하고 싶은 내용을 먼저 골라 보세요.",
      layout: "stack",
      items: [
        { label: "읽을 사람", detail: "누구에게 필요한가요?" },
        { label: "전할 내용", detail: "어떤 생각을 남길까요?" },
      ],
    },
    {
      role: "개념",
      title: "한 장, 한 가지",
      copy: "여러 생각을 한꺼번에 담으면 핵심을 놓치기 쉬워요.",
      layout: "relation",
      items: [
        { label: "생각 하나", detail: "핵심을 골라요" },
        { label: "카드 한 장", detail: "짧게 전해요" },
      ],
    },
    {
      role: "부탁",
      title: "말하듯 써 보세요",
      copy: "동료에게 설명하듯 문구를 짧게 이어가 보세요.",
      layout: "conversation",
      items: [{ label: "문구부터", detail: "뜻이 통하는지 읽어 봐요" }],
    },
    {
      role: "사용법",
      title: "이렇게 나눠 봐요",
      copy: "생각이 자연스럽게 쉬어 가는 곳에서 장을 나눠요.",
      layout: "steps",
      items: [
        { label: "핵심 고르기", detail: "무엇을 남길지 정해요" },
        { label: "장면 나누기", detail: "생각마다 한 장씩" },
      ],
    },
    {
      role: "비교",
      title: "예쁨보다 이해",
      copy: "내용의 역할에 맞춰 사진과 글의 자리를 바꿔요.",
      layout: "comparison",
      items: [
        { label: "관계 설명", detail: "연결이 보이도록" },
        { label: "중요한 한마디", detail: "여백이 넉넉하도록" },
      ],
    },
    {
      role: "주의",
      title: "짧아도 빠짐없이",
      copy: "뜻을 바꾸는 조건과 한계는 카드에도 남겨야 해요.",
      layout: "statement",
      items: [],
    },
    {
      role: "마무리",
      title: "한 편부터 시작",
      copy: "출처를 남기고 이미지를 열어 잘 읽히는지 확인해 보세요.",
      layout: "closing",
      items: [],
    },
  ].map((c, i) => ({
    ...c,
    layout: c.layout as Storyboard["cards"][number]["layout"],
    condition: "",
    composition:
      "충분한 여백에 핵심 문구를 크게 배치하고 내용의 역할에 맞춰 항목을 연결한다.",
    evidence: source.split(". ")[i % 6].replace(/\.$/, ""),
  })),
  caption:
    "자료를 모은 뒤에는 읽을 사람과 남길 생각을 정해 보세요. 한 장에는 핵심 하나를 담고, 문구와 구도를 내용에 맞춰 고릅니다. 마지막으로 조건과 출처를 확인해요. 제공된 원문을 기준으로 정리했습니다.",
  caveats: ["설명용 편집 이미지이며 실제 서비스 화면이 아닙니다."],
};
test("card goal validates source evidence, exact count, prompts and bounded repair", () => {
  const brief = cardBriefSchema.parse({});
  assert.equal(brief.count, 8);
  assert.deepEqual(validateStoryboard(fixtureStory, brief, source), []);
  const broken = structuredClone(fixtureStory);
  broken.cards[2].evidence = "존재하지 않는 내용의 인용입니다";
  assert.match(
    validateStoryboard(broken, brief, source).join(" "),
    /3장.*원문/,
  );
  assert.equal(
    recoveryFor("source", new CardWorkflowError("SOURCE_REQUIRED", ""), 1)
      .state,
    "waiting_input",
  );
  assert.equal(
    recoveryFor("story", new CardWorkflowError("STORY_INVALID", ""), 3).state,
    "failed",
  );
  assert.equal(
    recoveryFor("render", new CardWorkflowError("IMAGE_INVALID", ""), 1)
      .strategy,
    "rewrite_story",
  );
  for (const [i, c] of fixtureStory.cards.entries()) {
    const p = imagePrompt(c, i, brief);
    assert.ok(p.includes(c.copy));
    assert.match(p, /1080×1350/);
    assert.match(p, /#F4F0E6/);
  }
});
test("card API, production events and image downloads require authentication", async () => {
  for (const route of [cardsGet, cardsPost, assetGet]) {
    const response = await route(
      new NextRequest("http://localhost/api/resources/" + alice + "/cards"),
      { params: Promise.resolve({ id: alice }) },
    );
    assert.equal(response.status, 401);
  }
  assert.throws(() =>
    assertCardPath(
      alice,
      { id: bob, manifest: [] } as any,
      `${bob}/${bob}/1.png`,
    ),
  );
  assert.throws(() =>
    assertCardPath(
      alice,
      { id: bob, manifest: [] } as any,
      `${alice}/${bob}/../1.png`,
    ),
  );
});
test("all eight layouts render separate Korean 1080x1350 PNGs without overflow", async () => {
  const brief = cardBriefSchema.parse({});
  await mkdir(".local/card-preview", { recursive: true });
  for (const [i, card] of fixtureStory.cards.entries()) {
    const result = await renderCard(card, i, brief);
    const metadata = await sharp(result.buffer).metadata();
    assert.equal(metadata.width, 1080);
    assert.equal(metadata.height, 1350);
    assert.equal(metadata.format, "png");
    assert.ok(result.bytes > 15000);
    await writeFile(`.local/card-preview/${i + 1}.png`, result.buffer);
  }
});
test("a two-line source condition is retained without a false overflow failure", async () => {
  const card = { ...fixtureStory.cards[0], condition: "원문의 Example & Company 맞춤 구축 사례입니다. 결과는 담당자가 검토하고 수정해야 합니다." };
  const result = await renderCard(card, 0, cardBriefSchema.parse({}));
  assert.ok(result.checked);
  assert.equal(result.height, 1350);
});
test("card graph PostgreSQL: dedupe, RLS, lease fencing, checkpoint resume and verified learning", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      `create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$; grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated; insert into auth.users values ('${alice}'),('${bob}');`,
    );
    for (const file of [
      "202609170001_ai_atlas.sql",
      "202609180001_local_automation.sql",
      "20260918233654_manual_analysis_unlimited.sql",
      "20260922023826_card_goal_workflows.sql",
      "20260922030330_card_goal_queue_failure_sync.sql",
    ])
      await db.exec(await readFile(`supabase/migrations/${file}`, "utf8"));
    const r = (
      await db.query<{ id: string; content_hash: string }>(
        "insert into ai_atlas_resources(user_id,title,raw_text,fingerprint) values($1,'Synthetic',$2,'card-test') returning id,content_hash",
        [alice, source],
      )
    ).rows[0];
    const brief = JSON.stringify(cardBriefSchema.parse({}));
    await db.exec("set role service_role");
    const start = async () =>
      (
        await db.query<any>(
          "select * from public.ai_atlas_start_cards($1,$2,$3::jsonb)",
          [alice, r.id, brief],
        )
      ).rows[0];
    const run = await start();
    assert.equal((await start()).id, run.id);
    assert.equal(
      (await db.query("select * from ai_atlas_queue")).rows.length,
      1,
    );
    const job = (
      await db.query<any>("select * from ai_atlas_take_job($1)", [alice])
    ).rows[0];
    const cp = async (
      revision: number,
      patch: unknown,
      event: unknown = {},
      lease = job.lease_token,
    ) =>
      (
        await db.query<any>(
          "select * from public.ai_atlas_checkpoint_cards($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb)",
          [
            alice,
            run.id,
            job.id,
            lease,
            revision,
            r.content_hash,
            JSON.stringify(patch),
            JSON.stringify(event),
          ],
        )
      ).rows[0];
    await assert.rejects(
      () => cp(run.revision, { node: "done", state: "completed" }),
      /INVALID_EDGE/,
    );
    await assert.rejects(
      () => cp(run.revision, { node: "analysis" }, {}, bob),
      /LEASE_LOST/,
    );
    const waiting = await cp(run.revision, {
      state: "waiting_input",
      error_code: "SOURCE_REQUIRED",
      data: {
        pendingRecovery: {
          node: "source",
          signature: "synthetic-source",
          strategy: "request_source",
        },
      },
    });
    assert.equal(
      (await db.query("select * from ai_atlas_recovery_rules")).rows.length,
      0,
    );
    await db.query("update ai_atlas_queue set status='completed' where id=$1", [
      job.id,
    ]);
    const resumed = await start();
    assert.equal(resumed.id, run.id);
    assert.equal(resumed.node, "source");
    const newJob = (
      await db.query<any>("select * from ai_atlas_take_job($1)", [alice])
    ).rows[0];
    job.id = newJob.id;
    job.lease_token = newJob.lease_token;
    const passed = await cp(
      resumed.revision,
      { node: "analysis", state: "running", data: {} },
      { recoveryOutcome: "success" },
    );
    assert.equal(
      (await db.query<any>("select successes from ai_atlas_recovery_rules"))
        .rows[0].successes,
      1,
    );
    await assert.rejects(
      () => cp(waiting.revision, { node: "analysis" }),
      /REVISION_CHANGED/,
    );
    let v = passed;
    for (const node of ["story", "render", "verify"])
      v = await cp(v.revision, { node });
    await assert.rejects(
      () =>
        cp(v.revision, {
          node: "done",
          state: "completed",
          data: { qa: { passed: true }, story: fixtureStory },
          manifest: [],
        }),
      /GOAL_INCOMPLETE/,
    );
    const manifest = Array.from({ length: 8 }, (_, index) => ({
      index,
      path: `${alice}/${run.id}/${index}.png`,
      sha256: "a".repeat(64),
      bytes: 20000,
      width: 1080,
      height: 1350,
      checked: true,
      layout: fixtureStory.cards[index].layout,
    }));
    await assert.rejects(
      () =>
        cp(v.revision, {
          node: "done",
          state: "completed",
          data: { qa: { passed: true }, story: fixtureStory },
          manifest: manifest.map((a) => ({ ...a, checked: false })),
        }),
      /GOAL_INCOMPLETE/,
    );
    const completed = await cp(v.revision, {
      node: "done",
      state: "completed",
      data: { qa: { passed: true }, story: fixtureStory },
      manifest,
    });
    assert.equal(completed.state, "completed");
    await db.query("update ai_atlas_queue set status='completed' where id=$1", [
      job.id,
    ]);
    assert.equal((await start()).id, run.id);
    await db.query(
      "update ai_atlas_resources set raw_text=raw_text||' 본문 변경' where id=$1",
      [r.id],
    );
    assert.equal(
      (
        await db.query<any>(
          "select card_state from ai_atlas_resources where id=$1",
          [r.id],
        )
      ).rows[0].card_state,
      null,
    );
    const fresh = await start();
    assert.notEqual(fresh.id, run.id);
    assert.equal(fresh.node, "source");
    await db.query("update ai_atlas_queue set status='failed' where id=$1", [
      fresh.queue_id,
    ]);
    assert.equal(
      (
        await db.query<any>(
          "select state from ai_atlas_card_runs where id=$1",
          [fresh.id],
        )
      ).rows[0].state,
      "failed",
    );
    await db.exec(
      `reset role;set role authenticated;set request.jwt.claim.sub='${bob}'`,
    );
    assert.equal(
      (await db.query("select * from ai_atlas_card_runs")).rows.length,
      0,
    );
    assert.equal(
      (await db.query("select * from ai_atlas_card_events")).rows.length,
      0,
    );
    assert.equal(
      (await db.query("select * from ai_atlas_recovery_rules")).rows.length,
      0,
    );
    await assert.rejects(
      () =>
        db.query("select ai_atlas_start_cards($1,$2,$3::jsonb)", [
          bob,
          r.id,
          brief,
        ]),
      /permission denied/,
    );
    await db.exec(`set request.jwt.claim.sub='${alice}'`);
    assert.equal(
      (await db.query("select * from ai_atlas_card_runs")).rows.length,
      2,
    );
    await assert.rejects(
      () => db.query("update ai_atlas_card_runs set state='completed'"),
      /permission denied/,
    );
  } finally {
    await db.close();
  }
});
