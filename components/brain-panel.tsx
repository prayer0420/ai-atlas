"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Bookmark,
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  FolderSync,
  GitBranch,
  History,
  Layers,
  LoaderCircle,
  LockKeyhole,
  Network,
  RefreshCw,
  Search,
  Settings2,
  Sparkles,
  Unlock,
  CalendarDays,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { readingExcerpt } from "@/lib/reading";
import type {
  FeedItem,
  Issue,
  Preferences,
  Story,
  WikiPage,
} from "@/lib/brain-types";
type Api = (path: string, options?: RequestInit) => Promise<any>;
type Props = {
  view: "daily" | "wiki" | "obsidian";
  signedIn: boolean;
  api: Api;
  onLogin: () => void;
  onResource: (id: string) => void;
  sourceId?: string | null;
  onWiki: (id: string) => void;
  onClearSource: () => void;
};
type Source = { id: string; name: string; kind: string; detail: string };
const icons = { daily: CalendarDays, wiki: Network, obsidian: FolderSync };
const names = {
  daily: "오늘의 AI",
  wiki: "지식 위키",
  obsidian: "Obsidian · Second Brain",
};
const intros = {
  daily: "새로운 소식은 짧게, 쓸모 있는 지식은 오래.",
  wiki: "흩어진 자료를 연결해 나만의 설명으로 쌓아갑니다.",
  obsidian: "내 자료를 열린 Markdown 파일로 소유하고, 생각을 이어 쓰세요.",
};
const fileHash = async (text: string) =>
  [
    ...new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)),
    ),
  ]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
