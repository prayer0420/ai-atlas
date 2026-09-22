import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { POST as save } from "../app/api/resources/route";
import { learningProgress } from "../lib/learning-progress";

const old = "2026-09-20T00:00:00Z",
  now = Date.parse("2026-09-22T00:00:00Z");
test("A terminated queue attempt never leaves an old resource labelled as running", () => {
  const resource = {
    status: "analyzing" as const,
    updated_at: old,
    analysis_started_at: old,
  };
  assert.equal(
    learningProgress(
      resource,
      { status: "failed", created_at: old, finished_at: old },
      now,
    ).phase,
    "failed",
  );
  assert.equal(learningProgress(resource, undefined, now).action, "analyze");
  assert.equal(
    learningProgress(
      resource,
      { status: "queued", created_at: old, finished_at: null },
      now,
    ).phase,
    "queued",
  );
});
test("A queued retry and a fresh source edit do not inherit the previous failure", () => {
  const r = { status: "saved" as const, updated_at: "2026-09-22T00:00:00Z" };
  assert.equal(
    learningProgress(
      r,
      { status: "failed", created_at: old, finished_at: old },
      now,
    ).phase,
    "saved",
  );
  assert.equal(
    learningProgress(
      { ...r, status: "failed" },
      { status: "queued", created_at: old, finished_at: null },
      now,
    ).action,
    null,
  );
  assert.equal(
    learningProgress({ ...r, status: "needs_content" }, undefined, now).action,
    "source",
  );
});

for (const scenario of [
  "queued",
  "queue-fails",
  "save-only",
  "duplicate",
  "other-owner",
] as const) {
  test(`Save → processing flow: ${scenario}`, async (t) => {
    const vars = {
      SUPABASE_URL: "https://test.supabase.co",
      SUPABASE_ANON_KEY: "public-test-key",
      SUPABASE_SERVICE_ROLE_KEY: "test-server-key",
      ALLOWED_EMAILS: "owner@example.com",
      AI_PROVIDER: "local",
      LOCAL_AI_RUNTIME: "0",
    };
    const previous = Object.fromEntries(
      Object.keys(vars).map((k) => [k, process.env[k]]),
    );
    Object.assign(process.env, vars);
    const id = "11111111-1111-4111-8111-111111111111";
    const resource = {
      id,
      user_id: id,
      title: "Synthetic test source",
      status: "saved",
      updated_at: new Date().toISOString(),
    };
    let inserts = 0,
      queues = 0;
    const json = (data: unknown, status = 200) =>
      new Response(JSON.stringify(data), {
        status,
        headers: { "Content-Type": "application/json" },
      });
    t.mock.method(
      globalThis,
      "fetch",
      async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input),
          method = init?.method || "GET";
        if (url.includes("/auth/v1/user"))
          return json({
            id,
            email:
              scenario === "other-owner"
                ? "other@example.com"
                : "owner@example.com",
            aud: "authenticated",
            role: "authenticated",
            app_metadata: {},
            user_metadata: {},
            created_at: old,
          });
        if (url.includes("/rpc/ai_atlas_start_cards")) {
          queues++;
          return scenario === "queue-fails"
            ? json({ code: "P0001", message: "QUEUE_FULL" }, 400)
            : json({id,queue_id:id,state:"queued"});
        }
        if (url.includes("/ai_atlas_queue")) {
          assert.match(url, /user_id=eq\./);
          return json([]);
        }
        if (url.includes("/ai_atlas_card_runs")) {
          assert.match(url, /user_id=eq\./);
          return json([]);
        }
        if (url.includes("/ai_atlas_resources") && method === "POST") {
          inserts++;
          return json(resource, 201);
        }
        if (url.includes("/ai_atlas_resources"))
          return json(scenario === "duplicate" ? [resource] : []);
        throw new Error("Unexpected test request");
      },
    );
    try {
      const response = await save(
        new NextRequest("http://localhost/api/resources", {
          method: "POST",
          headers: {
            Authorization: "Bearer synthetic-test-token",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            text: "공개 문서를 검색하여 답변에 참고하는 방법을 설명하는 합성 검증 자료입니다. 실제 개인 자료가 아니며, 검색된 원문과 생성된 답변을 대조하여 정확성을 확인합니다.",
            analyze: scenario !== "save-only",
          }),
        }),
      );
      const result = await response.json();
      if (scenario === "other-owner") {
        assert.equal(response.status, 403);
        assert.equal(inserts, 0);
        assert.equal(queues, 0);
      } else if (scenario === "duplicate") {
        assert.equal(result.duplicate, true);
        assert.equal(inserts, 0);
        assert.equal(queues, 0);
      } else {
        assert.equal(response.status, 201);
        assert.equal(inserts, 1);
        assert.equal(result.resource.id, id);
        if (scenario === "queued") {
          assert.equal(queues, 1);
          assert.equal(result.queued, true);
          assert.equal(result.resource.progress.phase, "queued");
        }
        if (scenario === "queue-fails") {
          assert.ok(result.queueError);
          assert.equal(result.queued, undefined);
        }
        if (scenario === "save-only") assert.equal(queues, 0);
      }
    } finally {
      for (const [k, v] of Object.entries(previous))
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
    }
  });
}
