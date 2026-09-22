import { createHash } from "node:crypto";
import { admin, checkDb, AppError } from "./server";
import { aiConfigured } from "./ai-config";
import { aiProblem, claimTask, structured } from "./brain-ai";
import {
  collectFeeds,
  defaultPreferences,
  diversified,
  kstDate,
} from "./feeds";
import { sourceType, extract } from "./extract";
import { enqueue, queueLocally, localRuntime } from "./automation";
import { formatDaily } from "./daily-format";
import {
  issueSchema,
  type FeedItem,
  type IssueContent,
  type Preferences,
} from "./brain-types";
export async function preferences(userId: string): Promise<Preferences> {
  const db = admin();
  checkDb(
    (
      await db
        .from("ai_atlas_preferences")
        .upsert(
          { user_id: userId, ...defaultPreferences },
          { onConflict: "user_id", ignoreDuplicates: true },
        )
    ).error,
  );
  const result = await db
    .from("ai_atlas_preferences")
    .select("*")
    .eq("user_id", userId)
    .single();
  checkDb(result.error);
  return result.data;
}
export function previewIssue(items: FeedItem[]): IssueContent {
  return {
    title: "오늘의 AI 발견",
    introduction:
      "공개 피드에서 수집한 원문 미리보기입니다. AI 교육용 재구성은 아직 완료되지 않았습니다.",
    stories: items.map((item) => ({
      feed_id: item.id,
      headline: item.title.slice(0, 90),
      takeaway: "출처의 제목과 공개 요약을 먼저 확인해 보세요.",
      concepts: [],
      quiz: {
        question: "이 소식에서 확인한 사실과 아직 검증할 내용을 구분해 보세요.",
        answer:
          "원문에서 근거를 찾은 뒤 내 메모에 기록하세요. 이 질문은 일반 독서 가이드이며 자동 생성된 정답이 아닙니다.",
      },
      slides: [
        {
          kind: "hook",
          title: item.title.slice(0, 70),
          body: item.source_name + "에서 발견한 자료",
          bullets: [],
        },
        {
          kind: "explain",
          title: "공개 요약 살펴보기",
          body:
            item.excerpt.slice(0, 220) ||
            "제목만 수집되었습니다. 원문에서 내용을 확인해 주세요.",
          bullets: [],
        },
        {
          kind: "check",
          title: "내 지식으로 남기는 세 가지 질문",
          body: "아래는 원문의 주장과 별개인 학습 가이드입니다.",
          bullets: [
            "실제로 달라진 점은 무엇인가요?",
            "내 작업에 적용할 수 있는 부분은 무엇인가요?",
            "원문에서 근거를 확인했나요?",
          ],
        },
      ],
    })),
  };
}
export async function archiveFeed(userId: string, feedId: string) {
  const db = admin();
  const result = await db
    .from("ai_atlas_feed_items")
    .select("*")
    .eq("user_id", userId)
    .eq("id", feedId)
    .single();
  checkDb(result.error);
  const item = result.data as FeedItem;
  if (!item) throw new AppError("자료를 찾을 수 없습니다.", 404);
  const fingerprint = createHash("sha256")
    .update(item.canonical_url)
    .digest("hex");
  const existing = await db
    .from("ai_atlas_resources")
    .select("id")
    .eq("user_id", userId)
    .eq("fingerprint", fingerprint)
    .is("deleted_at", null)
    .maybeSingle();
  checkDb(existing.error);
  let id = existing.data?.id;
  if (!id) {
    const saved = await db
      .from("ai_atlas_resources")
      .insert({
        user_id: userId,
        title: item.title.slice(0, 120),
        source_url: item.url,
        source_type: sourceType(item.url),
        fingerprint,
        raw_text:
          "[공개 피드의 제목·요약입니다. 전체 본문 또는 영상 자막을 읽은 자료가 아닙니다.]\n" +
          item.title +
          "\n" +
          item.excerpt,
        source_method: "feed_preview",
        notes: "오늘의 AI에서 수집 · " + item.source_name,
      })
      .select("id")
      .single();
    if (saved.error?.code === "23505") {
      const raced = await db
        .from("ai_atlas_resources")
        .select("id")
        .eq("user_id", userId)
        .eq("fingerprint", fingerprint)
        .is("deleted_at", null)
        .single();
      checkDb(raced.error);
      id = raced.data?.id;
    } else {
      checkDb(saved.error);
      id = saved.data?.id;
    }
  }
  checkDb(
    (
      await db
        .from("ai_atlas_feed_items")
        .update({ resource_id: id })
        .eq("id", feedId)
        .eq("user_id", userId)
    ).error,
  );
  return id;
}
export async function runDaily(userId: string, onClaim?: (id: string) => void) {
  const db = admin(),
    prefs = await preferences(userId),
    date = kstDate();
  const collectionOnly = queueLocally();
  if (collectionOnly) {
    const existing = await db
      .from("ai_atlas_issues")
      .select("*")
      .eq("user_id", userId)
      .eq("issue_date", date)
      .maybeSingle();
    checkDb(existing.error);
    if (existing.data) {
      if (existing.data.mode === "ai")
        return { issue: existing.data, cached: true };
      return {
        issue: existing.data,
        ...(await enqueue(userId, "daily", {}, date)),
      };
    }
  }
  const job = collectionOnly
    ? {
        id: null,
        status: "collecting",
        result: null,
        model: null,
        input_tokens: 0,
        output_tokens: 0,
      }
    : await claimTask(userId, "daily", localRuntime() ? date + ":local" : date);
  if (job.status === "completed") {
    const issue = await db
      .from("ai_atlas_issues")
      .select("*")
      .eq("user_id", userId)
      .eq("issue_date", date)
      .single();
    checkDb(issue.error);
    return { issue: issue.data, cached: true };
  }
  if (job.id) onClaim?.(job.id);
  try {
    const results = await collectFeeds(prefs);
    const report = results.map((r) => ({
      id: r.source.id,
      name: r.source.name,
      count: r.items.length,
      ...(r.error ? { error: r.error } : {}),
    }));
    const rows = [
      ...new Map(
        results.flatMap((r) =>
          r.items.map(
            (item) =>
              [item.canonical_url, { ...item, user_id: userId }] as const,
          ),
        ),
      ).values(),
    ];
    if (rows.length)
      checkDb(
        (
          await db
            .from("ai_atlas_feed_items")
            .upsert(rows, { onConflict: "user_id,canonical_url" })
        ).error,
      );
    const stored = await db
      .from("ai_atlas_feed_items")
      .select("*")
      .eq("user_id", userId)
      .in("source_id", prefs.source_ids)
      .gte("collected_at", new Date(Date.now() - 14 * 86400000).toISOString())
      .order("score", { ascending: false })
      .limit(100);
    checkDb(stored.error);
    const previous = await db
      .from("ai_atlas_issues")
      .select("content")
      .eq("user_id", userId)
      .lt("issue_date", date)
      .order("issue_date", { ascending: false })
      .limit(30);
    checkDb(previous.error);
    const seen = new Set(
      (previous.data || []).flatMap((i) =>
        (i.content.stories as { feed_id: string }[]).map((s) => s.feed_id),
      ),
    );
    const items = diversified(
      ((stored.data || []) as FeedItem[]).filter(
        (i) =>
          !seen.has(i.id) &&
          (!i.published_at ||
            Date.parse(i.published_at) >= Date.now() - 14 * 86400000),
      ),
      prefs.story_count,
    );
    if (!items.length)
      throw new AppError(
        "아직 소개하지 않은 최근 자료가 없습니다. 기존 기록은 보관되며 다음 수집 때 새 자료를 확인합니다.",
        422,
      );
    let content = previewIssue(items),
      mode: "preview" | "ai" = "preview",
      warning: string | null = null;
    const sourceTexts: Record<string, { text: string; method: string }> = {};
    if (localRuntime())
      for (const item of items) {
        const id = await archiveFeed(userId, item.id);
        const storedSource = await db
          .from("ai_atlas_resources")
          .select("raw_text,source_method,updated_at")
          .eq("id", id)
          .eq("user_id", userId)
          .single();
        checkDb(storedSource.error);
        if (!storedSource.data) continue;
        if (storedSource.data.source_method !== "feed_preview") {
          sourceTexts[item.id] = {
            text: storedSource.data.raw_text,
            method: storedSource.data.source_method || "manual",
          };
        } else
          try {
            const article = await extract(item.url);
            const savedArticle = await db
              .from("ai_atlas_resources")
              .update({ raw_text: article.text, source_method: article.method })
              .eq("id", id)
              .eq("user_id", userId)
              .eq("updated_at", storedSource.data.updated_at)
              .is("deleted_at", null)
              .select("id");
            checkDb(savedArticle.error);
            if (savedArticle.data?.length) sourceTexts[item.id] = article;
          } catch {
            /* An unavailable article remains an honestly labelled RSS excerpt. */
          }
      }
    if (aiConfigured() && !collectionOnly)
      try {
        const generated = job.result?.stories
          ? {
              value: issueSchema.parse(job.result),
              model: job.model,
              input_tokens: job.input_tokens,
              output_tokens: job.output_tokens,
            }
          : await structured(
              issueSchema,
              "daily_cards",
              "공개 피드의 제목과 요약으로 학습용 카드뉴스를 만드세요. 전체 원문이나 영상을 확인했다고 쓰지 마세요. 입력 자료 각각에 대해 정확히 하나의 stories를 작성합니다. 출처의 feed_id를 그대로 사용합니다. 첫 카드는 관심을 끄는 구체적 질문, 다음 카드는 핵심 개념과 작동 흐름, 그 다음은 실제 적용 예시와 주의점, 마지막은 이해도 점검으로 구성합니다. 카드 하나에는 한 가지 메시지만 담고, 짧은 제목·충분한 설명·3개 이하의 핵심 항목으로 구성하세요. 정보가 부족하면 그 한계를 밝히세요. 후킹 문구에 과장된 성과나 숫자를 쓰지 마세요. 인기 콘텐츠의 원문 문장이나 브랜드 디자인을 복제하지 않습니다. 퀴즈는 제공된 요약에서 답을 찾을 수 있어야 합니다. 날짜가 다른 소식을 오늘 발표된 것처럼 표현하지 마세요.",
              {
                date,
                sources: items.map((i) => ({
                  feed_id: i.id,
                  title: i.title,
                  excerpt: i.excerpt,
                  article: sourceTexts[i.id]?.text.slice(0, 6500) || null,
                  source_method: sourceTexts[i.id]?.method || "feed_preview",
                  publisher: i.source_name,
                  published_at: i.published_at,
                  url: i.url,
                  metrics: i.metrics,
                })),
              },
            );
        if (
          generated.value.stories.length !== items.length ||
          new Set(generated.value.stories.map((s) => s.feed_id)).size !==
            items.length ||
          generated.value.stories.some(
            (s) => !items.some((i) => i.id === s.feed_id),
          )
        )
          throw new AppError(
            "카드뉴스의 출처 연결을 검증하지 못했습니다.",
            502,
          );
        content = formatDaily(generated.value, items, date);
        mode = "ai";
        if (job.id)
          checkDb(
            (
              await db
                .from("ai_atlas_tasks")
                .update({
                  result: content,
                  model: generated.model,
                  input_tokens: generated.input_tokens,
                  output_tokens: generated.output_tokens,
                })
                .eq("id", job.id)
            ).error,
          );
      } catch (e) {
        warning = aiProblem(e);
      }
    else
      warning =
        "자료를 수집했습니다. PC가 켜지면 무료 AI가 교육용 카드뉴스로 정리합니다. 현재는 원문 미리보기입니다.";
    for (const item of items) await archiveFeed(userId, item.id);
    const saved = await db
      .from("ai_atlas_issues")
      .upsert(
        {
          user_id: userId,
          issue_date: date,
          content,
          mode,
          warning,
          source_report: report,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,issue_date" },
      )
      .select("*")
      .single();
    checkDb(saved.error);
    if (job.id)
      checkDb(
        (
          await db
            .from("ai_atlas_tasks")
            .update({
              status: mode === "ai" ? "completed" : "failed",
              error: warning,
              finished_at: new Date().toISOString(),
            })
            .eq("id", job.id)
        ).error,
      );
    if (collectionOnly)
      return {
        issue: saved.data,
        collected: rows.length,
        ...(await enqueue(userId, "daily", {}, date)),
      };
    return { issue: saved.data, cached: false, collected: rows.length };
  } catch (e) {
    if (job.id)
      await db
        .from("ai_atlas_tasks")
        .update({
          status: "failed",
          error: aiProblem(e),
          finished_at: new Date().toISOString(),
        })
        .eq("id", job.id);
    throw e;
  }
}