async function downloadVault(files: Record<string, string>) {
  const { zipSync, strToU8 } = await import("fflate");
  const zip = zipSync(
    Object.fromEntries(
      Object.entries(files).map(([path, text]) => [path, strToU8(text)]),
    ),
  );
  const url = URL.createObjectURL(
    new Blob([new Uint8Array(zip)], { type: "application/zip" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download =
    "AI-Atlas-Second-Brain-" + new Date().toISOString().slice(0, 10) + ".zip";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
async function pickVault() {
  const picker = (
    window as unknown as {
      showDirectoryPicker?: (
        options: unknown,
      ) => Promise<FileSystemDirectoryHandle>;
    }
  ).showDirectoryPicker;
  if (!picker)
    throw new Error(
      "이 브라우저에서는 폴더 연결을 지원하지 않습니다. ZIP 내려받기를 사용해 주세요.",
    );
  return picker.call(window, { mode: "readwrite", id: "ai-atlas-vault" });
}
async function syncVault(
  files: Record<string, string>,
  root: FileSystemDirectoryHandle,
) {
  let previous: Record<string, string> = {};
  try {
    previous = JSON.parse(
      await (
        await (await root.getFileHandle(".ai-atlas-manifest.json")).getFile()
      ).text(),
    );
  } catch (e) {
    if (
      (e as DOMException).name !== "NotFoundError" &&
      !(e instanceof SyntaxError)
    )
      throw e;
  }
  const next = { ...previous };
  let written = 0,
    conflicts = 0;
  for (const [path, text] of Object.entries(files)) {
    const parts = path.split("/");
    if (
      parts.some(
        (p) => !p || p === "." || p === ".." || /[\\:\x00-\x1f]/.test(p),
      )
    )
      throw new Error("안전하지 않은 파일 경로를 발견했습니다.");
    let dir = root;
    for (const part of parts.slice(0, -1))
      dir = await dir.getDirectoryHandle(part, { create: true });
    const name = parts.at(-1)!;
    let current: string | null = null;
    try {
      current = await (await (await dir.getFileHandle(name)).getFile()).text();
    } catch (e) {
      if ((e as DOMException).name !== "NotFoundError") throw e;
    }
    if (
      current !== null &&
      (path.startsWith("personal/") || path.startsWith(".obsidian/"))
    )
      continue;
    const desired = await fileHash(text);
    if (current !== null) {
      const actual = await fileHash(current);
      if (actual === desired) {
        next[path] = desired;
        continue;
      }
      if (!previous[path] || previous[path] !== actual) {
        conflicts++;
        continue;
      }
    }
    const file = await dir.getFileHandle(name, { create: true });
    const stream = await file.createWritable();
    await stream.write(text);
    await stream.close();
    next[path] = desired;
    written++;
  }
  const manifest = await root.getFileHandle(".ai-atlas-manifest.json", {
    create: true,
  });
  const stream = await manifest.createWritable();
  await stream.write(JSON.stringify(next, null, 2));
  await stream.close();
  return { written, conflicts };
}
function NewsCard({
  story,
  item,
  date,
  index,
  mode,
}: {
  story: Story;
  item?: FeedItem;
  date: string;
  index: number;
  mode: string;
}) {
  const slide = story.slides[index] || story.slides[0];
  return (
    <article className={"news-card news-" + slide.kind}>
      <div className="news-card-top">
        <span>
          AI ATLAS <i>DAILY EDITION</i>
        </span>
        <span>
          {String(index + 1).padStart(2, "0")} /{" "}
          {String(story.slides.length).padStart(2, "0")}
        </span>
      </div>
      <div className="news-card-content">
        <div className="news-kicker">
          {mode === "ai" ? "배워서 써먹는 AI" : "원문 미리보기"} <span>✦</span>
        </div>
        <h2>{slide.title}</h2>
        <p>{slide.body}</p>
        {slide.bullets.length > 0 && (
          <div className="news-bullets">
            {slide.bullets.map((b, i) => (
              <div key={i}>
                <span>{String(i + 1).padStart(2, "0")}</span>
                <p>{b}</p>
                {i < slide.bullets.length - 1 && slide.kind === "steps" && (
                  <ArrowRight size={18} />
                )}
              </div>
            ))}
          </div>
        )}
        {slide.kind === "hook" && story.concepts.length > 0 && (
          <div
            className="news-concept-map"
            role="group"
            aria-label="이 소식의 핵심 개념"
          >
            <span className="news-concept-label">이 소식의 핵심 개념</span>
            <div>
              {story.concepts.slice(0, 4).map((c) => (
                <span key={c}>{c}</span>
              ))}
            </div>
          </div>
        )}
      </div>
      <footer className="news-card-footer">
        <span>
          {item?.source_name || "출처 확인"}
          <small>{item ? new URL(item.url).hostname : "AI Atlas"}</small>
        </span>
        <span>
          {date}
          <small>
            {mode === "ai"
              ? "공개 요약 기반 · AI 재구성"
              : "AI 분석 전 · 수집 자료"}
          </small>
        </span>
      </footer>
    </article>
  );
}
export function BrainPanel({
  view,
  signedIn,
  api,
  onLogin,
  onResource,
  sourceId,
  onWiki,
  onClearSource,
}: Props) {
  const [data, setData] = useState<any>(null),
    [loading, setLoading] = useState(false),
    [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const [issueId, setIssueId] = useState(""),
    [storyId, setStoryId] = useState(""),
    [slide, setSlide] = useState(0),
    [answer, setAnswer] = useState(false),
    [showSettings, setShowSettings] = useState(false),
    [prefs, setPrefs] = useState<Preferences | null>(null);
  const [selectedSlug, setSelectedSlug] = useState(""),
    [wikiTab, setWikiTab] = useState("pages"),
    [search, setSearch] = useState(""),
    [question, setQuestion] = useState(""),
    [revisions, setRevisions] = useState<any[] | null>(null);
  const exportCard = useRef<HTMLDivElement>(null);
  const [topicText, setTopicText] = useState("");
  const generation = useRef(0);
  const load = useCallback(async () => {
    if (!signedIn) return;
    const n = ++generation.current;
    setLoading(true);
    try {
      const result = await api(
        "/api/brain?view=" + (view === "wiki" ? "wiki" : "daily"),
      );
      if (n === generation.current) {
        setData(result);
        if (result.preferences) {
          setPrefs(result.preferences);
          setTopicText(result.preferences.topics.join(", "));
        }
      }
    } catch (e) {
      if (n === generation.current) setError((e as Error).message);
    } finally {
      if (n === generation.current) setLoading(false);
    }
  }, [api, signedIn, view]);
  useEffect(() => {
    setData(null);
    setError("");
    setMessage("");
    setRevisions(null);
    void load();
    return () => {
      generation.current++;
    };
  }, [load]);
  const run = async (action: string, extra: Record<string, unknown> = {}) => {
    if (busy) return;
    setBusy(action);
    setError("");
    setMessage("");
    try {
      const result = await api("/api/brain", {
        method: "POST",
        body: JSON.stringify({ action, ...extra }),
      });
      await load();
      if (result.slugs?.[0]) setSelectedSlug(result.slugs[0]);
      setMessage(
        result.message ||
          (action === "collect"
            ? result.issue?.warning || "오늘의 자료를 수집했습니다."
            : "저장했습니다."),
      );
      return result;
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  };
  const exportFiles = async (folder = false) => {
    setBusy(folder ? "sync" : "export");
    setError("");
    try {
      const root = folder ? await pickVault() : null;
      const result = await api("/api/brain/export");
      const { unzipSync, strFromU8 } = await import("fflate");
      const files = Object.fromEntries(
        Object.entries(
          unzipSync(
            Uint8Array.from(atob(result.archive), (c) => c.charCodeAt(0)),
          ),
        ).map(([name, bytes]) => [name, strFromU8(bytes)]),
      );
      if (folder) {
        const sync = await syncVault(files, root!);
        setMessage(
          sync.written +
            "개 파일 동기화 완료" +
            (sync.conflicts
              ? " · 직접 수정한 " + sync.conflicts + "개 파일은 보존했습니다."
              : ""),
        );
      } else {
        await downloadVault(files);
        setMessage("Obsidian 보관함을 ZIP으로 내려받았습니다.");
      }
    } catch (e) {
      if ((e as DOMException).name !== "AbortError")
        setError((e as Error).message);
    } finally {
      setBusy("");
    }
  };
  const saveCard = async () => {
    if (!exportCard.current) return;
    let restoreContent: (() => void) | undefined;
    setBusy("image");
    setError("");
    try {
      await document.fonts.ready;
      const card = exportCard.current.querySelector<HTMLElement>(".news-card");
      const content = card?.querySelector<HTMLElement>(".news-card-content");
      const top = card?.querySelector<HTMLElement>(".news-card-top");
      const footer = card?.querySelector<HTMLElement>(".news-card-footer");
      if (card && content && top && footer) {
        const styles = getComputedStyle(card);
        const available =
          card.clientHeight -
          parseFloat(styles.paddingTop) -
          parseFloat(styles.paddingBottom) -
          top.offsetHeight -
          footer.offsetHeight;
        const natural = content.scrollHeight;
        if (natural > available && available > 0) {
          const previousStyle = content.getAttribute("style");
          const scale = available / natural;
          Object.assign(content.style, {
            flex: "none",
            height: natural + "px",
            transform: `scale(${scale})`,
            transformOrigin: "center top",
            marginBottom: available - natural + "px",
          });
          restoreContent = () =>
            previousStyle === null
              ? content.removeAttribute("style")
              : content.setAttribute("style", previousStyle);
        }
      }
      const { toPng } = await import("html-to-image");
      const url = await toPng(exportCard.current, {
        pixelRatio: 2,
        cacheBust: true,
      });
      const a = document.createElement("a");
      a.href = url;
      a.download =
        "ai-atlas-" +
        (issue?.issue_date || "card") +
        "-" +
        (slide + 1) +
        ".png";
      a.click();
    } catch {
      setError("이미지를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      restoreContent?.();
      setBusy("");
    }
  };
  const issues = (data?.issues || []) as Issue[],
    items = (data?.items || []) as FeedItem[],
    pages = (data?.pages || []) as WikiPage[];
  const issue = issues.find((i) => i.id === issueId) || issues[0];
  const story =
    issue?.content.stories.find((s) => s.feed_id === storyId) ||
    issue?.content.stories[0];
  const item = items.find((i) => i.id === story?.feed_id);
  const relevant = sourceId
    ? pages.filter((p) => p.source_ids.includes(sourceId))
    : pages;
  const selected = relevant.find((p) => p.slug === selectedSlug) || relevant[0];
  const Icon = icons[view];
  const filtered = relevant.filter((p) =>
    (p.title + " " + p.summary).toLowerCase().includes(search.toLowerCase()),
  );
  const chooseStory = (id: string) => {
    setStoryId(id);
    setSlide(0);
    setAnswer(false);
  };
  const openWikiPage = (slug: string) => {
    if (sourceId && !relevant.some((p) => p.slug === slug)) onClearSource();
    setSelectedSlug(slug);
    setRevisions(null);
  };
  return (
    <section className="brain-panel">
      <header className="brain-heading">
        <div>
          <div className="eyebrow">
            <Icon size={15} /> YOUR DAILY KNOWLEDGE RITUAL
          </div>
          <h1>
            {names[view]}
            <span className="heading-dot">.</span>
          </h1>
          <p>{intros[view]}</p>
        </div>
        {signedIn && (
          <div className="brain-actions">
            {view === "daily" ? (
              <>
                <button
                  className="secondary-button"
                  onClick={() => setShowSettings(!showSettings)}
                >
                  <Settings2 size={17} />
                  수집 설정
                </button>
                <button
                  className="primary-button"
                  disabled={!!busy}
                  onClick={() => void run("collect")}
                >
                  {busy === "collect" ? (
                    <LoaderCircle className="spin" size={17} />
                  ) : (
                    <RefreshCw size={17} />
                  )}
                  지금 수집
                </button>
              </>
            ) : view === "wiki" ? (
              <button
                className="primary-button"
                disabled={!!busy}
                onClick={() =>
                  void run("compile", sourceId ? { sourceId } : {})
                }
              >
                {busy === "compile" ? (
                  <LoaderCircle className="spin" size={17} />
                ) : (
                  <Sparkles size={17} />
                )}
                새 자료를 위키에 정리
              </button>
            ) : (
              <button
                className="primary-button"
                disabled={!!busy}
                onClick={() => void exportFiles()}
              >
                <Download size={17} />
                보관함 내려받기
              </button>
            )}
          </div>
        )}
      </header>
      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
      {message && (
        <div className="brain-notice" role="status">
          {message}
        </div>
      )}
      {!signedIn ? (
        <div className="brain-welcome">
          <div className="brain-welcome-symbol">
            <Icon size={40} />
          </div>
          <h2>
            {view === "daily"
              ? "매일의 발견을 내 지식으로"
              : view === "wiki"
                ? "자료가 쌓일수록 연결은 깊어집니다"
                : "나의 지식은 나의 파일로"}
          </h2>
          <p>
            로그인하면 일일 수집, 카드뉴스 학습, 출처가 연결된 위키와 Obsidian
            보관함을 사용할 수 있습니다.
          </p>
          <button className="primary-button" onClick={onLogin}>
            내 자료실 연결 <ArrowRight size={17} />
          </button>
        </div>
      ) : loading && !data ? (
        <div className="brain-loading">
          <LoaderCircle className="spin" />
          자료를 불러오고 있어요.
        </div>
      ) : (
        <>
          {view === "daily" && (
            <>
              <div className="daily-schedule">
                <CalendarDays size={17} />
                <span>
                  {prefs?.daily_enabled
                    ? "매일 오전 9시대 수집"
                    : "자동 수집 일시 정지"}
                  {prefs?.daily_enabled && prefs?.auto_wiki
                    ? " · 오전 11시대 위키 정리"
                    : ""}
                </span>
                <small>한국 시간 · 최근 14일 자료에서 선별</small>
              </div>
              {showSettings && prefs && (
                <form
                  className="brain-settings"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void run("preferences", {
                      preferences: {
                        ...prefs,
                        topics: topicText
                          .split(",")
                          .map((s) => s.trim())
                          .filter(Boolean)
                          .slice(0, 10),
                      },
                    });
                  }}
                >
                  <div className="brain-section-title">
                    <h2>어떤 발견을 모을까요?</h2>
                    <span>출처별 수집 상태를 함께 기록합니다.</span>
                  </div>
                  <div className="source-options">
                    {(data?.sources || []).map((s: Source) => (
                      <label key={s.id}>
                        <input
                          type="checkbox"
                          checked={prefs.source_ids.includes(s.id)}
                          onChange={(e) =>
                            setPrefs({
                              ...prefs,
                              source_ids: e.target.checked
                                ? [...prefs.source_ids, s.id]
                                : prefs.source_ids.filter((id) => id !== s.id),
                            })
                          }
                        />
                        <span>
                          <strong>{s.name}</strong>
                          <small>
                            {s.kind} · {s.detail}
                          </small>
                        </span>
                      </label>
                    ))}
                  </div>
                  <div className="brain-settings-row">
                    <label>
                      관심 키워드
                      <input
                        value={topicText}
                        maxLength={400}
                        onChange={(e) => setTopicText(e.target.value)}
                        placeholder="AI 에이전트, 업무 자동화, 디자인"
                      />
                    </label>
                    <label>
                      하루에 읽을 소식
                      <select
                        value={prefs.story_count}
                        onChange={(e) =>
                          setPrefs({
                            ...prefs,
                            story_count: Number(e.target.value),
                          })
                        }
                      >
                        {[1, 2, 3, 4, 5].map((n) => (
                          <option key={n} value={n}>
                            {n}개
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="brain-settings-row">
                    <label className="inline-check">
                      <input
                        type="checkbox"
                        checked={prefs.daily_enabled}
                        onChange={(e) =>
                          setPrefs({
                            ...prefs,
                            daily_enabled: e.target.checked,
                          })
                        }
                      />
                      매일 자동 수집
                    </label>
                    <label className="inline-check">
                      <input
                        type="checkbox"
                        checked={prefs.auto_wiki}
                        onChange={(e) =>
                          setPrefs({ ...prefs, auto_wiki: e.target.checked })
                        }
                      />
                      수집 자료를 위키에 자동 반영
                    </label>
                    <button
                      className="primary-button"
                      disabled={!!busy || !prefs.source_ids.length}
                    >
                      설정 저장
                    </button>
                  </div>
                  <p className="brain-muted">
                    Instagram·Threads는 링크와 본문을 자료 추가에서 가져올 수
                    있습니다. 전체 플랫폼의 인기 순위를 자동 조회하는 기능은
                    연결되어 있지 않습니다.
                  </p>
                </form>
              )}
              {issue && story ? (
                <>
                  <div className="edition-bar">
                    <div>
                      <span className="edition-label">DAILY EDITION</span>
                      <strong>{issue.issue_date}</strong>
                      <span
                        className={
                          "brain-pill " + (issue.mode === "ai" ? "green" : "")
                        }
                      >
                        {issue.mode === "ai" ? "AI 학습 카드" : "원문 미리보기"}
                      </span>
                    </div>
                    <label>
                      지난 기록
                      <select
                        aria-label="지난 일일 기록"
                        value={issue.id}
                        onChange={(e) => {
                          setIssueId(e.target.value);
                          chooseStory("");
                        }}
                      >
                        {issues.map((i) => (
                          <option key={i.id} value={i.id}>
                            {i.issue_date}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  {issue.warning && (
                    <p className="brain-warning">{issue.warning}</p>
                  )}
                  <div className="daily-reader">
                    <div className="daily-story-list">
                      <h2>오늘 읽을 {issue.content.stories.length}가지</h2>
                      <p>한 가지씩 읽고, 필요할 때 깊이 들어가세요.</p>
                      {issue.content.stories.map((s, i) => (
                        <button
                          key={s.feed_id}
                          className={
                            story.feed_id === s.feed_id ? "active" : ""
                          }
                          onClick={() => chooseStory(s.feed_id)}
                        >
                          <span>{String(i + 1).padStart(2, "0")}</span>
                          <div>
                            <strong>{s.headline}</strong>
                            <small>
                              {items.find((f) => f.id === s.feed_id)
                                ?.source_name || "보관된 출처"}
                            </small>
                          </div>
                          <ChevronRight size={18} />
                        </button>
                      ))}
                    </div>
                    <div className="daily-card-area">
                      <div
                        className="news-visible"
                        tabIndex={0}
                        role="group"
                        aria-label="카드뉴스. 좌우 방향키로 이동"
                        onKeyDown={(e) => {
                          if (e.key === "ArrowRight" || e.key === "ArrowLeft")
                            e.preventDefault();
                          if (e.key === "ArrowRight")
                            setSlide((n) =>
                              Math.min(story.slides.length - 1, n + 1),
                            );
                          if (e.key === "ArrowLeft")
                            setSlide((n) => Math.max(0, n - 1));
                        }}
                      >
                        <NewsCard
                          story={story}
                          item={item}
                          date={issue.issue_date}
                          index={slide}
                          mode={issue.mode}
                        />
                      </div>
                      <div className="export-stage" aria-hidden="true">
                        <div ref={exportCard}>
                          <NewsCard
                            story={story}
                            item={item}
                            date={issue.issue_date}
                            index={slide}
                            mode={issue.mode}
                          />
                        </div>
                      </div>
                      <div className="card-controls">
                        <span className="sr-only" aria-live="polite">
                          {story.slides.length}장 중 {slide + 1}번째:{" "}
                          {story.slides[slide]?.title}
                        </span>
                        <button
                          className="icon-button"
                          aria-label="이전 카드"
                          disabled={slide === 0}
                          onClick={() => setSlide(slide - 1)}
                        >
                          <ChevronLeft />
                        </button>
                        <div>
                          {story.slides.map((_, i) => (
                            <button
                              key={i}
                              className={slide === i ? "active" : ""}
                              aria-label={i + 1 + "번째 카드"}
                              aria-current={slide === i ? "step" : undefined}
                              onClick={() => setSlide(i)}
                            />
                          ))}
                        </div>
                        <button
                          className="icon-button"
                          aria-label="다음 카드"
                          disabled={slide === story.slides.length - 1}
                          onClick={() => setSlide(slide + 1)}
                        >
                          <ChevronRight />
                        </button>
                        <button
                          className="text-button"
                          disabled={!!busy}
                          onClick={() => void saveCard()}
                        >
                          <Download size={16} />
                          PNG 저장
                        </button>
                      </div>
                      <div className="daily-takeaway">
                        <strong>기억할 한 문장</strong>
                        <p>{readingExcerpt(story.takeaway, 180)}</p>
                        <div className="brain-actions">
                          <button
                            className="primary-button"
                            disabled={!!busy}
                            onClick={async () => {
                              if (item?.resource_id) onWiki(item.resource_id);
                              else {
                                const saved = await run("archive", {
                                  id: story.feed_id,
                                });
                                if (saved?.resource_id)
                                  onWiki(saved.resource_id);
                              }
                            }}
                          >
                            <Network size={17} />
                            Wiki에서 깊이 읽기
                          </button>
                          {item?.url && (
                            <a
                              href={item.url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-button"
                            >
                              원문 보기 <ArrowUpRight size={15} />
                            </a>
                          )}
                          <button
                            className="text-button"
                            disabled={!!busy}
                            onClick={async () => {
                              const r = await run("archive", {
                                id: story.feed_id,
                              });
                              if (r?.resource_id) onResource(r.resource_id);
                            }}
                          >
                            <BookOpen size={16} />
                            학습 자료 열기
                          </button>
                          <button
                            className={
                              "text-button " + (item?.favorite ? "accent" : "")
                            }
                            disabled={!!busy}
                            onClick={() =>
                              void run("review", {
                                id: story.feed_id,
                                favorite: !item?.favorite,
                              })
                            }
                          >
                            <Bookmark
                              size={16}
                              fill={item?.favorite ? "currentColor" : "none"}
                            />
                            저장
                          </button>
                        </div>
                      </div>
                      <details className="daily-quiz" key={story.feed_id}>
                        <summary>30초 복습 · 이해한 내용 확인하기</summary>
                        <h3>{story.quiz.question}</h3>
                        {answer ? (
                          <p>{story.quiz.answer}</p>
                        ) : (
                          <button
                            className="text-button"
                            onClick={() => setAnswer(true)}
                          >
                            생각한 뒤 해설 보기 <ArrowRight size={15} />
                          </button>
                        )}
                        <button
                          className={
                            "secondary-button " + (item?.learned ? "done" : "")
                          }
                          disabled={!!busy}
                          onClick={() =>
                            void run("review", {
                              id: story.feed_id,
                              learned: !item?.learned,
                            })
                          }
                        >
                          <Check size={16} />
                          {item?.learned
                            ? "학습 완료"
                            : "오늘 배운 내용으로 표시"}
                        </button>
                      </details>
                    </div>
                  </div>
                </>
              ) : (
                <div className="brain-empty">
                  <CalendarDays size={36} />
                  <h2>첫 번째 발견을 모아볼까요?</h2>
                  <p>
                    공식 발표·실용 팁·연구·영상의 공개 피드를 모아 날짜별로
                    보관합니다.
                  </p>
                  <button
                    className="primary-button"
                    disabled={!!busy}
                    onClick={() => void run("collect")}
                  >
                    지금 첫 자료 수집
                  </button>
                </div>
              )}
              {items.length > 0 && (
                <details className="discovery-section discovery-fold">
                  <summary>더 살펴볼 소식 · {items.length}개 후보</summary>
                  <div className="brain-section-title">
                    <h2>더 살펴볼 발견</h2>
                    <span>
                      최신성·관심 주제·공개 조회수 기준 · 전체 인기 순위 아님
                    </span>
                  </div>
                  <div className="discovery-grid">
                    {items.slice(0, 18).map((i) => (
                      <article key={i.id}>
                        <span>
                          {i.source_name}
                          <small>
                            {i.published_at?.slice(0, 10) || "발행일 미확인"}
                          </small>
                        </span>
                        <h3>
                          <a href={i.url} target="_blank" rel="noreferrer">
                            {i.title}
                            <ArrowUpRight size={14} />
                          </a>
                        </h3>
                        <p>
                          {i.excerpt.slice(0, 170) ||
                            "원문에서 내용을 확인해 주세요."}
                        </p>
                        <footer>
                          <small>
                            {i.metrics.views
                              ? Intl.NumberFormat("ko").format(
                                  i.metrics.views,
                                ) + "회 조회"
                              : i.rank_reason}
                          </small>
                          <button
                            className="icon-button"
                            aria-label={i.title + " 라이브러리에 저장"}
                            disabled={!!busy}
                            onClick={() => void run("archive", { id: i.id })}
                          >
                            <Bookmark size={16} />
                          </button>
                        </footer>
                      </article>
                    ))}
                  </div>
                </details>
              )}
              {issue && (
                <details className="source-report">
                  <summary>
                    수집 경로 상태 · {issue.source_report.length}개
                  </summary>
                  {issue.source_report.map((s) => (
                    <div key={s.id}>
                      <strong>{s.name}</strong>
                      <span>{s.error || s.count + "개 후보 확인"}</span>
                    </div>
                  ))}
                </details>
              )}
            </>
          )}
          {view === "wiki" && (
            <>
              {sourceId && (
                <section className="wiki-source-context">
                  <BookOpen size={21} />
                  <div>
                    <strong>
                      {data?.resources?.find(
                        (r: { id: string; title: string }) => r.id === sourceId,
                      )?.title || "선택한 자료"}
                    </strong>
                    <p>
                      {relevant.length
                        ? `이 자료와 연결된 Wiki ${relevant.length}개`
                        : "연결된 Wiki가 아직 없습니다. 자료로 위키 정리를 실행하면 상세 지식을 연결합니다."}
                    </p>
                  </div>
                  <button className="text-button" onClick={onClearSource}>
                    전체 Wiki 보기
                  </button>
                </section>
              )}
              <div className="wiki-stats">
                <div>
                  <strong>{pages.length}</strong>
                  <span>연결된 지식 문서</span>
                </div>
                <div>
                  <strong>
                    {new Set(pages.flatMap((p) => p.source_ids)).size}
                  </strong>
                  <span>근거가 된 자료</span>
                </div>
                <div>
                  <strong>
                    {pages.reduce((n, p) => n + p.links.length, 0)}
                  </strong>
                  <span>문서 간 연결</span>
                </div>
                <div>
                  <strong>{(data?.lint || []).length}</strong>
                  <span>살펴볼 항목</span>
                </div>
              </div>
              <form
                className="wiki-question"
                onSubmit={(e) => {
                  e.preventDefault();
                  void run("ask", { question });
                }}
              >
                <Sparkles size={22} />
                <div>
                  <label htmlFor="wiki-question">내 지식에 질문하기</label>
                  <input
                    id="wiki-question"
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    maxLength={1500}
                    placeholder="RAG와 파인튜닝은 언제 구분해서 사용하면 좋을까?"
                    required
                    minLength={3}
                  />
                </div>
                <button
                  className="primary-button"
                  disabled={!!busy || question.trim().length < 3}
                >
                  {busy === "ask" ? (
                    <LoaderCircle className="spin" size={17} />
                  ) : (
                    <ArrowRight size={18} />
                  )}
                  답변을 위키에 저장
                </button>
              </form>
              <div className="brain-tabs">
                {[
                  ["pages", "지식 문서"],
                  ["graph", "연결 지도"],
                  ["lint", "위키 점검"],
                ].map(([id, label]) => (
                  <button
                    key={id}
                    className={wikiTab === id ? "active" : ""}
                    onClick={() => setWikiTab(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {wikiTab === "graph" ? (
                <KnowledgeGraph
                  pages={pages}
                  onSelect={(slug) => {
                    openWikiPage(slug);
                    setWikiTab("pages");
                  }}
                />
              ) : wikiTab === "lint" ? (
                <div className="wiki-lint">
                  <h2>위키를 오래 쓸 수 있게</h2>
                  <p>
                    출처 변경·끊긴 링크·고립 문서와 AI가 남긴 검토 쟁점을
                    확인합니다. 사실 검증이 자동 완료됐다는 의미는 아닙니다.
                  </p>
                  {(data?.lint || []).length ? (
                    (data.lint as any[]).map((l, i) => (
                      <button
                        key={i}
                        onClick={() => {
                          setSelectedSlug(
                            pages.find((p) => p.id === l.page_id)?.slug || "",
                          );
                          setWikiTab("pages");
                        }}
                      >
                        <span className="brain-pill">{l.kind}</span>
                        <strong>{l.title}</strong>
                        <span>{l.message}</span>
                        <ChevronRight size={16} />
                      </button>
                    ))
                  ) : (
                    <div className="brain-notice">
                      현재 발견된 구조 점검 항목이 없습니다.
                    </div>
                  )}
                </div>
              ) : relevant.length ? (
                <div className="wiki-layout">
                  <aside className="wiki-index">
                    <label className="wiki-search">
                      <Search size={16} />
                      <input
                        aria-label="위키 검색"
                        placeholder="지식 문서 검색"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                    </label>
                    {filtered.map((p) => (
                      <button
                        key={p.id}
                        className={p.id === selected?.id ? "active" : ""}
                        onClick={() => {
                          setSelectedSlug(p.slug);
                          setRevisions(null);
                        }}
                      >
                        <span>
                          {p.kind === "question"
                            ? "질문과 답"
                            : p.kind === "concept"
                              ? "개념"
                              : p.kind === "entity"
                                ? "도구·인물"
                                : p.kind === "guide"
                                  ? "활용 가이드"
                                  : "종합 정리"}
                        </span>
                        <strong>{p.title}</strong>
                        <small>
                          출처 {p.source_ids.length}개 · v{p.revision}
                        </small>
                      </button>
                    ))}
                  </aside>
                  {selected && (
                    <article className="wiki-document">
                      <div className="wiki-document-meta">
                        <span>
                          지속적으로 쌓이는 지식 · v{selected.revision}
                        </span>
                        <div>
                          <button
                            className="icon-button"
                            aria-label="변경 이력 보기"
                            onClick={async () => {
                              try {
                                setRevisions(
                                  (
                                    await api(
                                      "/api/brain?view=history&id=" +
                                        selected.id,
                                    )
                                  ).revisions,
                                );
                              } catch (e) {
                                setError((e as Error).message);
                              }
                            }}
                          >
                            <History size={17} />
                          </button>
                          <button
                            className="text-button"
                            disabled={!!busy}
                            onClick={() =>
                              void run("protect", {
                                id: selected.id,
                                protected: !selected.protected,
                              })
                            }
                          >
                            {selected.protected ? (
                              <LockKeyhole size={15} />
                            ) : (
                              <Unlock size={15} />
                            )}{" "}
                            {selected.protected
                              ? "검토 완료 · 자동 수정 보호"
                              : "검토 완료로 보호"}
                          </button>
                        </div>
                      </div>
                      <h2>{selected.title}</h2>
                      <p className="wiki-summary">{selected.summary}</p>
                      <section
                        className="wiki-reading-map"
                        aria-label="이 문서의 지식 연결"
                      >
                        <span>
                          근거 자료{" "}
                          <strong>{selected.source_ids.length}개</strong>
                        </span>
                        <ArrowRight aria-hidden="true" />
                        <span className="wiki-map-center">
                          {selected.title}
                        </span>
                        {selected.links.length > 0 && (
                          <>
                            <ArrowRight aria-hidden="true" />
                            <span>
                              관련 개념{" "}
                              <strong>{selected.links.length}개</strong>
                            </span>
                          </>
                        )}
                      </section>
                      <div className="wiki-depth-heading">
                        <BookOpen size={18} />
                        <h3>상세 설명과 근거</h3>
                      </div>
                      <div className="wiki-markdown">
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          components={{
                            a: ({ href, children }) =>
                              href?.startsWith("#wiki-") ? (
                                <button
                                  className="inline-wiki-link"
                                  onClick={() =>
                                    openWikiPage(
                                      decodeURIComponent(href.slice(6)),
                                    )
                                  }
                                >
                                  {children}
                                </button>
                              ) : (
                                <a href={href} target="_blank" rel="noreferrer">
                                  {children}
                                </a>
                              ),
                          }}
                        >
                          {selected.body.replace(
                            /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g,
                            (_m, slug, label) =>
                              "[" +
                              (label || slug) +
                              "](#wiki-" +
                              encodeURIComponent(slug) +
                              ")",
                          )}
                        </ReactMarkdown>
                      </div>
                      <section className="wiki-citations">
                        <h3>이 설명의 근거</h3>
                        {selected.source_ids.map((id) => (
                          <button key={id} onClick={() => onResource(id)}>
                            <BookOpen size={16} />
                            {data.resources?.find((r: any) => r.id === id)
                              ?.title || "보관된 출처 확인"}
                            <ArrowUpRight size={15} />
                          </button>
                        ))}
                      </section>
                      {selected.caveats.length > 0 && (
                        <section className="wiki-caveats">
                          <h3>아직 확인할 것</h3>
                          {selected.caveats.map((c, i) => (
                            <p key={i}>{c}</p>
                          ))}
                        </section>
                      )}
                      <div className="wiki-related">
                        {selected.links.map((slug) => (
                          <button key={slug} onClick={() => openWikiPage(slug)}>
                            <GitBranch size={15} />
                            {pages.find((p) => p.slug === slug)?.title || slug}
                          </button>
                        ))}
                      </div>
                      {revisions && (
                        <details className="wiki-history" open>
                          <summary>저장된 변경 이력</summary>
                          {revisions.map((r) => (
                            <div key={r.revision}>
                              <strong>
                                v{r.revision} ·{" "}
                                {r.created_at.slice(0, 16).replace("T", " ")}
                              </strong>
                              <p>{r.snapshot.summary}</p>
                              <details>
                                <summary>당시 문서 보기</summary>
                                <pre>{r.snapshot.body}</pre>
                              </details>
                            </div>
                          ))}
                        </details>
                      )}
                    </article>
                  )}
                </div>
              ) : (
                <div className="brain-empty">
                  <Network size={38} />
                  <h2>첫 지식 문서를 연결해 보세요</h2>
                  <p>
                    저장한 자료를 읽어 개념·활용법·차이점을 종합합니다. 원문은
                    보존하고 위키의 수정 이력도 남깁니다.
                  </p>
                  <button
                    className="primary-button"
                    disabled={!!busy}
                    onClick={() =>
                      void run("compile", sourceId ? { sourceId } : {})
                    }
                  >
                    새 자료를 위키에 정리
                  </button>
                </div>
              )}
              {data?.tasks?.[0]?.error && (
                <p className="brain-warning">
                  최근 정리 상태: {data.tasks[0].error}
                </p>
              )}
            </>
          )}
          {view === "obsidian" && (
            <>
              <div className="vault-hero">
                <div>
                  <span className="edition-label">
                    YOUR KNOWLEDGE, YOUR FILES
                  </span>
                  <h2>
                    웹에서 발견하고,
                    <br />
                    Obsidian에서 생각하세요.
                  </h2>
                  <p>
                    원문, 학습 노트, 지식 위키와 매일의 카드뉴스를 하나의
                    보관함으로 내보냅니다. 링크·백링크·그래프를 Obsidian의 기본
                    기능으로 사용할 수 있습니다.
                  </p>
                  <div className="brain-actions">
                    <button
                      className="primary-button"
                      disabled={!!busy}
                      onClick={() => void exportFiles()}
                    >
                      <Download size={18} />
                      보관함 ZIP 내려받기
                    </button>
                    <button
                      className="secondary-button"
                      disabled={!!busy}
                      onClick={() => void exportFiles(true)}
                    >
                      <FolderSync size={18} />
                      로컬 폴더에 동기화
                    </button>
                  </div>
                </div>
                <div className="vault-tree">
                  <span>
                    <FolderSync size={20} /> AI Atlas Second Brain
                  </span>
                  {[
                    ["raw/", "보존된 원문"],
                    ["library/", "학습 노트와 내 메모"],
                    ["wiki/", "연결된 개념과 설명"],
                    ["daily/", "날짜별 카드뉴스"],
                    ["personal/", "직접 쓰는 생각"],
                    ["index.md", "전체 지식의 목차"],
                    ["지식 지도.canvas", "문서 연결 지도"],
                  ].map(([name, desc]) => (
                    <div key={name}>
                      <code>{name}</code>
                      <small>{desc}</small>
                    </div>
                  ))}
                </div>
              </div>
              <div className="vault-how">
                <article>
                  <span>01</span>
                  <h3>보관함으로 열기</h3>
                  <p>
                    ZIP을 풀고 Obsidian의 ‘폴더를 보관함으로 열기’에서
                    선택하세요. 별도의 커뮤니티 플러그인은 필요하지 않습니다.
                  </p>
                </article>
                <article>
                  <span>02</span>
                  <h3>연결을 따라 생각하기</h3>
                  <p>
                    index.md에서 시작해 관련 문서와 근거 원문을 오가세요. 직접
                    쓰는 생각은 personal 폴더에 남기세요.
                  </p>
                </article>
                <article>
                  <span>03</span>
                  <h3>새 자료를 가져오기</h3>
                  <p>
                    웹의 매일 수집은 PC가 꺼져 있어도 실행됩니다. 로컬 파일은 이
                    화면에서 폴더 동기화를 눌렀을 때 갱신됩니다.
                  </p>
                </article>
              </div>
              <div className="brain-notice">
                <LockKeyhole size={17} />
                <span>
                  로컬에서 수정한 파일과 personal 폴더는 덮어쓰지 않습니다. 기존
                  파일을 자동 삭제하지 않으며 충돌은 건너뜁니다. 폴더 연결을
                  지원하지 않는 브라우저에서는 ZIP을 이용하세요.
                </span>
              </div>
              <p className="brain-muted">
                양방향 자동 동기화는 아닙니다. Obsidian에서 쓴 글을 웹 위키에
                반영하려면 해당 Markdown 파일을 자료 추가로 가져오세요.
              </p>
            </>
          )}
        </>
      )}
      {busy && (
        <div className="brain-busy" role="status">
          <LoaderCircle className="spin" size={16} />
          {busy === "collect"
            ? "공개 자료를 모으고 카드를 준비하고 있어요."
            : busy === "compile" || busy === "ask"
              ? "출처를 읽고 지식 문서를 연결하고 있어요."
              : "처리하고 있어요."}
        </div>
      )}
    </section>
  );
}
function KnowledgeGraph({
  pages,
  onSelect,
}: {
  pages: WikiPage[];
  onSelect: (slug: string) => void;
}) {
  const shown = pages.slice(0, 30),
    width = 900,
    height = 620;
  const positions = new Map(
    shown.map((p, i) => [
      p.slug,
      {
        x:
          width / 2 +
          Math.cos(i * 2.39996) *
            Math.sqrt((i + 1) / Math.max(1, shown.length)) *
            340,
        y:
          height / 2 +
          Math.sin(i * 2.39996) *
            Math.sqrt((i + 1) / Math.max(1, shown.length)) *
            230,
      },
    ]),
  );
  return (
    <div className="knowledge-graph">
      <div className="brain-section-title">
        <h2>문서를 따라 이어지는 생각</h2>
        <span>
          문서를 누르면 설명과 근거를 볼 수 있습니다. · 최대 30개 표시
        </span>
      </div>
      {shown.length ? (
        <svg
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label="위키 문서 연결 지도"
        >
          <g>
            {shown.flatMap((p) =>
              p.links.map((slug) => {
                const a = positions.get(p.slug),
                  b = positions.get(slug);
                return a && b ? (
                  <line
                    key={p.slug + "-" + slug}
                    x1={a.x}
                    y1={a.y}
                    x2={b.x}
                    y2={b.y}
                  />
                ) : null;
              }),
            )}
          </g>
          {shown.map((p, i) => {
            const pos = positions.get(p.slug)!;
            return (
              <g
                key={p.id}
                className={"graph-node graph-color-" + (i % 4)}
                transform={`translate(${pos.x},${pos.y})`}
                tabIndex={0}
                role="button"
                aria-label={p.title}
                onClick={() => onSelect(p.slug)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") onSelect(p.slug);
                }}
              >
                <circle r={19 + Math.min(12, p.source_ids.length * 2)} />
                <text textAnchor="middle" y="49">
                  {p.title.slice(0, 19)}
                </text>
                <title>
                  {p.title + " · 출처 " + p.source_ids.length + "개"}
                </title>
              </g>
            );
          })}
        </svg>
      ) : (
        <div className="brain-empty">
          <Network size={40} />
          <p>위키 문서가 만들어지면 연결 지도가 나타납니다.</p>
        </div>
      )}
    </div>
  );
}
