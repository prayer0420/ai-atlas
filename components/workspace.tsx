"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import {
  createClient,
  type SupabaseClient,
  type Session,
} from "@supabase/supabase-js";
import {
  clearSelectionForAuth,
  cleanAuthCallbackUrl,
  parseAuthCallback,
  restoreBrowserSession,
} from "@/lib/browser-auth";
import {
  ArrowUpRight,
  ArrowRight,
  BookOpen,
  Bookmark,
  Check,
  ChevronDown,
  Clock,
  Compass,
  FileText,
  FolderOpen,
  Grid2X2,
  Layers,
  Link as LinkIcon,
  List,
  LoaderCircle,
  KeyRound,
  LogIn,
  LogOut,
  Menu,
  Plus,
  Search,
  Settings2,
  Sparkles,
  Trash2,
  Upload,
  X,
  Play as Youtube,
  Camera as Instagram,
  Network,
  AlertCircle,
  RotateCcw,
  CalendarDays,
  FolderSync,
} from "lucide-react";
import {
  categories,
  sourceNames,
  type Resource,
  type AppConfig,
} from "@/lib/types";
import { demoResources } from "@/lib/demo";
import { Cover } from "./diagram";
import { LessonView } from "./lesson-view";
import { readingExcerpt } from "@/lib/reading";
import dynamic from "next/dynamic";
import { AutomationStatus } from "./automation-status";
import { learningProgress } from "@/lib/learning-progress";
import { PasswordSettings } from "./password-settings";
const BrainPanel = dynamic(() =>
  import("./brain-panel").then((module) => module.BrainPanel),
);
type View =
  | "library"
  | "favorites"
  | "learned"
  | "inbox"
  | "map"
  | "trash"
  | "settings"
  | "daily"
  | "wiki"
  | "obsidian";
