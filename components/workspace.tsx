"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import {
  createClient,
  type SupabaseClient,
  type Session,
} from "@supabase/supabase-js";
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
const statusNames = {
  saved: "분석 대기",
  analyzing: "분석 중",
  ready: "학습 노트",
  needs_content: "본문 필요",
  failed: "다시 확인",
};
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
  const [sort, setSort] = useState("new");
  const [layout, setLayout] = useState("grid");
  const [navOpen, setNavOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [toast, setToast] = useState("");
  const [error, setError] = useState("");
  const [dialog, setDialog] = useState<"add" | "auth" | null>(null);
  const [isSignup, setIsSignup] = useState(false);
  const [authMessage, setAuthMessage] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [useEmailLink, setUseEmailLink] = useState(true);
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
            auth: { storageKey: "ai-atlas-auth" },
          });
          setClient(sb);
          const { data } = await sb.auth.getSession();
          if (!live) return;
          setSession(data.session);
          const {
            data: { subscription },
          } = sb.auth.onAuthStateChange((event, s) => {
            setSession(s);
            if (event === "SIGNED_OUT" || event === "SIGNED_IN")
              setSelected(null);
          });
          sub = () => subscription.unsubscribe();
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
  const load = useCallback(async () => {
    if (!session || ["daily", "wiki", "obsidian"].includes(view)) return;
    const version = ++loadVersion.current;
    setLoading(true);
    setError("");
    try {
      const p = new URLSearchParams({
        q: query,
        category,
        source,
        view,
        sort,
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
  }, [api, session, query, category, source, view, sort, page]);
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
  }, [query, category, source, view, sort]);
  useEffect(() => {
    if (!session || !resources.some((r) => r.status === "analyzing")) return;
    const timer = setInterval(load, 10000);
    return () => clearInterval(timer);
  }, [resources, session, load]);
  function navigate(v: View, cat = "전체") {
    setWikiSource(null);
    setView(v);
    setCategory(cat);
    setSelected(null);
    setNavOpen(false);
    setQuery("");
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
    setResources((items) =>
      items.map((x) => (x.id === id ? { ...x, status: "analyzing" } : x)),
    );
    notify("분석을 시작했습니다. 완료까지 잠시 걸릴 수 있어요.");
    try {
      const data = await api(`/api/resources/${id}/analyze`, {
        method: "POST",
      });
      setSelected(data.resource);
      await load();
      notify(
        data.resource.status === "ready"
          ? "새 학습 노트가 완성됐어요."
          : "자료를 확인해 주세요.",
      );
    } catch (e) {
      await load();
      setError((e as Error).message);
      try {
        const data = await api("/api/resources/" + id);
        setSelected(data.resource);
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
      if (autoAnalyze && config?.ai && !data.duplicate)
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
      email: String(form.get("email")),
      password: String(form.get("password")),
    };
    try {
      if (useEmailLink) {
        const { error } = await client.auth.signInWithOtp({
          email: creds.email,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        setAuthMessage(
          "로그인 링크를 보냈습니다. 이메일의 링크를 누르면 자료실이 열립니다. 메일이 없다면 스팸함도 확인해 주세요.",
        );
        return;
      }
      const { data, error } = isSignup
        ? await client.auth.signUp({
            ...creds,
            options: { emailRedirectTo: window.location.origin },
          })
        : await client.auth.signInWithPassword(creds);
      if (error) throw error;
      if (data.session) {
        setDialog(null);
        notify("내 자료실에 연결했습니다.");
      } else setAuthMessage("가입 확인 메일을 확인한 뒤 로그인해 주세요.");
    } catch (e) {
      const msg = (e as Error).message;
      setAuthMessage(
        msg.includes("Invalid login")
          ? "이메일 또는 비밀번호를 확인해 주세요."
          : msg.includes("Email not confirmed")
            ? "이메일 인증을 먼저 완료해 주세요."
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
          view !== "trash",
      )
    : resources;
  if (isDemo && sort === "title")
    shown = [...shown].sort((a, b) => a.title.localeCompare(b.title, "ko"));
  const title =
    category !== "전체"
      ? category
      : {
          library: "지식 라이브러리",
          favorites: "즐겨찾기",
          learned: "학습 완료",
          inbox: "수집함",
          map: "분야별 지식 지도",
          trash: "휴지통",
          settings: "연결 설정",
          daily: "오늘의 AI",
          wiki: "지식 위키",
          obsidian: "Obsidian · Second Brain",
        }[view];
  return (
    <div className="app-shell">
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
        <button className="brand" onClick={() => navigate("library")}>
          <span className="brand-mark">
            A<span />
          </span>
          <span>
            AI Atlas<small>MY KNOWLEDGE SPACE</small>
          </span>
        </button>
        <button
          className="new-resource"
          onClick={() => (session ? setDialog("add") : requireAuth())}
        >
          <Plus size={19} /> 자료 추가<span>＋</span>
        </button>
        <div className="nav-label">WORKSPACE</div>
        <nav>
          {(
            [
              ["library", BookOpen, "지식 라이브러리"],
              ["daily", CalendarDays, "오늘의 AI"],
              ["wiki", Network, "지식 위키"],
              ["obsidian", FolderSync, "Obsidian 보관함"],
              ["inbox", FolderOpen, "수집함"],
              ["favorites", Bookmark, "즐겨찾기"],
              ["learned", Check, "학습 완료"],
              ["map", Network, "지식 지도"],
            ] as const
          ).map(([id, Icon, label]) => (
            <button
              key={id}
              className={view === id && category === "전체" ? "selected" : ""}
              onClick={() => navigate(id)}
            >
              <Icon size={19} />
              {label}
              {id === "library" && isDemo && (
                <span className="nav-count">4</span>
              )}
            </button>
          ))}
        </nav>
        <div className="nav-label category-label">
          분야별 모아보기 <Layers size={13} />
        </div>
        <nav className="category-nav">
          {categories.map((c, i) => (
            <button
              key={c}
              onClick={() => navigate("library", c)}
              className={category === c ? "selected" : ""}
            >
              <span className={`category-dot dot-${i}`} />
              {c}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <Sparkles size={19} />
            <strong>
              모아둔 정보가
              <br />
              나만의 지식이 되는 곳
            </strong>
            <p>
              한 번 저장하고,
              <br />
              여러 번 꺼내 배우세요.
            </p>
          </div>
          <nav>
            <button
              onClick={() => navigate("trash")}
              className={view === "trash" ? "selected" : ""}
            >
              <Trash2 size={17} />
              휴지통
            </button>
            <button
              onClick={() => navigate("settings")}
              className={view === "settings" ? "selected" : ""}
            >
              <Settings2 size={17} />
              연결 설정
            </button>
          </nav>
          <button
            className="profile"
            onClick={
              session
                ? async () => {
                    await client?.auth.signOut();
                    setSession(null);
                    notify("로그아웃했습니다.");
                  }
                : requireAuth
            }
          >
            <span className="avatar">
              {session?.user.email?.[0]?.toUpperCase() || "A"}
            </span>
            <span>
              <strong>{session ? "나의 자료실" : "체험 자료실"}</strong>
              <small>
                {session?.user.email || "로그인하고 나만의 자료 모으기"}
              </small>
            </span>
            {session ? <LogOut size={16} /> : <LogIn size={16} />}
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
            <span>나의 워크스페이스</span>
            <span className="slash">/</span>
            <strong>{selected ? "학습 노트" : title}</strong>
          </div>
          <div className="topbar-right">
            <span className="private-badge">
              <span />
              개인 지식 공간
            </span>
            {!session && (
              <button className="text-button" onClick={requireAuth}>
                로그인 <ArrowUpRight size={15} />
              </button>
            )}
          </div>
        </header>
        <main id="main" tabIndex={-1}>
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
              onBack={() => setSelected(null)}
              onUpdate={update}
              onAnalyze={() => analyze()}
              busy={busy}
              onTrash={trash}
              onWiki={() => {
                const id = selected.id;
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
              <div className="page-heading">
                <div>
                  <div className="eyebrow">
                    {isDemo
                      ? "EXPLORE YOUR KNOWLEDGE"
                      : "YOUR KNOWLEDGE, CONNECTED"}
                  </div>
                  <h1>
                    {title}
                    <span className="heading-dot">.</span>
                  </h1>
                  <p>
                    {view === "inbox"
                      ? "아직 정리하지 않은 자료를 학습 노트로 바꿔보세요."
                      : view === "trash"
                        ? "삭제한 자료를 다시 자료함으로 가져올 수 있어요."
                        : view === "map"
                          ? "관심 분야를 따라 흩어진 지식을 연결해 보세요."
                          : view === "settings"
                            ? "저장 공간과 AI 분석 연결 상태를 확인하세요."
                            : "좋은 정보를 모으고, 깊이 이해하고, 내 것으로 만드세요."}
                  </p>
                </div>
                {view !== "settings" && (
                  <button
                    className="primary-button"
                    onClick={() => (session ? setDialog("add") : requireAuth())}
                  >
                    <Plus size={18} />새 자료 추가
                  </button>
                )}
              </div>
              {view === "settings" ? (
                <div className="settings-grid">
                  <section className="setting-card">
                    <div className="setting-icon">
                      <Layers />
                    </div>
                    <h2>나의 자료 저장소</h2>
                    <p>Supabase에 원문과 학습 노트를 저장합니다.</p>
                    <span
                      className={`connection ${config?.database ? "connected" : ""}`}
                    >
                      {config?.database
                        ? "데이터베이스 연결됨"
                        : "데이터베이스 설정 대기"}
                    </span>
                    <p className="small-copy">
                      로그인한 사용자의 자료만 조회하도록 접근 정책을
                      적용합니다.
                    </p>
                  </section>
                  <section className="setting-card">
                    <div className="setting-icon">
                      <Sparkles />
                    </div>
                    <h2>AI 학습 노트</h2>
                    <p>본문을 분석해 설명, 개념도, 실습 자료를 만듭니다.</p>
                    <span
                      className={`connection ${config?.ai ? "connected" : ""}`}
                    >
                      {config?.ai ? "분석 API 설정됨" : "AI API 키 설정 필요"}
                    </span>
                    <p className="small-copy">
                      {config?.ai
                        ? `분석 모델: ${config.model}`
                        : "서버의 OPENAI_API_KEY 환경변수를 등록하면 분석할 수 있습니다."}
                      <br />
                      계정당 하루 최대 {config?.dailyLimit || 20}회 분석합니다.
                    </p>
                  </section>
                  <section className="setting-card full">
                    <h2>자료를 가져오는 방법</h2>
                    <div className="support-grid">
                      <div>
                        <LinkIcon />
                        <strong>웹 아티클</strong>
                        <p>
                          공개된 글의 본문을 가져옵니다. 로그인이 필요한
                          페이지는 본문을 붙여넣어 주세요.
                        </p>
                      </div>
                      <div>
                        <Youtube />
                        <strong>영상·소셜 게시물</strong>
                        <p>
                          링크와 함께 자막이나 게시물 본문을 넣어주세요. 접근
                          제한으로 자동 수집되지 않을 수 있습니다.
                        </p>
                      </div>
                      <div>
                        <FileText />
                        <strong>텍스트·메모</strong>
                        <p>
                          내용을 붙여넣거나 TXT, MD, SRT 파일을 추가하세요. 최대
                          60,000자까지 저장합니다.
                        </p>
                      </div>
                    </div>
                  </section>
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
                  {isDemo && view === "library" && category === "전체" && (
                    <div className="welcome-strip">
                      <div className="welcome-symbol">
                        <Sparkles size={25} />
                      </div>
                      <div>
                        <strong>흩어진 발견을, 쌓이는 지식으로.</strong>
                        <p>
                          학습 노트 예시를 열어보세요. 내 자료는 로그인 후
                          저장할 수 있어요.
                        </p>
                      </div>
                      <button
                        className="text-button"
                        onClick={() => openResource(demoResources[0])}
                      >
                        노트 둘러보기 <ArrowRight size={17} />
                      </button>
                    </div>
                  )}
                  <div className="filter-toolbar">
                    <div className="search-box">
                      <Search size={19} />
                      <input
                        aria-label="자료 검색"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="제목, 본문, 태그로 검색"
                      />
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
                    <div className="filter-controls">
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
                        : "작은 발견 하나도 놓치지 않도록"}
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
                            : "첫 번째 지식을 담아보세요"}
                      </h2>
                      <p>
                        {query
                          ? "다른 검색어나 분야로 찾아보세요."
                          : "관심 있는 링크나 텍스트를 저장하면 여기에 차곡차곡 쌓입니다."}
                      </p>
                      {!query && view !== "trash" && (
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
                        <article className="resource-card" key={r.id}>
                          <button
                            className="card-main"
                            onClick={() =>
                              view === "trash" ? restore(r) : openResource(r)
                            }
                          >
                            <Cover
                              diagram={r.lesson?.diagram || r.visual}
                              category={r.category}
                              index={categories.indexOf(
                                r.category as (typeof categories)[number],
                              )}
                            />
                            <div className="card-body">
                              <div className="card-meta">
                                <span className="source-name">
                                  <SourceIcon type={r.source_type} />
                                  {sourceNames[r.source_type]}
                                </span>
                                <span className={`status status-${r.status}`}>
                                  {r.status === "ready" ? (
                                    <Sparkles size={11} />
                                  ) : r.status === "analyzing" ? (
                                    <LoaderCircle size={11} className="spin" />
                                  ) : null}
                                  {statusNames[r.status]}
                                </span>
                              </div>
                              <h2>{r.title}</h2>
                              <p>
                                {readingExcerpt(
                                  r.lesson?.takeaways[0] ||
                                    r.lesson?.summary ||
                                    r.summary ||
                                    "원문 보관 중 · 분석 후 핵심 요약과 자료별 개념도가 표시됩니다.",
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
                                  ) : r.lesson ? (
                                    <>
                                      <Clock size={13} />
                                      {r.lesson.readMinutes}분 읽기
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
              <h2>
                {useEmailLink
                  ? "이메일로 자료실 열기"
                  : isSignup
                    ? "나만의 자료실 만들기"
                    : "다시 오셨군요"}
              </h2>
              <p>모아둔 자료와 학습 노트를 어디서든 이어서 보세요.</p>
              <form onSubmit={auth}>
                <label htmlFor="email">이메일</label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  placeholder="name@example.com"
                />
                {!useEmailLink && (
                  <>
                    <label htmlFor="password">비밀번호</label>
                    <input
                      id="password"
                      name="password"
                      type="password"
                      autoComplete={
                        isSignup ? "new-password" : "current-password"
                      }
                      minLength={8}
                      required
                      placeholder="8자 이상 입력"
                    />
                  </>
                )}
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
                  {useEmailLink
                    ? "이메일로 로그인 링크 받기"
                    : isSignup
                      ? "가입하기"
                      : "로그인"}
                </button>
              </form>
              <button
                className="auth-switch text-button"
                onClick={() => {
                  setUseEmailLink(!useEmailLink);
                  setAuthMessage("");
                }}
              >
                {useEmailLink
                  ? "비밀번호로 로그인하기"
                  : "이메일 링크로 로그인하기"}
              </button>
              {!useEmailLink && (
                <button
                  className="auth-switch text-button"
                  onClick={() => {
                    setIsSignup(!isSignup);
                    setAuthMessage("");
                  }}
                >
                  {isSignup
                    ? "이미 계정이 있어요 · 로그인"
                    : "처음이신가요? · 회원가입"}
                </button>
              )}
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
              <h2>새로운 발견을 담아보세요</h2>
              <p>링크나 텍스트를 넣으면 나만의 학습 자료로 정리해요.</p>
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
                <div className="input-label-row">
                  <label htmlFor="new-text">
                    {addType === "link" ? "본문 또는 영상 자막" : "정리할 내용"}{" "}
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
                  maxLength={60000}
                  value={addText}
                  onChange={(e) => setAddText(e.target.value)}
                  placeholder="게시물 내용, 영상 자막, 메모를 붙여넣으세요. 소셜 링크는 본문을 함께 넣으면 더 정확하게 정리할 수 있어요."
                />
                <div className="field-hint right">
                  {addText.length.toLocaleString()} / 60,000자
                </div>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={autoAnalyze}
                    onChange={(e) => setAutoAnalyze(e.target.checked)}
                  />
                  저장 후 AI 학습 노트 만들기
                </label>
                {!config?.ai && (
                  <div className="notice">
                    자료는 먼저 저장할 수 있어요. AI 분석은 API 연결 후 사용할
                    수 있습니다.
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
                  {adding ? "자료를 담고 있어요…" : "내 자료함에 저장"}
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
            <strong>학습 노트를 만들고 있어요</strong>
            <span>개념 정리 → 시각화 → 실습 구성</span>
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
