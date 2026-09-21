import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { POST as setup } from "../app/api/auth/setup/route";
import { body, authenticate } from "../lib/server";
import { providerEnvironment } from "../lib/provider-env";

test("Anonymous requests cannot reach password setup, even with a known username", async () => {
  const response = await setup(new NextRequest("http://localhost/api/auth/setup", {
    method: "POST", body: JSON.stringify({username:"atlas",password:"test-only-not-a-real-password"}),
  }));
  assert.equal(response.status, 401);
});
test("Provider subprocess gets OS paths but no application credentials or injected startup variables", () => {
  const result = providerEnvironment({Path:"C:/bin",LOCALAPPDATA:"C:/Users/test/AppData/Local",SUPABASE_SERVICE_ROLE_KEY:"private",OPENAI_API_KEY:"private",CRON_SECRET:"private",NODE_OPTIONS:"--require malicious",PYTHONPATH:"malicious",HERMES_KANBAN_TASK:"injected"});
  assert.equal(result.Path,"C:/bin");
  for (const key of ["SUPABASE_SERVICE_ROLE_KEY","OPENAI_API_KEY","CRON_SECRET","NODE_OPTIONS","PYTHONPATH","HERMES_KANBAN_TASK"]) assert.equal(result[key],undefined);
});
test("Request body limit is enforced without Content-Length, including Korean UTF-8", async () => {
  const oversized = new NextRequest("http://localhost", {method:"POST",body:JSON.stringify({text:"가".repeat(110000)})});
  await assert.rejects(()=>body(oversized), (e:unknown)=>(e as {status:number}).status===413);
  const valid = new NextRequest("http://localhost",{method:"POST",body:JSON.stringify({text:"정상 입력"})});
  assert.deepEqual(await body(valid),{text:"정상 입력"});
});
test("A valid external Supabase account cannot access the private Atlas API", async (t) => {
  const previous = {SUPABASE_URL:process.env.SUPABASE_URL,SUPABASE_ANON_KEY:process.env.SUPABASE_ANON_KEY,ALLOWED_EMAILS:process.env.ALLOWED_EMAILS};
  process.env.SUPABASE_URL="https://unit-test.supabase.co";process.env.SUPABASE_ANON_KEY="public-test-key";process.env.ALLOWED_EMAILS="owner@example.com";
  t.mock.method(globalThis,"fetch",async()=>new Response(JSON.stringify({id:"11111111-1111-4111-8111-111111111111",email:"other@example.com",aud:"authenticated",role:"authenticated",app_metadata:{},user_metadata:{},created_at:new Date().toISOString()}),{status:200,headers:{"Content-Type":"application/json"}}));
  try { await assert.rejects(()=>authenticate(new NextRequest("http://localhost",{headers:{Authorization:"Bearer fake-unit-test-token"}})),(e:unknown)=>(e as {status:number}).status===403); }
  finally { for(const [key,value] of Object.entries(previous)) if(value===undefined) delete process.env[key]; else process.env[key]=value; }
});
