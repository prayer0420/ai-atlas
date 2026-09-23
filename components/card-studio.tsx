"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { CardCarousel } from "./card-carousel";
import { CardDesignPicker, CardEditor } from "./card-editing";
import { cardDesigns, normalizeCardBrief } from "@/lib/card-style";
import type { StoryCard } from "@/lib/card-workflow";
import {
  Download,
  LoaderCircle,
  RefreshCw,
  Sparkles,
  Check,
  AlertCircle,
} from "lucide-react";
import {
  cardBriefSchema,
  cardNodes,
  nodeLabels,
  type CardRun,
  type CardEvent,
  type CardBrief,
} from "@/lib/card-workflow";

type ResponseData = {
  profile: CardBrief;
  hashtags: string[];
  run: CardRun | null;
  publishedRun: CardRun | null;
  stale: boolean;
  events: CardEvent[];
  sources: string[];
  sourceIssue?: string | null;
  prompts: string[];
  verification: string;
  imageMode: string;
  policy?: {
    automaticStarted: number;
    automaticLimit: number;
    cardsPerResource: number;
  };
  graph: { from: string; to: string; when: string }[];
};
type Api = (path: string, options?: RequestInit) => Promise<any>;
function CardImage({
  resourceId,
  runId,
  index,
  title,
  fetchFile,
}: {
  resourceId: string;
  runId: string;
  index: number;
  title: string;
  fetchFile: (path: string) => Promise<Blob>;
}) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true,
      objectUrl = "";
    fetchFile(`/api/resources/${resourceId}/cards/asset?run=${runId}&index=${index}`)
      .then((blob) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [resourceId, runId, index, fetchFile]);
  return (
    <figure className="studio-card">
      {url ? (
        <>
          <img
            src={url}
            alt={`${index + 1}장: ${title}`}
            width={1080}
            height={1350}
          />
          <a
            href={url}
            download={`card-${String(index + 1).padStart(2, "0")}.png`}
          >
            <Download size={15} /> {index + 1}장 PNG
          </a>
        </>
      ) : (
        <div className="studio-image-loading">
          {error
            ? "이미지를 불러오지 못했습니다. 새로고침해 주세요."
            : "이미지 불러오는 중…"}
        </div>
      )}
    </figure>
  );
}
export function CardStudio({
  resourceId,
  api,
  fetchFile,
  onSource,
}: {
  resourceId: string;
  api: Api;
  fetchFile: (path: string) => Promise<Blob>;
  onSource: () => void;
}) {
  const [result, setResult] = useState<ResponseData | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [brief, setBrief] = useState<CardBrief>(() =>
    cardBriefSchema.parse({}),
  );
  const briefLoaded = useRef(false);
  const dirty = useRef(false);
  const alive = useRef(true);
  const requestVersion = useRef(0);
  const refresh = useCallback(async () => {
    const version = ++requestVersion.current;
    const data: ResponseData = await api(`/api/resources/${resourceId}/cards`);
    if (!alive.current || version !== requestVersion.current) return;
    setResult(data);
    setError("");
    if (data.run?.state === "completed" && data.run.data.parentRunId)
      setNotice((current) => current === "수정본 제작을 요청했어요. 검수가 끝나면 새 버전으로 표시됩니다." ? "" : current);
    if (!briefLoaded.current && !dirty.current) {
      setBrief(normalizeCardBrief(data.run?.brief || data.profile));
      briefLoaded.current = true;
    }
  }, [resourceId, api]);
  useEffect(() => {
    alive.current = true;
    let active = true;
    const load = () => {
      if (active)
        void refresh().catch((e) => {
          if (active) setError(e.message);
        });
    };
    load();
    const timer = setInterval(load, 10000);
    return () => {
      active = false;
      alive.current = false;
      requestVersion.current++;
      clearInterval(timer);
    };
  }, [refresh]);
  const run = result?.run;
  const active =
    run &&
    ["queued", "running", "recovering"].includes(run.state) &&
    !result?.stale;
  const complete = run?.state === "completed" && !result?.stale;
  const published = result?.publishedRun || (complete ? run : null);
  async function saveProfile() {
    setBusy(true); setError(""); setNotice("");
    try {
      await api("/api/cards/profile", { method: "PUT", body: JSON.stringify({ ...brief, required: "" }) });
      setNotice("내 스타일을 저장했어요. 다음 자료부터 이 설정으로 만듭니다.");
      await refresh();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  async function revise(change: { design?: CardBrief["design"]; index?: number; card?: Pick<StoryCard, "title" | "copy" | "condition" | "layout" | "items"> }) {
    if (!published) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await api(`/api/resources/${resourceId}/cards/revision`, { method: "POST", body: JSON.stringify({ runId: published.id, revision: published.revision, ...change }) });
      setNotice("수정본 제작을 요청했어요. 검수가 끝나면 새 버전으로 표시됩니다.");
      await refresh();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  async function copyText(value: string) {
    try { await navigator.clipboard.writeText(value); setNotice("복사했어요."); }
    catch { setError("복사 권한을 확인해 주세요. 아래 문구를 직접 선택해 복사할 수도 있습니다."); }
  }
  async function start() {
    setBusy(true);
    setError("");
    try {
      await api(`/api/resources/${resourceId}/cards`, {
        method: "POST",
        body: JSON.stringify(brief),
      });
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function download() {
    if (!published) return;
    setBusy(true);
    setError("");
    try {
      const blob = await fetchFile(
        `/api/resources/${resourceId}/cards/asset?run=${published.id}&download=all`,
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "card-news.zip";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card-studio" aria-label="카드뉴스 제작">
      <div className="studio-heading">
        <div>
          <span className="studio-eyebrow">
            최종 결과 · 장별 이미지 + 캡션 + 출처
          </span>
          <h2>
            {complete
              ? `${run.brief.count}장 카드뉴스가 완성됐어요`
              : active
                ? run.state === "recovering"
                  ? "문제를 고치고 이어서 만들고 있어요"
                  : run.state === "queued"
                    ? "제작 순서를 기다리고 있어요"
                    : "카드뉴스를 만들고 있어요"
                : run?.state === "waiting_input" || result?.sourceIssue
                  ? "이 부분을 도와주시면 이어갈 수 있어요"
                  : "이 자료로 카드뉴스를 만들어 보세요"}
          </h2>
          <p>
            {result?.stale
              ? "본문이 바뀌었습니다. 새 내용으로 다시 제작해 주세요."
              : result?.sourceIssue ||
                run?.message ||
                "원문을 정리하고, 하나의 이야기로 엮어 장별 이미지까지 만듭니다."}
          </p>
        </div>
        {complete ? (
          <Check size={30} />
        ) : active ? (
          <LoaderCircle className="spin" size={30} />
        ) : (
          <Sparkles size={30} />
        )}
      </div>
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      {notice && <p className="studio-notice" role="status">{notice}</p>}
      {!result && !error ? (
        <p role="status">제작 상태를 확인하고 있습니다…</p>
      ) : null}
      {active && (
        <p className="studio-help" role="status">
          창을 닫아도 요청은 보관됩니다. 연결된 처리 PC가 켜져 있을 때 진행하며,
          이 화면은 자동으로 갱신됩니다.
        </p>
      )}
      <p className="studio-help">
        직접 제작은 일일 한도 없이 · 자동 제작은 하루 3건, 각 8장
        {result?.policy
          ? ` · 오늘 자동 ${result.policy.automaticStarted}/3건 시작`
          : ""}{" "}
        (한국 시간 기준)
      </p>
      {!active && (
        <div className="studio-controls">
          {(run?.state === "waiting_input" &&
            run.error_code === "SOURCE_REQUIRED" &&
            !result?.stale) ||
          result?.sourceIssue ? (
            <button className="primary-button" onClick={onSource}>
              본문 추가하고 이어가기
            </button>
          ) : (
            <button
              className="primary-button"
              onClick={complete ? download : start}
              disabled={busy || !result}
            >
              {busy ? (
                <LoaderCircle size={17} className="spin" />
              ) : complete ? (
                <Download size={17} />
              ) : (
                <Sparkles size={17} />
              )}{" "}
              {busy
                ? "처리 중…"
                : complete
                  ? "이미지·캡션 모두 받기"
                  : run && !result?.stale
                    ? "이어서 제작"
                    : `${brief.count}장 카드뉴스 만들기`}
            </button>
          )}
          <details className="studio-settings">
            <summary>내 스타일·제작 설정</summary>
            <div className="studio-fields">
              <CardDesignPicker value={brief.design} onChange={(design) => { dirty.current = true; setBrief({ ...brief, design }); }} disabled={busy} />
              {(
                [
                  ["audience", "읽을 사람"],
                  ["purpose", "목적"],
                  ["brand", "브랜드·계정명"],
                  ["mood", "분위기"],
                  ["tone", "말투"],
                  ["avoid", "피할 표현"],
                  ["required", "꼭 포함할 내용"],
                ] as const
              ).map(([key, label]) => (
                <label key={key}>
                  {label}
                  <input
                    value={brief[key]}
                    maxLength={
                      key === "required"
                        ? 1500
                        : key === "tone" ? 400 : key === "avoid" ? 300
                        : key === "brand"
                          ? 40
                          : key === "audience"
                            ? 160
                            : 240
                    }
                    onChange={(e) => {
                      dirty.current = true;
                      setBrief({ ...brief, [key]: e.target.value });
                    }}
                  />
                </label>
              ))}
              <label>
                장수
                <input
                  type="number"
                  min={3}
                  max={12}
                  value={brief.count}
                  onChange={(e) => {
                    dirty.current = true;
                    setBrief({ ...brief, count: Number(e.target.value) });
                  }}
                />
              </label>
              <div className="studio-actions">
                <button className="secondary-button" disabled={busy} onClick={saveProfile}>내 스타일로 저장</button>
                <button className="text-button" disabled={busy || !result?.profile} onClick={() => { if (result?.profile) { dirty.current = true; setBrief(normalizeCardBrief(result.profile)); } }}>저장한 스타일 불러오기</button>
              </div>
              <small className="studio-help">‘꼭 포함할 내용’은 이 자료에만 적용됩니다. 자동 제작은 저장한 스타일로 8장씩 만듭니다.</small>
              {complete && (
                <button
                  className="secondary-button"
                  disabled={busy}
                  onClick={start}
                >
                  바꾼 설정으로 새로 제작
                </button>
              )}
            </div>
          </details>
        </div>
      )}
      {published && !complete && (
        <div className="studio-controls">
          <p>이전에 완성한 {published.manifest.length}장은 아래에서 계속 볼 수 있습니다. 새 버전의 진행 상태는 위에 표시됩니다.</p>
          <button className="secondary-button" onClick={download} disabled={busy}>
            <Download size={17} /> 이전 완성본 모두 받기
          </button>
        </div>
      )}
      {run && (
        <details
          className="studio-process"
          open={!complete && !!run.error_code}
        >
          <summary>
            {complete ? "어떻게 완성됐나요?" : "진행 단계와 해결 이력"}
          </summary>
          <ol className="studio-steps">
            {cardNodes.map((node, i) => (
              <li
                key={node}
                className={
                  complete || i < cardNodes.indexOf(run.node)
                    ? "done"
                    : node === run.node
                      ? "current"
                      : ""
                }
              >
                <span>
                  {complete || i < cardNodes.indexOf(run.node) ? "✓" : i + 1}
                </span>
                {nodeLabels[node]}
                {node === run.node && !complete ? (
                  <small>현재 단계</small>
                ) : null}
              </li>
            ))}
          </ol>
          <p>
            검수에서 문제가 발견되면 해당 단계로 돌아가 수정합니다. 확인된 해결
            방법만 다음 작업에 재사용합니다.
          </p>
          {run.error_code && (
            <p className="studio-issue">
              <AlertCircle size={16} />
              {run.error_code} · {run.message}
            </p>
          )}
          {!!run.data.issues?.length && (
            <ul>
              {run.data.issues.map((issue, i) => (
                <li key={i}>{issue}</li>
              ))}
            </ul>
          )}
          <ul className="studio-events">
            {result?.events.map((event) => (
              <li key={event.id}>
                <time>
                  {new Date(event.created_at).toLocaleString("ko-KR", {
                    month: "numeric",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </time>
                <span>
                  {event.code === "IMAGE_INVALID"
                    ? "이미지 배치·파일 검수 문제 · "
                    : event.code === "STORY_INVALID"
                      ? "원고·근거 검수 문제 · "
                      : ""}
                  {event.message}
                </span>
              </li>
            ))}
          </ul>
          <details>
            <summary>단계 연결 규칙</summary>
            <ul>
              {result?.graph.map((edge, i) => (
                <li key={i}>
                  {nodeLabels[edge.from as keyof typeof nodeLabels]} →{" "}
                  {nodeLabels[edge.to as keyof typeof nodeLabels]}: {edge.when}
                </li>
              ))}
            </ul>
          </details>
        </details>
      )}
      {published?.data.story && (
        <>
          <div className="studio-direction">
            <p>{published.data.story.direction}</p>
            <small>{result?.imageMode} · 1080×1350 · 각각의 PNG 파일</small>
          </div>
          <CardCarousel key={published.id} onIndexChange={setSelectedIndex}>
            {published.data.story.cards.map((card, i) => (
              <CardImage
                key={`${published.id}-${i}`}
                resourceId={resourceId}
                runId={published.id}
                index={i}
                title={card.title || card.copy}
                fetchFile={fetchFile}
              />
            ))}
          </CardCarousel>
          {published.data.story.cards[selectedIndex] && <CardEditor
            key={`${published.id}:${selectedIndex}`}
            card={published.data.story.cards[selectedIndex]}
            index={selectedIndex} disabled={busy || !!active}
            onSave={(card) => void revise({ index: selectedIndex, card })}
          />}
          <details className="studio-process">
            <summary>완성본 디자인 바꾸기 · {cardDesigns[normalizeCardBrief(published.brief).design].name}</summary>
            <p className="studio-help">원고를 유지하고 모든 장의 디자인을 바꿉니다. 디자인을 선택하면 수정본 제작을 시작합니다.</p>
            <CardDesignPicker value={normalizeCardBrief(published.brief).design} disabled={busy || !!active}
              onChange={(design) => { if (design !== normalizeCardBrief(published.brief).design) void revise({ design }); }} />
          </details>
          <section className="studio-caption">
            <h3>게시글 캡션</h3>
            <div className="studio-actions">
              <button className="secondary-button" onClick={() => void copyText([published.data.story!.caption, result?.hashtags.join(" "), result?.sources.join("\n")].filter(Boolean).join("\n\n"))}>게시글 전체 복사</button>
              <button className="text-button" onClick={() => void copyText(published.data.story!.caption)}>캡션만 복사</button>
            </div>
            <p>{published.data.story.caption}</p>
            {!!result?.hashtags.length && <><h3>해시태그</h3><p>{result.hashtags.join(" ")}</p><button className="text-button" onClick={() => void copyText(result.hashtags.join(" "))}>해시태그 복사</button></>}
            <h3>출처</h3>
            {result?.sources.map((source) =>
              /^https?:\/\//.test(source) ? (
                <a href={source} key={source} target="_blank" rel="noreferrer">
                  {source}
                </a>
              ) : (
                <p key={source}>{source}</p>
              ),
            )}
            <p className="studio-help">{result?.verification}</p>
            {published.data.story.caveats.map((x, i) => (
              <p key={i}>{x}</p>
            ))}
          </section>
          <details className="studio-process">
            <summary>장별 문구·화면 구성·이미지 생성 프롬프트</summary>
            <p>
              현재 이미지는 편집형 PNG입니다. 사진·콜라주 생성 모델에서 사용할
              수 있는 독립 프롬프트도 함께 제공합니다.
            </p>
            {published.data.story.cards.map((card, i) => (
              <section key={i}>
                <h3>
                  {i + 1}장 · {card.role}
                </h3>
                <p>
                  {card.title} — {card.copy}
                </p>
                {card.condition && <p>{card.condition}</p>}
                <p>{card.composition}</p>
                <textarea
                  readOnly
                  aria-label={`${i + 1}장 이미지 생성 프롬프트`}
                  value={result?.prompts[i] || ""}
                />
              </section>
            ))}
          </details>
        </>
      )}
      {error && (
        <button
          className="text-button"
          onClick={() =>
            refresh()
              .then(() => setError(""))
              .catch((e) => setError(e.message))
          }
        >
          <RefreshCw size={16} />
          상태 다시 확인
        </button>
      )}
    </section>
  );
}
