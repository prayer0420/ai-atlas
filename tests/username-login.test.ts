import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { usernameSchema } from "../lib/username";

test("login names normalize case and reject emails and unsupported identifiers", () => {
  assert.equal(usernameSchema.parse(" Atlas_01 "), "atlas_01");
  for (const value of ["me@example.com", "ab", "-atlas", "two words", "a".repeat(31), "<script>"])
    assert.equal(usernameSchema.safeParse(value).success, false);
});

test("login mapping is private, unique and throttles concurrent attempts without changing ownership", async () => {
  const db = new PGlite();
  const owner = "11111111-1111-4111-8111-111111111111";
  const other = "22222222-2222-4222-8222-222222222222";
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key); insert into auth.users values ('${owner}'), ('${other}');`);
    await db.exec(await readFile(new URL("../supabase/migrations/20260918065659_atlas_username_login.sql", import.meta.url), "utf8"));
    await db.query("insert into public.ai_atlas_login_names(user_id,username) values ($1,'atlas')", [owner]);
    await assert.rejects(() => db.query("insert into public.ai_atlas_login_names(user_id,username) values ($1,'atlas')", [other]));
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`set role ${role}`);
      await assert.rejects(() => db.query("select * from public.ai_atlas_login_names"));
      await assert.rejects(() => db.query("select public.ai_atlas_reserve_login('atlas')"));
      await assert.rejects(() => db.query("update public.ai_atlas_login_names set username='stolen'"));
      await db.exec("reset role");
    }
    await db.exec("set role service_role");
    const claims = await Promise.all(Array.from({ length: 12 }, () => db.query<{ id: string | null }>("select public.ai_atlas_reserve_login('atlas') as id")));
    assert.equal(claims.filter(x => x.rows[0].id === owner).length, 10);
    assert.equal((await db.query<{ id: string | null }>("select public.ai_atlas_reserve_login('unknown') as id")).rows[0].id, null);
    await db.exec("update public.ai_atlas_login_names set window_started_at=now()-interval '16 minutes'");
    assert.equal((await db.query<{ id: string }>("select public.ai_atlas_reserve_login('atlas') as id")).rows[0].id, owner);
    await db.exec("update public.ai_atlas_login_names set username='new_name'");
    assert.equal((await db.query<{ id: string | null }>("select public.ai_atlas_reserve_login('atlas') as id")).rows[0].id, null);
    assert.equal((await db.query<{ id: string }>("select public.ai_atlas_reserve_login('new_name') as id")).rows[0].id, owner);
  } finally { await db.close(); }
});
