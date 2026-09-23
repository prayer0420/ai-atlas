import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { cardBriefSchema } from "../lib/card-workflow";
import { GET as profileGet, PUT as profilePut } from "../app/api/cards/profile/route";
import { POST as revise } from "../app/api/resources/[id]/cards/revision/route";
import { NextRequest } from "next/server";
const alice = "11111111-1111-4111-8111-111111111111", bob = "22222222-2222-4222-8222-222222222222";

test("brand and revision APIs deny anonymous and other owner; validate and scope saved profile", async (t) => {
  for (const route of [profileGet, profilePut, revise]) {
    assert.equal((await route(new NextRequest("http://localhost/api/cards/profile"), { params: Promise.resolve({ id: alice }) })).status, 401);
  }
  const vars = { SUPABASE_URL: "https://test.supabase.co", SUPABASE_ANON_KEY: "test-public", SUPABASE_SERVICE_ROLE_KEY: "test-private", ALLOWED_EMAILS: "owner@example.com" };
  const previous = Object.fromEntries(Object.keys(vars).map((k) => [k, process.env[k]]));
  Object.assign(process.env, vars);
  let owner = false, writes = 0;
  t.mock.method(globalThis, "fetch", async (url: any, init: any) => {
    if (String(url).includes("/auth/v1/user")) return Response.json({ id: alice, email: owner ? "owner@example.com" : "other@example.com" });
    assert.match(String(url), /ai_atlas_preferences/);
    if (init?.method === "POST") {
      const profile = JSON.parse(init.body);
      assert.equal(profile.user_id, alice);
      assert.equal(profile.card_profile.required, "");
      assert.equal(profile.card_profile.brand, "브랜드");
      writes++;
    } else assert.match(String(url), /user_id=eq.11111111/);
    return Response.json({ card_profile: { design: "cream" } });
  });
  const request = (data?: any) => new NextRequest("http://localhost/api/cards/profile", { method: data ? "PUT" : "GET", headers: { Authorization: "Bearer synthetic-token", "Content-Type": "application/json" }, ...(data ? { body: JSON.stringify(data) } : {}) });
  try {
    for (const route of [profileGet, profilePut, revise]) assert.equal((await route(request({}), { params: Promise.resolve({ id: alice }) })).status, 403);
    owner = true;
    assert.equal((await profileGet(request())).status, 200);
    assert.equal((await profilePut(request({ brand: "브랜드", required: "이번 주제 전용" }))).status, 200);
    assert.equal((await profilePut(request({ brand: "x".repeat(41) }))).status, 400);
    assert.equal((await profilePut(request({ user_id: bob }))).status, 400);
    assert.equal((await profilePut(request({ brand: "x".repeat(310000) }))).status, 413);
    assert.equal((await revise(request({ runId: "invalid" }), { params: Promise.resolve({ id: alice }) })).status, 400);
    assert.equal(writes, 1);
  } finally { for (const [k, value] of Object.entries(previous)) if (value === undefined) delete process.env[k]; else process.env[k] = value; }
});

test("revision transaction retains finished version, fences stale edits and enforces owner and manual quota", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;insert into auth.users values('${alice}'),('${bob}');`);
    for (const file of ["202609170001_ai_atlas.sql", "20260917154144_atlas_daily_wiki.sql", "202609180001_local_automation.sql", "20260918233654_manual_analysis_unlimited.sql", "20260922023826_card_goal_workflows.sql", "20260922030330_card_goal_queue_failure_sync.sql", "20260922051137_card_creation_policy.sql", "20260922054708_parallel_cards_progress.sql", "20260923003320_card_studio_brand_revision.sql"])
      await db.exec(await readFile(`supabase/migrations/${file}`, "utf8"));
    const resource = (await db.query<any>("insert into ai_atlas_resources(user_id,title,raw_text,fingerprint) values($1,'Synthetic','source','revision') returning id", [alice])).rows[0];
    const brief = cardBriefSchema.parse({});
    const base = (await db.query<any>("select * from ai_atlas_request_cards($1,$2,$3,'manual','v1')", [alice, resource.id, JSON.stringify(brief)])).rows[0];
    await db.query("update ai_atlas_queue set status='completed' where id=$1", [base.queue_id]);
    await db.query("update ai_atlas_card_runs set state='completed',node='done',created_at=now()-interval '1 minute' where id=$1", [base.id]);
    const data = { story: { cards: Array.from({ length: 8 }, () => ({})) }, qa: { passed: true } };
    const revision = async (user = alice, version = base.revision, content = data) => (await db.query<any>("select * from ai_atlas_revise_cards($1,$2,$3,$4,$5,$6,'v2')", [user, resource.id, base.id, version, JSON.stringify({ ...brief, design: "cream" }), JSON.stringify(content)])).rows[0];
    await assert.rejects(() => revision(bob), /RESOURCE_NOT_FOUND/);
    await assert.rejects(() => revision(alice, base.revision + 1), /BASE_CHANGED/);
    await assert.rejects(() => revision(alice, base.revision, {} as any), /INVALID_REVISION/);
    const child = await revision();
    assert.equal(child.data.parentRunId, base.id);
    assert.equal(child.data.qa, undefined);
    assert.equal(child.node, "render");
    assert.equal(child.origin, "manual");
    assert.equal((await db.query<any>("select state from ai_atlas_card_runs where id=$1", [base.id])).rows[0].state, "completed");
    await assert.rejects(() => revision(), /BASE_CHANGED|ALREADY_RUNNING/);
    await db.query("update ai_atlas_queue set status='failed' where id=$1", [child.queue_id]);
    await db.query("update ai_atlas_card_runs set state='waiting_input' where id=$1", [child.id]);
    const retry = await revision();
    await db.query("update ai_atlas_queue set status='failed' where id=$1", [retry.queue_id]);
    await db.query("update ai_atlas_card_runs set state='failed',data='{}',created_at=now()+interval '1 minute' where id=$1", [retry.id]);
    await assert.rejects(() => revision(), /BASE_CHANGED/); // absent parent must not bypass fence with SQL NULL
    assert.equal((await db.query("select * from ai_atlas_card_daily_usage")).rows.length, 0);
    await db.query("insert into ai_atlas_preferences(user_id,card_profile) values($1,'{\"brand\":\"private\"}')", [alice]);
    await db.exec(`grant select on ai_atlas_preferences to authenticated;set role authenticated;set request.jwt.claim.sub='${bob}'`);
    assert.equal((await db.query("select * from ai_atlas_preferences")).rows.length, 0);
    await assert.rejects(() => revision(), /permission denied/);
    await db.exec("set role anon");
    await assert.rejects(() => revision(), /permission denied/);
  } finally { await db.close(); }
});
