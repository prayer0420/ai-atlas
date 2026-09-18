import { createHash } from "node:crypto";
import { z } from "zod";
import { admin, AppError, checkDb } from "./server";
import { aiConfigured } from "./ai-config";
import { structured, claimTask, aiProblem } from "./brain-ai";
import { wikiBundleSchema, type WikiPage } from "./brain-types";
import type { Resource } from "./types";
import { enqueue, queueLocally, localRuntime } from "./automation";
export function wikiLint(
  pages: WikiPage[],
  resources: { id: string; updated_at: string }[],
) {
  const known = new Set(pages.map((p) => p.slug)),
    sourceMap = new Map(resources.map((r) => [r.id, r]));
  return pages.flatMap((p) => {
    const checks: {
      page_id: string;
      title: string;
      kind: string;
      message: string;
    }[] = [];
    const add = (kind: string, message: string) =>
      checks.push({ page_id: p.id, title: p.title, kind, message });
    if (p.links.some((s) => !known.has(s)))
      add("broken", "연결 대상이 없는 위키 링크가 있습니다.");
    if (p.source_ids.some((id) => !sourceMap.has(id)))
      add("source", "휴지통으로 이동했거나 찾을 수 없는 출처가 있습니다.");
    if (
      p.source_ids.some(
        (id) => (sourceMap.get(id)?.updated_at || "") > p.updated_at,
      )
    )
      add("stale", "위키 작성 이후 원문 또는 메모가 변경됐습니다.");
    if (
      pages.length > 1 &&
      !pages.some((other) => other.id !== p.id && other.links.includes(p.slug))
    )
      add("orphan", "다른 위키 문서에서 연결되지 않은 문서입니다.");
    if (p.caveats.length)
      add("review", "검토할 쟁점 " + p.caveats.length + "개가 남아 있습니다.");
    return checks;
  });
}
function hash(value: unknown) {
  return createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex")
    .slice(0, 32);
}
export async function compileWiki(
  userId: string,
  question?: string,
  sourceId?: string,
) {
  if (queueLocally())
    return enqueue(userId, question ? "question" : "wiki", {
      question,
      sourceId,
    });
  if (!aiConfigured())
    throw new AppError(
      "AI 서비스 연결 후 위키를 작성할 수 있습니다. 원문은 이미 저장되어 있습니다.",
      503,
    );
  const db = admin();
  const index = await db
    .from("ai_atlas_resources")
    .select("id,title,category,updated_at")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .limit(2000);
  checkDb(index.error);
  const wiki = await db
    .from("ai_atlas_wiki_pages")
    .select("*")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(500);
  checkDb(wiki.error);
  const pages = (wiki.data || []) as WikiPage[];
  let candidates = index.data || [];
  if (question) {
    const tokens = question
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter(
        (w) =>
          w.length > 1 &&
          ![
            "어떻게",
            "무엇인가요",
            "알려줘",
            "있나요",
            "대해서",
            "있는",
            "그리고",
          ].includes(w),
      )
      .flatMap((word) =>
        [
          ...new Set([
            word,
            word.replace(
              /(?:이란|이랑|에서|으로|하고|란|은|는|이|가|을|를|의|에|로|와|과|랑)$/u,
              "",
            ),
          ]),
        ].filter((w) => w.length > 1),
      );
    const score = (text: string) =>
      tokens.reduce((n, t) => n + (text.toLowerCase().includes(t) ? 1 : 0), 0);
    const matched = pages
      .map((p) => ({
        p,
        score: score(p.title + " " + p.summary + " " + p.body),
      }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);
    const relevantIds = new Set(matched.flatMap((x) => x.p.source_ids));
    candidates = candidates
      .map((r) => ({
        ...r,
        score:
          score(r.title + " " + r.category) + (relevantIds.has(r.id) ? 3 : 0),
      }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score);
    if (!candidates.length)
      throw new AppError(
        "이 질문과 연결된 자료를 찾지 못했습니다. 관련 자료를 저장하거나 핵심 용어를 넣어 질문해 주세요.",
        422,
      );
  } else
    candidates = candidates.filter(
      (r) =>
        !pages.some(
          (p) => p.source_ids.includes(r.id) && p.updated_at >= r.updated_at,
        ),
    );
  const chosen = (
    sourceId ? candidates.filter((r) => r.id === sourceId) : candidates
  ).slice(0, localRuntime() ? 2 : 12);
  if (!chosen.length)
    return { written: 0, message: "현재 자료가 위키에 반영되어 있습니다." };
  const sourceResult = await db
    .from("ai_atlas_resources")
    .select("*")
    .eq("user_id", userId)
    .in(
      "id",
      chosen.map((r) => r.id),
    )
    .is("deleted_at", null);
  checkDb(sourceResult.error);
  const sources = (sourceResult.data || []) as Resource[];
  const job = await claimTask(
    userId,
    question ? "question" : "wiki",
    hash({ question, source: chosen.map((s) => [s.id, s.updated_at]) }),
  );
  if (job.status === "completed")
    return {
      written: 0,
      cached: true,
      message: "이미 저장된 정리 결과입니다.",
    };
  try {
    const related = pages
      .filter(
        (p) =>
          p.source_ids.some((id) => sources.some((r) => r.id === id)) ||
          sources.some((r) =>
            [r.category, ...r.tags].some(
              (t) => p.title.includes(t) || p.summary.includes(t),
            ),
          ),
      )
      .slice(0, localRuntime() ? 2 : 12);
    const activeIds = new Set((index.data || []).map((r) => r.id));
    const knownIds = new Set(
      [
        ...sources.map((r) => r.id),
        ...related.flatMap((p) => p.source_ids),
      ].filter((id) => activeIds.has(id)),
    );
    const generated = job.result?.pages
      ? {
          value: wikiBundleSchema.parse(job.result),
          model: job.model,
          input_tokens: job.input_tokens,
          output_tokens: job.output_tokens,
        }
      : await structured(
          wikiBundleSchema.extend({
            pages: z
              .array(
                wikiBundleSchema.shape.pages.element.extend({
                  source_ids: z
                    .array(z.enum([...knownIds] as [string, ...string[]]))
                    .min(1)
                    .max(30),
                }),
              )
              .min(1)
              .max(5),
          }),
          "knowledge_wiki",
          `당신은 개인 LLM Wiki 편집자입니다. 원문을 수정하지 않고 지속적으로 관리할 지식을 작성합니다. ${question ? "질문에 답하는 문서 하나만 작성하세요. 근거가 부족한 부분은 명확히 밝히고 답을 지어내지 마세요." : "새 자료를 기존 위키에 통합하여 서로 연결된 개념·도구·실용 가이드 2~5개를 작성하세요. 문서별 줄거리 나열보다 여러 출처의 공통점·차이·활용법을 설명하세요."} 기존 문서를 갱신할 때 기존 slug를 정확히 유지하고 여전히 유효한 내용을 보존합니다. protected 문서는 갱신하지 않습니다. body는 읽기 쉬운 Markdown으로, 정의·작동 원리·실제 예시·주의점·다음 질문을 담습니다. 입력의 공개 피드 요약은 전체 본문을 검증한 자료가 아니므로 과도한 결론을 내리지 않습니다. 모순되는 주장과 오래된 주장은 caveats에 남깁니다. 출처는 실제 사용한 자료의 UUID를 source_ids에 넣으세요. 기존 문서의 근거도 유지하세요. links는 관련된 기존 또는 이번 새 문서의 slug만 사용합니다. body의 관련 링크는 [[slug|표시 이름]] 형태입니다. slug는 짧은 영문 소문자와 하이픈 또는 한글로 만듭니다. 입력에 없는 URL·자료 UUID·성과 수치를 만들지 마세요.`,
          {
            question: question || null,
            sources: sources.map((r) => ({
              id: r.id,
              title: r.title,
              source_url: r.source_url,
              method: r.source_method,
              text: r.raw_text.slice(0, localRuntime() ? 3000 : 5000),
              excerpt_only: r.raw_text.length > (localRuntime() ? 3000 : 5000),
              lesson: r.lesson
                ? {
                    summary: r.lesson.summary.slice(0, 800),
                    takeaways: r.lesson.takeaways.slice(0, 4),
                    glossary: r.lesson.glossary.slice(0, 4),
                    sections: r.lesson.sections
                      .slice(0, localRuntime() ? 3 : 7)
                      .map((s) => ({
                        ...s,
                        body: s.body.slice(0, localRuntime() ? 700 : 1800),
                        example: s.example.slice(0, localRuntime() ? 300 : 700),
                      })),
                    comparison: r.lesson.comparison,
                    practice: r.lesson.practice,
                    caveats: r.lesson.caveats,
                  }
                : null,
              personal_notes: r.notes.slice(0, 1000),
            })),
            index: pages
              .map((p) => ({
                slug: p.slug,
                title: p.title,
                summary: p.summary.slice(0, localRuntime() ? 150 : 500),
                protected: p.protected,
              }))
              .slice(0, localRuntime() ? 30 : 100),
            existing: related.map((p) => ({
              ...p,
              body: p.body.slice(0, localRuntime() ? 2000 : 5000),
            })),
          },
          10000,
        );
    const drafts = generated.value.pages;
    if (question && drafts.length !== 1)
      throw new AppError("질문 답변 형식을 확인하지 못했습니다.", 502);
    if (
      new Set(drafts.map((p) => p.slug)).size !== drafts.length ||
      drafts.some((p) => p.source_ids.some((id) => !knownIds.has(id)))
    )
      throw new AppError(
        "위키의 출처를 확인하지 못해 반영하지 않았습니다.",
        502,
      );
    const slugs = new Set([
      ...pages.map((p) => p.slug),
      ...drafts.map((p) => p.slug),
    ]);
    const prepared = drafts.map((p) => ({
      ...p,
      caveats: [
        "수집 자료를 바탕으로 만든 AI 초안입니다. 원문의 주장과 AI의 보충 설명을 독립적으로 검증한 결과는 아닙니다.",
        ...p.caveats,
        ...(sources.some(
          (r) =>
            p.source_ids.includes(r.id) &&
            (r.source_method === "feed_preview" ||
              r.raw_text.length > (localRuntime() ? 3000 : 5000)),
        )
          ? [
              "일부 출처는 요약 또는 본문 발췌를 사용했습니다. 전체 맥락은 연결된 원문에서 확인하세요.",
            ]
          : []),
      ].slice(0, 8),
      kind: question ? "question" : p.kind,
      body: p.body.replace(
        /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g,
        (match, slug, label) => (slugs.has(slug) ? match : label || slug),
      ),
      links: [...new Set(p.links)].filter((s) => slugs.has(s) && s !== p.slug),
      expected_revision:
        pages.find((old) => old.slug === p.slug)?.revision || 0,
    }));
    checkDb(
      (
        await db
          .from("ai_atlas_tasks")
          .update({
            result: generated.value,
            model: generated.model,
            input_tokens: generated.input_tokens,
            output_tokens: generated.output_tokens,
          })
          .eq("id", job.id)
      ).error,
    );
    const write = await db.rpc("ai_atlas_write_wiki", {
      p_task_id: job.id,
      p_pages: prepared,
    });
    checkDb(write.error);
    checkDb(
      (
        await db
          .from("ai_atlas_tasks")
          .update({
            status: "completed",
            finished_at: new Date().toISOString(),
          })
          .eq("id", job.id)
      ).error,
    );
    return {
      written: write.data,
      remaining: Math.max(0, candidates.length - chosen.length),
      slugs: prepared.map((p) => p.slug),
      message: write.data + "개 문서를 위키에 반영했습니다.",
    };
  } catch (e) {
    const message = aiProblem(e);
    await db
      .from("ai_atlas_tasks")
      .update({
        status: "failed",
        error: message,
        finished_at: new Date().toISOString(),
      })
      .eq("id", job.id);
    throw new AppError(message, 502);
  }
}
