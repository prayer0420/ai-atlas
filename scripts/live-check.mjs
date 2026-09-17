// Explicit deployment acceptance test. Creates one labelled starter lesson.
// Uses the owner's approved administrative access; never sends an email or sets a password.
import { createClient } from "@supabase/supabase-js";
import assert from "node:assert/strict";
const base = process.env.CHECK_URL;
const email = process.env.CHECK_EMAIL;
if (!base || !email || !process.argv.includes("--create-example"))
  throw new Error("CHECK_URL, CHECK_EMAIL and --create-example are required.");
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
const generated = await admin.auth.admin.generateLink({
  type: "magiclink",
  email,
  options: { redirectTo: base },
});
if (generated.error)
  throw new Error(
    "Owner test session creation failed: " + generated.error.code,
  );
const verified = await client.auth.verifyOtp({
  token_hash: generated.data.properties.hashed_token,
  type: "email",
});
if (verified.error || !verified.data.session)
  throw new Error("Owner test session verification failed");
const token = verified.data.session.access_token;
async function api(path, method = "GET", body) {
  const response = await fetch(base + "/api/resources" + path, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(290000),
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(
      `${method} ${path}: ${response.status} ${result.error || "Request failed"}`,
    );
  return result;
}
try {
  const raw =
    "[AI Atlas 시작 예제 · 기능 확인을 위해 작성한 교육용 원문]\nRAG는 Retrieval-Augmented Generation의 약자로, 검색으로 찾은 자료를 언어 모델의 답변 생성에 참고시키는 방법이다. 문서를 적절한 크기로 나누고 각 조각을 검색할 수 있게 저장한다. 사용자가 질문하면 관련 문서를 검색하고 질문과 함께 모델에 제공한다. 모델은 제공된 근거를 바탕으로 답변을 작성한다. 자료의 내용이나 검색 품질이 낮으면 틀린 답이 나올 수 있으므로, 근거 문서와 답변을 함께 확인해야 한다. 모델을 새로 학습시키는 파인튜닝과는 목적과 작동 방식이 다르다. RAG는 문서 기반 질의응답이나 사내 지식 검색에 활용할 수 있다. 개인정보나 비밀 문서를 외부 모델에 보내기 전에는 이용 권한과 데이터 처리 범위를 확인한다. 처음 연습할 때는 공개된 제품 설명서 몇 쪽으로 시작해, 정답이 있는 질문과 문서에 답이 없는 질문을 함께 시험하는 것이 좋다.";
  const created = await api("", "POST", {
    title: "시작 예제: RAG를 이해하는 첫 학습 노트",
    text: raw,
  });
  const id = created.resource.id;
  console.log("PASS authenticated save", id);
  const again = await api("", "POST", { text: raw });
  assert.equal(again.duplicate, true);
  assert.equal(again.resource.id, id);
  console.log("PASS duplicate detection");
  await api("/" + id, "PATCH", {
    favorite: true,
    learned: true,
    notes:
      "AI Atlas 배포 검증용 시작 예제입니다. 원문은 기능 확인을 위해 작성했으며, 외부 게시물을 수집한 자료가 아닙니다.",
  });
  const saved = (await api("/" + id)).resource;
  assert.equal(saved.favorite, true);
  assert.equal(saved.learned, true);
  const search = await api("?q=" + encodeURIComponent("배포 검증용"));
  assert.ok(search.resources.some((r) => r.id === id));
  console.log("PASS notes, flags, search and persistence");
  await api("/" + id, "DELETE");
  const trash = await api("?view=trash");
  assert.ok(trash.resources.some((r) => r.id === id));
  await api("/" + id, "PATCH", { restore: true, learned: false });
  console.log("PASS recoverable trash and restore");
  if (
    process.argv.includes("--analyze") &&
    created.resource.status !== "ready"
  ) {
    console.log("START actual AI analysis");
    const started = Date.now();
    const analyzed = (await api("/" + id + "/analyze", "POST", {})).resource;
    assert.equal(analyzed.status, "ready");
    assert.ok(analyzed.lesson.sections.length >= 3);
    assert.ok(analyzed.lesson.diagram.nodes.length >= 3);
    assert.ok(analyzed.lesson.quiz.length >= 2);
    console.log(
      "PASS actual AI lesson",
      JSON.stringify({
        model: analyzed.model,
        seconds: Math.round((Date.now() - started) / 1000),
        chapters: analyzed.lesson.sections.length,
        diagramNodes: analyzed.lesson.diagram.nodes.length,
        quiz: analyzed.lesson.quiz.length,
        title: analyzed.title,
      }),
    );
  }
} finally {
  await client.auth.signOut({ scope: "local" });
  console.log("Temporary verification session signed out");
}
