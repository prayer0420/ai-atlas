import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
const alice = "11111111-1111-4111-8111-111111111111";
const bob = "22222222-2222-4222-8222-222222222222";
test("PostgreSQL migration: RLS isolation, soft delete, duplicates, quota and job concurrency", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      `create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$; grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated; insert into auth.users values ('${alice}'),('${bob}');`,
    );
    await db.exec(
      await readFile(
        new URL(
          "../supabase/migrations/202609170001_ai_atlas.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    await db.exec(
      `set role authenticated; set request.jwt.claim.sub='${alice}';`,
    );
    const inserted = await db.query<{ id: string }>(
      `insert into public.ai_atlas_resources(user_id,title,fingerprint) values ($1,'Alice private resource','fp-a') returning id`,
      [alice],
    );
    const id = inserted.rows[0].id;
    await assert.rejects(() =>
      db.query(
        `insert into public.ai_atlas_resources(user_id,title,fingerprint) values ($1,'not mine','bad')`,
        [bob],
      ),
    );
    await assert.rejects(() =>
      db.query(
        `insert into public.ai_atlas_resources(user_id,title,fingerprint) values ($1,'duplicate','fp-a')`,
        [alice],
      ),
    );
    await db.exec(`set request.jwt.claim.sub='${bob}';`);
    assert.equal(
      (await db.query(`select * from public.ai_atlas_resources`)).rows.length,
      0,
    );
    const changed = await db.query(
      `update public.ai_atlas_resources set title='stolen' where id=$1 returning id`,
      [id],
    );
    assert.equal(changed.rows.length, 0);
    await assert.rejects(() =>
      db.query(`select public.ai_atlas_claim_analysis($1,$2,20)`, [id, bob]),
    );
    await db.exec(`set request.jwt.claim.sub='${alice}';`);
    await assert.rejects(() =>
      db.query(`delete from public.ai_atlas_resources where id=$1`, [id]),
    );
    await db.query(
      `update public.ai_atlas_resources set notes='private learning memo',deleted_at=now() where id=$1`,
      [id],
    );
    assert.equal(
      (
        await db.query(
          `select * from public.ai_atlas_resources where deleted_at is null`,
        )
      ).rows.length,
      0,
    );
    await db.query(
      `update public.ai_atlas_resources set deleted_at=null where id=$1`,
      [id],
    );
    const restored = await db.query<{ notes: string; search_text: string }>(
      `select notes,search_text from public.ai_atlas_resources where id=$1`,
      [id],
    );
    assert.equal(restored.rows[0].notes, "private learning memo");
    assert.match(restored.rows[0].search_text, /learning memo/);
    await db.exec(`reset role; set role service_role;`);
    const claim = await db.query<{ job: string }>(
      `select public.ai_atlas_claim_analysis($1,$2,1) as job`,
      [id, alice],
    );
    assert.ok(claim.rows[0].job);
    await assert.rejects(
      () =>
        db.query(`select public.ai_atlas_claim_analysis($1,$2,1)`, [id, alice]),
      /ALREADY_RUNNING/,
    );
    await db.query(
      `update public.ai_atlas_resources set status='ready' where id=$1`,
      [id],
    );
    await assert.rejects(
      () =>
        db.query(`select public.ai_atlas_claim_analysis($1,$2,1)`, [id, alice]),
      /DAILY_LIMIT/,
    );
    await db.exec(`reset role; set role anon;`);
    await assert.rejects(() =>
      db.query("select * from public.ai_atlas_resources"),
    );
  } finally {
    await db.close();
  }
});
