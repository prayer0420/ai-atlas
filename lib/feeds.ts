import * as cheerio from "cheerio";
import { safeFetch, validateUrl } from "./extract";
import type { FeedItem, Preferences } from "./brain-types";
export const feedSources = [
  {
    id: "openai",
    name: "OpenAI News",
    url: "https://openai.com/news/rss.xml",
    kind: "공식 발표",
    detail: "모델·제품·안전성 발표",
    weight: 3,
  },
  {
    id: "google",
    name: "Google AI",
    url: "https://blog.google/technology/ai/rss/",
    kind: "공식 발표",
    detail: "Gemini와 실제 활용 사례",
    weight: 3,
  },
  {
    id: "huggingface",
    name: "Hugging Face",
    url: "https://huggingface.co/blog/feed.xml",
    kind: "개발·팁",
    detail: "오픈소스 모델과 실습",
    weight: 3,
  },
  {
    id: "arxiv",
    name: "arXiv AI",
    url: "https://rss.arxiv.org/rss/cs.AI",
    kind: "연구",
    detail: "신규 논문의 공개 초록",
    weight: 0,
  },
  {
    id: "two-minute-papers",
    name: "Two Minute Papers",
    url: "https://www.youtube.com/feeds/videos.xml?channel_id=UCbfYPyITQ-7l4upoX8nvctg",
    kind: "YouTube",
    detail: "연구 설명 영상 · 공개 조회수",
    weight: 2,
  },
  {
    id: "geeknews",
    name: "GeekNews",
    url: "https://feeds.feedburner.com/geeknews-feed",
    kind: "국내 커뮤니티",
    detail: "AI 관련 글만 선별",
    weight: 1,
  },
] as const;
export const defaultPreferences: Preferences = {
  daily_enabled: true,
  source_ids: feedSources.map((s) => s.id),
  topics: [],
  story_count: 3,
  auto_wiki: true,
};
const aiWords =
  /\b(ai|llm|gpt|claude|gemini|agent|rag|codex|chatgpt|anthropic|openai|diffusion|transformer)\b|인공지능|프롬프트|에이전트|언어 모델|머신러닝/i;
export function plainText(text: string) {
  return cheerio.load(text).text().replace(/\s+/g, " ").trim();
}
export function canonicalUrl(raw: string) {
  const u = validateUrl(raw);
  for (const k of [...u.searchParams.keys()])
    if (/^(utm_|fbclid|gclid|si$|feature$)/i.test(k)) u.searchParams.delete(k);
  u.searchParams.sort();
  return u.href;
}
export function kstDate(date = new Date()) {
  return new Date(date.getTime() + 9 * 3600000).toISOString().slice(0, 10);
}
export function parseFeed(
  xml: string,
  source: (typeof feedSources)[number],
  now = new Date(),
  topics: string[] = [],
) {
  const $ = cheerio.load(xml, { xmlMode: true });
  const items: Omit<
    FeedItem,
    "id" | "user_id" | "learned" | "favorite" | "resource_id"
  >[] = [];
  $("item,entry")
    .slice(0, 40)
    .each((_i, el) => {
      try {
        const entry = $(el);
        const title = plainText(entry.find("title").first().text()).slice(
          0,
          300,
        );
        const link =
          entry.find('link[rel="alternate"]').attr("href") ||
          entry.find("link").first().attr("href") ||
          entry.find("link").first().text();
        if (!title || !link) return;
        const url = canonicalUrl(new URL(link, source.url).href);
        const excerpt = plainText(
          entry
            .find(
              "description,summary,content,content\\:encoded,media\\:description",
            )
            .first()
            .text(),
        ).slice(0, 3000);
        if (source.id === "geeknews" && !aiWords.test(title + " " + excerpt))
          return;
        const rawDate = entry
          .find("pubDate,published,updated,dc\\:date")
          .first()
          .text();
        const timestamp = Date.parse(rawDate);
        const published = Number.isFinite(timestamp)
          ? new Date(timestamp).toISOString()
          : null;
        if (
          published &&
          (timestamp < now.getTime() - 14 * 86400000 ||
            timestamp > now.getTime() + 86400000)
        )
          return;
        const views = Number(entry.find("media\\:statistics").attr("views"));
        const metrics: Record<string, number> = {};
        if (Number.isFinite(views) && views > 0) metrics.views = views;
        const age = published
          ? Math.max(0, (now.getTime() - timestamp) / 86400000)
          : 14;
        const topicMatch = topics.some((t) =>
          (title + " " + excerpt).toLowerCase().includes(t.toLowerCase()),
        );
        const score =
          Math.round(
            (28 -
              Math.min(age, 14) * 2 +
              source.weight +
              (metrics.views ? Math.min(12, Math.log10(views + 1) * 2) : 0) +
              (topicMatch ? 12 : 0)) *
              100,
          ) / 100;
        items.push({
          source_id: source.id,
          source_name: source.name,
          url,
          canonical_url: url,
          title,
          excerpt,
          published_at: published,
          collected_at: now.toISOString(),
          metrics,
          score,
          rank_reason: [
            published ? "최근 14일 발행" : "발행일 미확인",
            topicMatch ? "관심 주제 일치" : "",
            metrics.views ? "공개 조회수 반영" : "",
          ]
            .filter(Boolean)
            .join(" · "),
        });
      } catch {
        /* Ignore malformed feed entries without following unsafe URLs. */
      }
    });
  return [
    ...new Map(items.map((item) => [item.canonical_url, item])).values(),
  ].slice(0, 20);
}
export async function collectFeeds(prefs: Preferences) {
  const selected = feedSources.filter((s) => prefs.source_ids.includes(s.id));
  return Promise.all(
    selected.map(async (source) => {
      try {
        const response = await safeFetch(source.url, 0, true);
        const items = parseFeed(
          response.text,
          source,
          new Date(),
          prefs.topics,
        );
        return { source, items, error: undefined };
      } catch {
        return {
          source,
          items: [],
          error:
            "현재 이 경로의 공개 피드를 읽지 못했습니다. 다른 경로의 수집은 계속됩니다.",
        };
      }
    }),
  );
}
export function diversified(items: FeedItem[], count: number) {
  const picked: FeedItem[] = [];
  const sorted = [...items].sort((a, b) => b.score - a.score);
  for (const item of sorted) {
    if (!picked.some((p) => p.source_id === item.source_id)) {
      picked.push(item);
      if (picked.length === count) return picked;
    }
  }
  for (const item of sorted) {
    if (!picked.some((p) => p.id === item.id)) picked.push(item);
    if (picked.length === count) break;
  }
  return picked;
}
