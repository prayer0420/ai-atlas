// Run with Node 24: node --env-file=.env.local scripts/database.mjs [--apply]
// SUPABASE_ACCESS_TOKEN must be a Supabase Management API token, not the service role key.
import { readFile } from "node:fs/promises";
const url = process.env.SUPABASE_URL;
const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!url || !token) {
  console.error(
    "SUPABASE_URL and SUPABASE_ACCESS_TOKEN are required. Do not paste tokens into the terminal command.",
  );
  process.exit(1);
}
const ref = new URL(url).hostname.split(".")[0];
async function sql(query) {
  const r = await fetch(
    `https://api.supabase.com/v1/projects/${ref}/database/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(30000),
    },
  );
  if (!r.ok) throw new Error(`Supabase Management API HTTP ${r.status}`);
  return r.json();
}
try {
  const state = await sql(
    "select to_regclass('public.ai_atlas_resources') as resources, to_regclass('public.ai_atlas_analysis_jobs') as jobs",
  );
  if (process.argv.includes("--apply")) {
    if (state[0]?.resources || state[0]?.jobs) {
      console.log(
        "Atlas tables already exist. Inspect the schema before applying another migration.",
      );
      process.exit(0);
    }
    const migration = await readFile(
      new URL(
        "../supabase/migrations/202609170001_ai_atlas.sql",
        import.meta.url,
      ),
      "utf8",
    );
    await sql(migration);
    console.log("AI Atlas migration applied.");
  } else console.log(JSON.stringify(state));
  const policies = await sql(
    "select tablename,policyname,cmd from pg_policies where tablename like 'ai_atlas_%' order by tablename,policyname",
  );
  console.log(JSON.stringify(policies, null, 2));
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
}