function SourceIcon({ type }: { type: string }) {
  return type === "youtube" ? (
    <Youtube size={15} />
  ) : type === "instagram" ? (
    <Instagram size={15} />
  ) : type === "text" ? (
    <FileText size={15} />
  ) : (
    <LinkIcon size={15} />
  );
}
export function Workspace() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [client, setClient] = useState<SupabaseClient | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [resources, setResources] = useState<Resource[]>(demoResources);
  const [selected, setSelected] = useState<Resource | null>(null);
  const [view, setView] = useState<View>("library");
  const [wikiSource, setWikiSource] = useState<string | null>(null);
  const [category, setCategory] = useState("전체");
  const [query, setQuery] = useState("");
  const [source, setSource] = useState("all");
  const [stateFilter, setStateFilter] = useState("all");
  const [addAdvanced, setAddAdvanced] = useState(false);
  const [sort, setSort] = useState("new");
  const [layout, setLayout] = useState("grid");
  const [navOpen, setNavOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [toast, setToast] = useState("");
  const [error, setError] = useState("");
  const [dialog, setDialog] = useState<"add" | "auth" | null>(null);
  const [authMessage, setAuthMessage] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [addType, setAddType] = useState("link");
  const [addUrl, setAddUrl] = useState("");
  const [addText, setAddText] = useState("");
  const [addTitle, setAddTitle] = useState("");
  const [adding, setAdding] = useState(false);
  const [autoAnalyze, setAutoAnalyze] = useState(true);
  const modal = useRef<HTMLDialogElement>(null);
  const loadVersion = useRef(0);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const isDemo = !session;
  const captureHandled = useRef(false);
  const deepLinkHandled = useRef(false);
  const searchInput = useRef<HTMLInputElement>(null);
  const collection = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setNavOpen(false);
      if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === "k" &&
        searchInput.current &&
        !dialog
      ) {
        event.preventDefault();
        searchInput.current.focus();
        searchInput.current.scrollIntoView({
          block: "center",
          behavior: "auto",
        });
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [dialog]);
  useEffect(() => {
    if (!authReady || captureHandled.current) return;
    const p = new URLSearchParams(window.location.search);
    if (
      !p.has("capture_url") &&
      !p.has("capture_text") &&
      !p.has("capture_title")
    )
      return;
    if (!session) {
      setDialog("auth");
      return;
    }
    captureHandled.current = true;
    const text = (p.get("capture_text") || "").slice(0, 60000);
    const candidate =
      p.get("capture_url") || text.match(/https?:\/\/[^\s<>]+/)?.[0] || "";
    const url = /^https?:\/\//i.test(candidate) ? candidate.slice(0, 2048) : "";
    setAddUrl(url);
    setAddText(text === url ? "" : text);
    setAddTitle((p.get("capture_title") || "").slice(0, 120));
    setAddType(url ? "link" : "text");
    setDialog("add");
    window.history.replaceState(null, "", window.location.pathname);
  }, [authReady, session]);
  const active = resources.filter((r) => !r.deleted_at);
  const notify = (s: string) => {
    setToast(s);
    setTimeout(() => setToast(""), 4500);
  };
  useEffect(() => {
    let sub: (() => void) | undefined;
    let live = true;
    fetch("/api/config")
      .then((r) => r.json())
      .then(async (c: AppConfig) => {
        if (!live) return;
        setConfig(c);
        if (c.supabaseUrl && c.supabaseAnonKey) {
          const sb = createClient(c.supabaseUrl, c.supabaseAnonKey, {
            auth: {
              storageKey: "ai-atlas-auth",
              persistSession: true,
              autoRefreshToken: true,
              detectSessionInUrl: false,
              storage: window.localStorage,
            },
          });
          setClient(sb);
          let sessionUserId: string | undefined;
          const {
            data: { subscription },
          } = sb.auth.onAuthStateChange((event, s) => {
            setSession(s);
            if (clearSelectionForAuth(event, sessionUserId, s?.user.id))
              setSelected(null);
            sessionUserId = s?.user.id;
          });
          sub = () => subscription.unsubscribe();
          const callback = parseAuthCallback(window.location.href);
          try {
            const restored = await restoreBrowserSession(
              sb,
              window.location.href,
            );
            if (!live) return;
            setSession(restored.session);
            if (restored.callback) {
              window.history.replaceState(
                null,
                "",
                cleanAuthCallbackUrl(window.location.href),
              );
              if (restored.session) notify("내 자료실에 연결했습니다.");
            }
          } catch (authError) {
            if (!live) return;
            setSession(null);
            setDialog("auth");
            setAuthMessage(
              "로그인 정보를 복원하지 못했습니다. 로그인 ID와 비밀번호로 다시 로그인해 주세요.",
            );
            if (callback)
              window.history.replaceState(
                null,
                "",
                cleanAuthCallbackUrl(window.location.href),
              );
          }
        }
        setAuthReady(true);
      })
      .catch(() => {
        setError("연결 상태를 불러오지 못했습니다. 새로고침해 주세요.");
        setAuthReady(true);
      });
    return () => {
      live = false;
      sub?.();
    };
  }, []);
  const api = useCallback(
    async (path: string, options: RequestInit = {}) => {
      const token = (await client?.auth.getSession())?.data.session
        ?.access_token;
      if (!token) throw new Error("로그인 후 사용할 수 있습니다.");
      const res = await fetch(path, {
        ...options,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          ...options.headers,
        },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "요청을 처리하지 못했습니다.");
      return data;
    },
    [client],
  );
  const fetchFile = useCallback(
    async (path: string) => {
      const token = (await client?.auth.getSession())?.data.session
        ?.access_token;
      if (!token) throw new Error("로그인 후 사용할 수 있습니다.");
      const response = await fetch(path, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "파일을 불러오지 못했습니다.");
      }
      return response.blob();
    },
    [client],
  );
  const load = useCallback(
    async (quiet = false) => {
      if (!session || ["daily", "wiki", "obsidian"].includes(view)) return;
      const version = ++loadVersion.current;
      if (!quiet) {
        setLoading(true);
        setError("");
      }
      try {
        const p = new URLSearchParams({
          q: query,
          category,
          source,
          view,
          sort,
          state: stateFilter,
          page: String(page),
        });
        const data = await api("/api/resources?" + p);
        if (version !== loadVersion.current) return;
        setResources(data.resources);
        setTotal(data.total);
      } catch (e) {
        if (version === loadVersion.current) setError((e as Error).message);
      } finally {
        if (version === loadVersion.current) setLoading(false);
      }
    },
    [api, session, query, category, source, view, sort, page, stateFilter],
  );
  useEffect(() => {
    if (!authReady || deepLinkHandled.current) return;
    const p = new URLSearchParams(window.location.search),
      id = p.get("resource"),
      slug = p.get("wiki");
    if (!id && !slug) return;
    if (!session) {
      setDialog("auth");
      return;
    }
    deepLinkHandled.current = true;
    if (slug) {
      setView("wiki");
      return;
    }
    if (id)
      void api("/api/resources/" + encodeURIComponent(id))
        .then((r) => setSelected(r.resource))
        .catch((e) => setError((e as Error).message));
  }, [authReady, session, api]);
  useEffect(() => {
    if (session) {
      const timer = setTimeout(load, 250);
      return () => {
        clearTimeout(timer);
        loadVersion.current++;
      };
    } else {
      loadVersion.current++;
      setLoading(false);
      setResources(demoResources);
      setSelected(null);
    }
  }, [load, session]);
  useEffect(() => {
    if (dialog) {
      modal.current?.showModal();
    } else modal.current?.close();
  }, [dialog]);
  useEffect(() => {
    setPage(0);
  }, [query, category, source, view, sort, stateFilter]);
  useEffect(() => {
    if (!session) return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void load(true);
    }, 5000);
    return () => clearInterval(timer);
  }, [session, load]);
  const automationUpdated = useCallback(() => {
    void load(true);
  }, [load]);
  useEffect(() => {
    if (
      !selected ||
      selected.demo ||
      !["queued", "running"].includes(
        (selected.progress || learningProgress(selected)).phase,
      )
    )
      return;
    let live = true;
    const timer = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void api("/api/resources/" + selected.id)
        .then((result) => {
          if (live)
            setSelected((current) =>
              current?.id === selected.id ? result.resource : current,
            );
        })
        .catch(() => {});
    }, 5000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [selected, api]);
  useEffect(() => {
    if (!selected || selected.demo) return;
    const updated = resources.find((r) => r.id === selected.id);
    if (
      !updated ||
      (updated.updated_at === selected.updated_at &&
        updated.progress?.phase === selected.progress?.phase)
    )
      return;
    let live = true;
    void api("/api/resources/" + selected.id)
      .then((r) => {
        if (live) setSelected(r.resource);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [resources, selected, api]);
  function navigate(v: View, cat = "전체") {
    window.history.replaceState(null, "", window.location.pathname);
    setWikiSource(null);
    setView(v);
    setCategory(cat);
    setSelected(null);
    setNavOpen(false);
    setQuery("");
    setSource("all");
    setStateFilter("all");
    setPage(0);
  }
  function requireAuth() {
    setAuthMessage("");
    setDialog("auth");
  }
  async function openResource(r: Resource) {
    setError("");
    if (r.demo) {
      setSelected(r);
      return;
    }
    try {
      const data = await api("/api/resources/" + r.id);
      setSelected(data.resource);
      window.history.replaceState(
        null,
        "",
        "?resource=" + encodeURIComponent(r.id),
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function update(data: Partial<Resource>) {
    if (!selected) return false;
    if (isDemo) {
      requireAuth();
      return false;
    }
    setBusy(true);
    try {
      const result = await api("/api/resources/" + selected.id, {
        method: "PATCH",
        body: JSON.stringify(data),
      });
      setSelected(result.resource);
      setResources((items) =>
        items.map((x) => (x.id === selected.id ? result.resource : x)),
      );
      await load();
      notify("저장했습니다.");
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function analyze(id = selected?.id) {
    if (!id) return;
    if (isDemo) {
      requireAuth();
      return;
    }
    setBusy(true);
    setAnalyzing(true);
    setError("");
    notify("정리 요청을 보내고 있어요.");
    try {
      const data = await api(`/api/resources/${id}/analyze`, {
        method: "POST",
      });
      setSelected((current) => (current?.id === id ? data.resource : current));
      await load(true);
      notify(
        data.queued
          ? data.message
          : data.resource.status === "ready"
            ? "새 학습 노트가 완성됐어요."
            : "자료를 확인해 주세요.",
      );
    } catch (e) {
      await load();
      setError((e as Error).message);
      try {
        const data = await api("/api/resources/" + id);
        setSelected((current) =>
          current?.id === id ? data.resource : current,
        );
      } catch {}
    } finally {
      setBusy(false);
      setAnalyzing(false);
    }
  }
  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!session) {
      requireAuth();
      return;
    }
    setAdding(true);
    setError("");
    try {
      const data = await api("/api/resources", {
        method: "POST",
        body: JSON.stringify({
          title: addTitle,
          url: addType === "link" ? addUrl : "",
          text: addText,
          analyze: autoAnalyze,
        }),
      });
      setDialog(null);
      setAddUrl("");
      setAddText("");
      setAddTitle("");
      setSelected(data.resource);
      await load();
      notify(
        data.duplicate
          ? "이미 저장한 자료를 열었어요."
          : "자료를 저장했습니다.",
      );
      if (data.queueError) setError(data.queueError);
      else if (data.queued)
        notify(
          "자료를 저장하고 정리를 예약했어요. 완료되면 자동으로 표시됩니다.",
        );
      else if (
        autoAnalyze &&
        config?.ai &&
        config.aiMode !== "local" &&
        !data.duplicate
      )
        await analyze(data.resource.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setAdding(false);
    }
  }
  async function auth(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!client) return;
    setAuthBusy(true);
    setAuthMessage("");
    const form = new FormData(e.currentTarget);
    const creds = {
      username: String(form.get("username")).trim(),
      password: String(form.get("password")),
    };
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(creds),
      });
      const tokens = await response.json();
      if (!response.ok)
        throw new Error(tokens.error || "로그인하지 못했습니다.");
      const { data, error } = await client.auth.setSession(tokens);
      if (error) throw error;
      if (data.session) {
        setDialog(null);
        notify("내 자료실에 연결했습니다.");
      } else
        setAuthMessage("로그인하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } catch (e) {
      const msg = (e as Error).message;
      setAuthMessage(
        msg.includes("Invalid login")
          ? "아이디 또는 비밀번호를 확인해 주세요."
          : msg.includes("Email not confirmed")
            ? "계정 설정 확인이 필요합니다. 운영자에게 문의해 주세요."
            : msg,
      );
    } finally {
      setAuthBusy(false);
    }
  }
  async function trash() {
    if (!selected) return;
    if (isDemo) {
      requireAuth();
      return;
    }
    try {
      await api("/api/resources/" + selected.id, { method: "DELETE" });
      setSelected(null);
      await load();
      notify("휴지통으로 옮겼습니다. 언제든 복원할 수 있어요.");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function restore(r: Resource) {
    try {
      await api("/api/resources/" + r.id, {
        method: "PATCH",
        body: JSON.stringify({ restore: true }),
      });
      await load();
      notify("자료를 복원했습니다.");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  let shown = isDemo
    ? resources.filter(
        (r) =>
          !r.deleted_at &&
          (category === "전체" || r.category === category) &&
          (source === "all" || r.source_type === source) &&
          (!query ||
            [r.title, r.raw_text, ...r.tags]
              .join(" ")
              .toLowerCase()
              .includes(query.toLowerCase())) &&
          (view !== "favorites" || r.favorite) &&
          (view !== "learned" || r.learned) &&
          (view !== "inbox" || r.status !== "ready") &&
          view !== "trash" &&
          (stateFilter === "all" ||
            (stateFilter === "ready"
              ? r.status === "ready"
              : stateFilter === "pending"
                ? ["saved", "analyzing"].includes(r.status)
                : ["failed", "needs_content"].includes(r.status))),
      )
    : resources;
  if (isDemo && sort === "title")
    shown = [...shown].sort((a, b) => a.title.localeCompare(b.title, "ko"));
  if (isDemo && sort === "old")
    shown = [...shown].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const title =
    category !== "전체"
      ? category
      : {
          library: "내 자료",
          favorites: "즐겨찾기",
          learned: "학습 완료",
          inbox: "정리할 자료",
          map: "분야별 지식 지도",
          trash: "휴지통",
          settings: "설정",
          daily: "새 소식",
          wiki: "지식 노트",
          obsidian: "Obsidian · Second Brain",
        }[view];
  if (!authReady)
    return (
      <main className="loading-state" aria-busy="true" aria-live="polite">
        <LoaderCircle className="spin" />
        <p>내 자료실에 연결하고 있어요.</p>
      </main>
    );
  return (
    <div className="app-shell simple-workspace">
      <a className="skip-link" href="#main">
        본문으로 건너뛰기
      </a>
      {navOpen && (
        <button
          className="nav-scrim"
          aria-label="메뉴 닫기"
          onClick={() => setNavOpen(false)}
        />
      )}
      <aside className={`sidebar ${navOpen ? "open" : ""}`}>
        <button
          className="mobile-nav-close"
          aria-label="사이드바 닫기"
          onClick={() => setNavOpen(false)}
        >
          <X size={20} />
        </button>
        <button className="brand" onClick={() => navigate("library")}>
          <span className="brand-mark">
            A<span />
          </span>
          <span>
            atlas<small>모으고, 읽고, 이해하기</small>
          </span>
        </button>
        <div className="nav-label">나의 공간</div>
        <nav aria-label="주요 메뉴">
          {(
            [
              ["library", BookOpen, "내 자료"],
              ["daily", CalendarDays, "새 소식"],
              ["wiki", Network, "지식 노트"],
            ] as const
          ).map(([id, Icon, label]) => (
            <button
              key={id}
              className={view === id ? "selected" : ""}
              aria-current={view === id ? "page" : undefined}
              onClick={() => navigate(id)}
            >
              <Icon size={19} />
              {label}
            </button>
          ))}
        </nav>
        <details className="nav-more">
          <summary>
            더 보기 <ChevronDown size={15} />
          </summary>
          <nav aria-label="보관한 자료">
            {(
              [
                ["favorites", Bookmark, "즐겨찾기"],
                ["learned", Check, "읽은 자료"],
                ["inbox", FolderOpen, "정리할 자료"],
                ["map", Network, "분야별 탐색"],
                ["trash", Trash2, "휴지통"],
              ] as const
            ).map(([id, Icon, label]) => (
              <button
                key={id}
                className={view === id ? "selected" : ""}
                onClick={() => navigate(id)}
              >
                <Icon size={18} />
                {label}
              </button>
            ))}
          </nav>
        </details>
        <div className="sidebar-bottom">
          <nav>
            <button
              onClick={() => navigate("settings")}
              className={view === "settings" ? "selected" : ""}
            >
              <Settings2 size={18} />
              설정
            </button>
          </nav>
          <button
            className="profile"
            onClick={session ? () => navigate("settings") : requireAuth}
          >
            <span className="avatar">A</span>
            <span>
              <strong>{session ? "나의 자료실" : "체험 자료실"}</strong>
              <small>
                {session ? "개인 계정 설정" : "로그인하고 나만의 자료 모으기"}
              </small>
            </span>
            {session ? <Settings2 size={16} /> : <LogIn size={16} />}
          </button>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-menu"
              aria-label="메뉴 열기"
              onClick={() => setNavOpen(true)}
            >
              <Menu size={20} />
            </button>
            <span>AI Atlas</span>
            <span className="slash">/</span>
            <strong>{selected ? "자료 읽기" : title}</strong>
          </div>
          <div className="topbar-right">
            <button
              className="primary-button"
              onClick={() => {
                setAddAdvanced(false);
                session ? setDialog("add") : requireAuth();
              }}
            >
              <Plus size={18} />
              자료 추가
            </button>
            {!session && (
              <button className="text-button" onClick={requireAuth}>
                로그인 <ArrowUpRight size={15} />
              </button>
            )}
          </div>
        </header>
        <main id="main" tabIndex={-1}>
          {session && !selected && config?.aiMode === "local" && (
            <AutomationStatus
              api={api}
              onUpdated={automationUpdated}
              mode={
                view === "settings" && !selected
                  ? "settings"
                  : view === "daily" && !selected
                    ? "collection"
                    : "compact"
              }
              onSettings={() => navigate("settings")}
            />
          )}
          {error && (
            <div className="error-banner" role="alert">
              <AlertCircle size={18} />
              <span>{error}</span>
              <button
                className="icon-button"
                aria-label="오류 닫기"
                onClick={() => setError("")}
              >
                <X size={16} />
              </button>
            </div>
          )}
          {selected ? (
            <LessonView
              key={selected.id}
              resource={selected}
              api={api}
              fetchFile={fetchFile}
              onBack={() => {
                setSelected(null);
                window.history.replaceState(null, "", window.location.pathname);
              }}
              onUpdate={update}
              onAnalyze={() => analyze()}
              onSaveSource={async (text) => {
                if (await update({ raw_text: text })) {
                  await analyze(selected.id);
                  return true;
                }
                return false;
              }}
              busy={busy}
              onTrash={trash}
              onWiki={() => {
                const id = selected.demo ? null : selected.id;
                navigate("wiki");
                setWikiSource(id);
              }}
            />
          ) : view === "daily" || view === "wiki" || view === "obsidian" ? (
            <BrainPanel
              key={view + ":" + (session?.user.id || "demo")}
              view={view}
              signedIn={!!session}
              api={api}
              onLogin={requireAuth}
              sourceId={wikiSource}
              onWiki={(id) => {
                navigate("wiki");
                setWikiSource(id);
              }}
              onClearSource={() => setWikiSource(null)}
              onResource={async (id) => {
                try {
                  const result = await api("/api/resources/" + id);
                  setSelected(result.resource);
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            />
          ) : (
            <>
              <div
                className={`page-heading ${view === "library" && category === "전체" ? "library-heading" : ""}`}
              >
                <div>
                  <h1>
                    {title}
                    <span className="heading-dot">.</span>
                  </h1>
                  <p>
                    {view === "inbox"
                      ? "대기 중이거나 확인이 필요한 자료입니다. 자료를 열면 다음 행동을 안내합니다."
                      : view === "trash"
                        ? "삭제한 자료를 다시 자료함으로 가져올 수 있어요."
                        : view === "map"
                          ? "관심 분야를 따라 흩어진 지식을 연결해 보세요."
                          : view === "settings"
                            ? "자동 정리, 계정과 내보내기를 관리합니다. 평소에는 바꿀 필요가 없습니다."
                            : "자료를 추가하면 이야기를 정리하고 카드뉴스 이미지까지 만들어요."}
                  </p>
                </div>
              </div>
              {view === "settings" ? (
                <div className="settings-grid">
                  {session && client && (
                    <PasswordSettings key={session.user.id} client={client} />
                  )}
                  {session && (
                    <section className="setting-card full">
                      <h2>로그인 상태</h2>
                      <p>
                        이 브라우저에서는 로그인 상태가 자동으로 유지됩니다.
                      </p>
                      <button
                        className="secondary-button"
                        onClick={async () => {
                          const result = await client?.auth.signOut();
                          if (result?.error) {
                            notify(
                              "로그아웃하지 못했습니다. 다시 시도해 주세요.",
                            );
                            return;
                          }
                          setSession(null);
                          notify("로그아웃했습니다.");
                        }}
                      >
                        <LogOut size={17} /> 로그아웃
                      </button>
                    </section>
                  )}
                  <section className="setting-card full">
                    <h2>내 지식 보관하기</h2>
                    <p>
                      원문과 상세 분석은 자료에 함께 남습니다. 필요할 때 파일로
                      가져갈 수 있어요.
                    </p>
                    <button
                      className="secondary-button"
                      onClick={() => navigate("obsidian")}
                    >
                      <FolderSync size={18} />
                      Obsidian 연결·파일 내보내기
                    </button>
                  </section>
                  <details className="setting-card full">
                    <summary>사용 도움말</summary>
                    <p>
                      ① 자료 추가에서 링크나 텍스트를 넣으세요. ② 원문
                      분석·원고·이미지·검수가 자동으로 이어집니다. ③ 완성된
                      자료에서 이미지와 캡션을 받으세요. 자세한 설명은 상세
                      분석에 남습니다.
                    </p>
                    <p>
                      로그인이 필요한 글이나 영상은 본문·자막이 필요할 수
                      있습니다. 해당 자료의 ‘본문 추가’에서 이어서 정리할 수
                      있습니다.
                    </p>
                    <p>
                      직접 추가한 자료에는 앱의 일일 정리 한도가 없습니다. AI
                      서비스 자체의 사용 제한과 처리 시간은 적용됩니다.
                    </p>
                  </details>
                </div>
              ) : view === "map" ? (
                <div className="knowledge-map">
                  <div className="map-center">
                    <Compass size={28} />
                    <div>
                      <span className="eyebrow">MY AI ATLAS</span>
                      <h2>나의 AI 지식 지도</h2>
                    </div>
                  </div>
                  <div className="map-branches">
                    {categories.map((c, i) => {
                      const count = active.filter(
                        (r) => r.category === c,
                      ).length;
                      return (
                        <button
                          className={`map-branch branch-${i % 4}`}
                          key={c}
                          onClick={() => navigate("library", c)}
                        >
                          <span className="map-branch-number">0{i + 1}</span>
                          <h3>{c}</h3>
                          <p>
                            {isDemo
                              ? `${count}개의 체험 자료`
                              : "이 분야의 자료 탐색"}
                          </p>
                          <ArrowUpRight size={20} />
                        </button>
                      );
                    })}
                  </div>
                  <p className="map-caption">
                    분야를 선택하면 관련 자료를 모아 볼 수 있어요. 분석을 마친
                    자료는 AI가 분야와 태그를 제안합니다.
                  </p>
                </div>
              ) : (
                <>
                  {view === "library" &&
                    !query &&
                    category === "전체" &&
                    stateFilter === "all" &&
                    page === 0 && (
                      <div className="simple-guide" aria-label="사용 순서">
                        <span>
                          <b>1</b>링크·텍스트 추가
                        </span>
                        <ArrowRight size={16} aria-hidden="true" />
                        <span>
                          <b>2</b>카드뉴스 제작
                        </span>
                        <ArrowRight size={16} aria-hidden="true" />
                        <span>
                          <b>3</b>이미지·캡션 받기
                        </span>
                      </div>
                    )}
                  {isDemo && (
                    <div className="demo-notice">
                      지금은 예시 자료입니다. 로그인하면 내 자료를 추가할 수
                      있어요.{" "}
                      <button className="text-button" onClick={requireAuth}>
                        로그인 <ArrowRight size={14} />
                      </button>
                    </div>
                  )}
                  <nav className="state-tabs" aria-label="자료 상태">
                    {[
                      ["all", "전체"],
                      ["ready", isDemo ? "예시 읽기" : "카드뉴스 완성"],
                      ["pending", "제작 전·진행 중"],
                      ["attention", "도움 필요"],
                    ].map(([id, label]) => (
                      <button
                        key={id}
                        aria-pressed={stateFilter === id}
                        onClick={() => setStateFilter(id)}
                      >
                        {label}
                      </button>
                    ))}
                  </nav>
                  <div className="filter-toolbar" ref={collection}>
                    <div className="search-box">
                      <Search size={19} />
                      <input
                        ref={searchInput}
                        aria-label="자료 검색"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="제목이나 내용으로 검색"
                      />
                      {!query && <kbd className="search-shortcut">Ctrl K</kbd>}
                      {query && (
                        <button
                          className="icon-button"
                          aria-label="검색 지우기"
                          onClick={() => setQuery("")}
                        >
                          <X size={15} />
                        </button>
                      )}
                    </div>
                    <details className="filter-disclosure">
                      <summary>
                        <Settings2 size={16} />
                        필터·정렬
                        {category !== "전체" || source !== "all"
                          ? " · 적용 중"
                          : ""}
                      </summary>
                      <div className="filter-controls">
                        <label className="select-wrap">
                          <span className="sr-only">분야 필터</span>
                          <select
                            aria-label="분야 필터"
                            value={category}
                            onChange={(e) => setCategory(e.target.value)}
                          >
                            {["전체", ...categories].map((c) => (
                              <option key={c} value={c}>
                                {c === "전체" ? "모든 분야" : c}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="select-wrap">
                          <span className="sr-only">출처 필터</span>
                          <select
                            value={source}
                            onChange={(e) => setSource(e.target.value)}
                          >
                            <option value="all">모든 출처</option>
                            {Object.entries(sourceNames).map(([v, n]) => (
                              <option key={v} value={v}>
                                {n}
                              </option>
                            ))}
                          </select>
                          <ChevronDown size={14} />
                        </label>
                        <label className="select-wrap">
                          <span className="sr-only">정렬</span>
                          <select
                            value={sort}
                            onChange={(e) => setSort(e.target.value)}
                          >
                            <option value="new">최근 저장순</option>
                            <option value="old">오래된순</option>
                            <option value="title">제목순</option>
                          </select>
                          <ChevronDown size={14} />
                        </label>
                        <div className="view-toggle">
                          <button
                            aria-label="카드 보기"
                            aria-pressed={layout === "grid"}
                            onClick={() => setLayout("grid")}
                          >
                            <Grid2X2 size={17} />
                          </button>
                          <button
                            aria-label="목록 보기"
                            aria-pressed={layout === "list"}
                            onClick={() => setLayout("list")}
                          >
                            <List size={18} />
                          </button>
                        </div>
                      </div>
                    </details>
                  </div>
                  <div className="list-heading">
                    <div>
                      <strong>
                        {category === "전체" ? "전체 자료" : category}
                      </strong>
                      <span>{isDemo ? shown.length : total}</span>
                      {isDemo && (
                        <span className="demo-label">체험용 예시</span>
                      )}
                    </div>
                    <span className="list-hint">
                      {view === "trash"
                        ? "필요한 자료를 복원하세요"
                        : "한 편씩 읽고, 생각을 연결하세요"}
                    </span>
                  </div>
                  {loading ? (
                    <div className="loading-state">
                      <LoaderCircle className="spin" />
                      <p>내 자료를 불러오고 있어요.</p>
                    </div>
                  ) : shown.length === 0 ? (
                    <div className="empty-state">
                      <FolderOpen size={40} />
                      <h2>
                        {query
                          ? "일치하는 자료가 없어요"
                          : view === "trash"
                            ? "휴지통이 비어 있어요"
                            : stateFilter !== "all" ||
                                category !== "전체" ||
                                source !== "all"
                              ? "이 조건에 맞는 자료가 없어요"
                              : "첫 자료를 추가해 보세요"}
                      </h2>
                      <p>
                        {query
                          ? "다른 검색어나 분야로 찾아보세요."
                          : "관심 있는 링크나 텍스트를 저장하면 여기에 차곡차곡 쌓입니다."}
                      </p>
                      {!query &&
                        stateFilter === "all" &&
                        category === "전체" &&
                        source === "all" &&
                        view !== "trash" && (
                          <button
                            className="primary-button"
                            onClick={() =>
                              session ? setDialog("add") : requireAuth()
                            }
                          >
                            <Plus size={17} />
                            자료 추가
                          </button>
                        )}
                    </div>
                  ) : (
                    <div
                      className={`resource-grid ${layout === "list" ? "list-layout" : ""}`}
                    >
                      {shown.map((r, i) => (
                        <article
                          className="resource-card"
                          key={r.id}
                          style={{ animationDelay: `${Math.min(i, 8) * 35}ms` }}
                        >
                          <button
                            className="card-main"
                            onClick={() =>
                              view === "trash" ? restore(r) : openResource(r)
                            }
                          >
                            {r.status === "ready" ? (
                              <Cover
                                diagram={r.lesson?.diagram || r.visual}
                                category={r.category}
                                index={categories.indexOf(
                                  r.category as (typeof categories)[number],
                                )}
                              />
                            ) : (
                              <div
                                className={`resource-placeholder ${["failed", "needs_content"].includes((r.progress || learningProgress(r)).phase) ? "attention" : ""}`}
                              >
                                <FileText size={28} />
                                <span>
                                  {(r.progress || learningProgress(r)).label}
                                </span>
                              </div>
                            )}
                            <div className="card-body">
                              <div className="card-meta">
                                <span className="source-name">
                                  <SourceIcon type={r.source_type} />
                                  {sourceNames[r.source_type]}
                                </span>
                                <span
                                  className={`status status-${(r.progress || learningProgress(r)).phase}`}
                                >
                                  {r.status === "ready" ? (
                                    <Sparkles size={11} />
                                  ) : (r.progress || learningProgress(r))
                                      .phase === "running" ? (
                                    <LoaderCircle size={11} className="spin" />
                                  ) : null}
                                  {(r.progress || learningProgress(r)).label}
                                </span>
                              </div>
                              <h2>{r.title}</h2>
                              <p>
                                {readingExcerpt(
                                  r.lesson?.takeaways[0] ||
                                    r.lesson?.summary ||
                                    r.summary ||
                                    (r.progress || learningProgress(r)).message,
                                  130,
                                )}
                              </p>
                              <div className="card-tags">
                                {(r.tags.length ? r.tags : [r.category])
                                  .slice(0, 3)
                                  .map((t) => (
                                    <span key={t}>{t}</span>
                                  ))}
                              </div>
                              <div className="card-footer">
                                <span>
                                  {r.demo
                                    ? "예시 자료"
                                    : new Date(r.created_at).toLocaleDateString(
                                        "ko-KR",
                                      )}
                                </span>
                                <span>
                                  {view === "trash" ? (
                                    <>
                                      <RotateCcw size={14} />
                                      복원하기
                                    </>
                                  ) : r.learned ? (
                                    <>
                                      <Check size={14} />
                                      학습 완료
                                    </>
                                  ) : r.status === "ready" ? (
                                    <>
                                      <Clock size={13} />
                                      카드 읽기
                                    </>
                                  ) : (
                                    <>
                                      <ArrowUpRight size={15} />
                                      열어보기
                                    </>
                                  )}
                                </span>
                              </div>
                            </div>
                          </button>
                          {r.favorite && (
                            <span
                              className="card-bookmark"
                              role="img"
                              aria-label="즐겨찾기"
                            >
                              <Bookmark size={15} fill="currentColor" />
                            </span>
                          )}
                        </article>
                      ))}
                    </div>
                  )}
                  {!isDemo && total > 24 && (
                    <div className="pagination">
                      <button
                        className="secondary-button"
                        disabled={page === 0}
                        onClick={() => setPage(page - 1)}
                      >
                        이전
                      </button>
                      <span>
                        {page + 1} / {Math.ceil(total / 24)}
                      </span>
                      <button
                        className="secondary-button"
                        disabled={(page + 1) * 24 >= total}
                        onClick={() => setPage(page + 1)}
                      >
                        다음
                      </button>
                    </div>
                  )}
                  <div className="library-footnote">
                    <span className="mini-mark">A</span> 오늘의 발견이 내일의
                    아이디어가 됩니다.
                  </div>
                </>
              )}
            </>
          )}
        </main>
      </div>
      <dialog
        ref={modal}
        className="modal"
        onCancel={() => setDialog(null)}
        onClick={(e) => {
          if (e.target === modal.current) setDialog(null);
        }}
      >
        <div className="modal-inner">
          <button
            className="modal-close icon-button"
            aria-label="창 닫기"
            onClick={() => setDialog(null)}
          >
            <X size={21} />
          </button>
          {dialog === "auth" ? (
            <>
              <span className="modal-symbol">
                <BookOpen size={25} />
              </span>
              <h2>내 자료실 로그인</h2>
              <p>아이디와 비밀번호로 내 자료실을 열어보세요.</p>
              <form onSubmit={auth}>
                <label htmlFor="username">아이디</label>
                <input
                  id="username"
                  name="username"
                  type="text"
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  minLength={3}
                  maxLength={30}
                  required
                  placeholder="아이디 입력"
                />
                <label htmlFor="password">비밀번호</label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  minLength={8}
                  required
                  placeholder="8자 이상 입력"
                />
                {authMessage && (
                  <div className="notice" role="status">
                    {authMessage}
                  </div>
                )}
                <button
                  className="primary-button full-width"
                  disabled={!client || authBusy}
                >
                  {authBusy ? (
                    <LoaderCircle className="spin" size={18} />
                  ) : (
                    <LogIn size={18} />
                  )}{" "}
                  로그인
                </button>
              </form>
              <p className="small-copy">
                개인 전용 자료실입니다. 비밀번호 변경은 로그인 후 설정에서 할 수
                있습니다.
              </p>
              {!config?.database && (
                <p className="small-copy">
                  저장소 연결 작업이 완료되면 내 자료실을 이용할 수 있어요.
                </p>
              )}
            </>
          ) : dialog === "add" ? (
            <>
              <span className="modal-symbol">
                <Plus size={26} />
              </span>
              <h2>자료 추가</h2>
              <p>링크나 텍스트를 넣으면 카드와 상세 분석을 함께 만듭니다.</p>
              <div className="tabs" role="tablist" aria-label="입력 방식">
                <button
                  type="button"
                  role="tab"
                  aria-selected={addType === "link"}
                  onClick={() => setAddType("link")}
                >
                  <LinkIcon size={16} />
                  링크로 추가
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={addType === "text"}
                  onClick={() => setAddType("text")}
                >
                  <FileText size={16} />
                  텍스트로 추가
                </button>
              </div>
              <form onSubmit={add}>
                {addType === "link" && (
                  <>
                    <label htmlFor="new-url">원문 링크</label>
                    <input
                      id="new-url"
                      type="url"
                      required
                      value={addUrl}
                      onChange={(e) => setAddUrl(e.target.value)}
                      placeholder="https://"
                    />
                    <p className="field-hint">
                      YouTube · Instagram · Threads · 웹 아티클
                    </p>
                  </>
                )}
                <button
                  className="text-button add-options-toggle"
                  type="button"
                  aria-expanded={addAdvanced}
                  onClick={() => setAddAdvanced(!addAdvanced)}
                >
                  {addAdvanced
                    ? "추가 옵션 접기"
                    : "제목·본문 직접 입력 (선택)"}
                  <ChevronDown size={15} />
                </button>
                <div hidden={!addAdvanced}>
                  <label htmlFor="new-title">
                    제목 <span>선택</span>
                  </label>
                  <input
                    id="new-title"
                    maxLength={120}
                    value={addTitle}
                    onChange={(e) => setAddTitle(e.target.value)}
                    placeholder="비워두면 AI가 내용을 보고 제목을 정해요"
                  />
                </div>
                <div hidden={addType === "link" && !addAdvanced}>
                  <div className="input-label-row">
                    <label htmlFor="new-text">
                      {addType === "link"
                        ? "본문 또는 영상 자막"
                        : "정리할 내용"}{" "}
                      {addType === "link" && <span>선택</span>}
                    </label>
                    <label className="file-upload">
                      <Upload size={14} />
                      텍스트 파일
                      <input
                        type="file"
                        accept=".txt,.md,.srt,.vtt"
                        onChange={async (e) => {
                          const f = e.target.files?.[0];
                          if (f) {
                            if (f.size > 240000) {
                              setError(
                                "240KB 이하의 텍스트 파일을 사용해 주세요.",
                              );
                              return;
                            }
                            setAddText((await f.text()).slice(0, 60000));
                          }
                        }}
                      />
                    </label>
                  </div>
                  <textarea
                    id="new-text"
                    rows={7}
                    required={addType === "text"}
                    minLength={addType === "text" ? 80 : undefined}
                    maxLength={60000}
                    value={addText}
                    onChange={(e) => setAddText(e.target.value)}
                    placeholder="정리할 글이나 자막을 80자 이상 붙여 넣으세요."
                  />
                  <div className="field-hint right">
                    {addText.length.toLocaleString()} / 60,000자
                  </div>
                </div>
                <div hidden={!addAdvanced}>
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={autoAnalyze}
                      onChange={(e) => setAutoAnalyze(e.target.checked)}
                    />
                    저장 후 카드뉴스 이미지까지 만들기
                  </label>
                </div>
                {!config?.ai && (
                  <div className="notice">
                    자료는 먼저 저장할 수 있어요. 자동 정리는 연결 설정을 마친
                    뒤 사용할 수 있습니다.
                  </div>
                )}
                {error && (
                  <p className="form-error" role="alert">
                    {error}
                  </p>
                )}
                <button className="primary-button full-width" disabled={adding}>
                  {adding ? (
                    <LoaderCircle className="spin" size={18} />
                  ) : (
                    <Sparkles size={18} />
                  )}{" "}
                  {adding
                    ? "저장하고 있어요…"
                    : autoAnalyze
                      ? "추가하고 카드뉴스 만들기"
                      : "원문만 저장"}
                </button>
              </form>
            </>
          ) : null}
        </div>
      </dialog>
      {analyzing && (
        <div className="analysis-indicator" role="status">
          <LoaderCircle className="spin" size={18} />
          <div>
            <strong>정리 요청을 보내고 있어요</strong>
            <span>현재 진행 상태는 자료 화면에서 확인할 수 있어요.</span>
          </div>
        </div>
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={17} />
          {toast}
        </div>
      )}
    </div>
  );
}
