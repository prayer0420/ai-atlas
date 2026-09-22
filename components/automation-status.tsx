"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { LoaderCircle, Play } from "lucide-react";
import { nodeLabels, type CardRun } from "@/lib/card-workflow";
type CaptureChannel = "all" | "instagram" | "threads" | "youtube";
type Job = {
  id: string;
  kind: string;
  status: string;
  error: string | null;
  created_at: string;
  finished_at: string | null;
  payload?: { action?: string; channel?: CaptureChannel; goal?: string };
  result?: {
    state?: string;
    saved?: number;
    imported?: number;
    scanned?: number;
    excluded?: number;
    unchanged?: number;
    reason?: string;
    checked_at?: string;
    items?: {
      title: string;
      url: string;
      metrics?: { views?: number; likes?: number };
    }[];
    failures?: { platform?: string; stage?: string }[];
  } | null;
};
type State = {
  cards?: {
    total: number;
    completed: number;
    images: number;
    targetImages: number;
    active: number;
    queued: number;
    attention: number;
    lastCompletedAt: string | null;
    current: { id: string; title: string; node: CardRun["node"]; updatedAt: string }[];
  };
  provider: "ollama" | "hermes";
  online: boolean;
  pending: number;
  paused: boolean;
  worker: {
    busy: boolean;
    model: string;
    last_error: string | null;
    vault_synced_at: string | null;
    vault_conflicts: number;
  } | null;
  jobs: Job[];
};
const names: Record<string, string> = {
  analyze: "학습 노트",
  daily: "새 소식",
  wiki: "지식 노트",
  question: "자료에 질문",
};
const statuses: Record<string, string> = {
  queued: "대기",
  running: "처리 중",
  completed: "완료",
  failed: "확인 필요",
};
export function AutomationStatus({
  api,
  onUpdated,
  mode = "compact",
  onSettings,
}: {
  api: (p: string, o?: RequestInit) => Promise<any>;
  onUpdated: () => void;
  mode?: "compact" | "settings" | "collection";
  onSettings: () => void;
}) {
  const [data, setData] = useState<State | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [channel, setChannel] = useState<CaptureChannel>("all");
  const pending = useRef(0);
  const completed = useRef<string | null>(null);
  const load = useCallback(async () => {
    try {
      const next: State = await api("/api/automation");
      const signature = String(next.cards?.completed ?? "") + ":" + next.jobs
        .filter((j) => j.status === "completed")
        .map((j) => j.id)
        .join(",");
      if (
        (pending.current && next.pending < pending.current) ||
        (completed.current !== null && completed.current !== signature)
      )
        onUpdated();
      completed.current = signature;
      pending.current = next.pending;
      setData(next);
      setError("");
    } catch {
      setError("자동화 상태를 확인하지 못했습니다.");
    }
  }, [api, onUpdated]);
  useEffect(() => {
    void load();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 5000);
    const visible = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", visible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [load]);
  async function retry(id: string) {
    setBusy(true);
    try {
      await api("/api/automation", {
        method: "POST",
        body: JSON.stringify({ id }),
      });
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function toggle() {
    setBusy(true);
    try {
      await api("/api/automation", {
        method: "POST",
        body: JSON.stringify({ paused: !data?.paused }),
      });
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function selectProvider(provider: "ollama" | "hermes") {
    setBusy(true);
    setError("");
    try {
      await api("/api/automation", {
        method: "POST",
        body: JSON.stringify({ provider }),
      });
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function collect(channel: CaptureChannel) {
    setBusy(true);
    setError("");
    try {
      await api("/api/automation", {
        method: "POST",
        body: JSON.stringify({ collect: channel }),
      });
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const collectionJobs =
    data?.jobs.filter((job) => job.payload?.action === "manual-collect") || [];
  const activeCollection = collectionJobs.find((job) =>
    ["queued", "running"].includes(job.status),
  );
  const latestCollection = collectionJobs.find(
    (job) => job.status === "completed" || job.status === "failed",
  );
  const channelNames: Record<CaptureChannel, string> = {
    all: "전체",
    instagram: "Instagram",
    threads: "Threads",
    youtube: "YouTube",
  };
  const title = error
    ? "처리 상태를 확인하지 못했어요"
    : !data
      ? "처리 상태 확인 중"
      : data.paused
        ? "자동 정리가 멈춰 있어요"
        : !data.online
          ? "처리할 PC가 연결되지 않았어요"
          : data.worker?.busy
            ? "자료를 정리하고 있어요"
            : data.pending && data.worker?.last_error
              ? "일부 작업을 다시 시도할 예정이에요"
              : "자료를 추가하면 자동으로 정리해요";
  const hint = !data
    ? ""
    : data.paused
      ? "새 요청은 보관되며, 설정에서 이어서 처리할 수 있습니다."
      : !data.online
        ? "자료는 안전하게 저장됩니다. 연결된 PC의 작업기가 실행되면 이어서 처리합니다."
        : data.pending
          ? data.pending +
            "개 작업 대기·처리 중" +
            (data.worker?.last_error && !data.worker.busy
              ? " · 원문은 보관되어 있습니다. 설정에서 오류를 확인할 수 있어요."
              : "")
          : "완성된 자료는 ‘내 자료’에서 읽을 수 있습니다.";
  if (mode === "compact")
    return (
      <section
        className={
          "processing-strip " +
          (error || data?.paused || (data && !data.online)
            ? "needs-attention"
            : "")
        }
        aria-label="자동 정리 상태"
      >
        <span className="processing-dot" />
        <div>
          <strong>{data?.cards?.total
            ? `카드뉴스 ${data.cards.completed}/${data.cards.total}건 완성 · 이미지 ${data.cards.images}/${data.cards.targetImages}장`
            : title}</strong>
          {data?.cards?.total ? (
            <>
              <progress className="card-batch-progress" value={data.cards.completed} max={data.cards.total} aria-label="요청한 카드뉴스 완성 비율" />
              <p>{error ? "상태 갱신 실패 · 마지막으로 확인한 수량입니다." : data.paused ? (data.cards.active ? "현재 제작을 마치면 일시정지합니다." : "일시정지됨") : !data.online ? "처리 PC 연결 대기" : `제작 중 ${data.cards.active}건`}
                {` · 대기 ${data.cards.queued}건`}{data.cards.attention ? ` · 확인 필요 ${data.cards.attention}건` : ""}</p>
              {!error && data.online && data.cards.current.map((item) => (
                <p className="card-batch-current" key={item.id}>{item.title} · {nodeLabels[item.node]}</p>
              ))}
              {data.cards.lastCompletedAt && <small>최근 완성 {new Date(data.cards.lastCompletedAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}</small>}
            </>
          ) : <p>{hint}</p>}
        </div>
        <button className="text-button" onClick={onSettings}>
          설정
        </button>
      </section>
    );
  return (
    <section
      className="automation-panel"
      aria-label={mode === "settings" ? "자동 정리 설정" : "소셜 자료 가져오기"}
    >
      <div className="automation-panel-heading">
        <div>
          <h2>{mode === "settings" ? "자동 정리" : "새 자료 가져오기"}</h2>
          <p>
            {mode === "settings"
              ? title
              : "연결한 Instagram DM·Threads 리포스트·YouTube에서 새 자료를 가져옵니다."}
          </p>
        </div>
      </div>
      {mode === "collection" ? (
        <>
          <div className="collection-actions">
            <label htmlFor="capture-channel">가져올 곳</label>
            <select
              id="capture-channel"
              value={channel}
              onChange={(e) => setChannel(e.target.value as CaptureChannel)}
              disabled={busy || !!activeCollection}
            >
              <option value="all">연결한 곳 모두</option>
              <option value="instagram">Instagram 새 DM 링크</option>
              <option value="threads">Threads 리포스트</option>
              <option value="youtube">YouTube AI 자료</option>
            </select>
            <button
              className="primary-button"
              disabled={busy || !!activeCollection || !data || data.paused}
              onClick={() => collect(channel)}
            >
              {busy || activeCollection ? (
                <LoaderCircle className="spin" size={16} />
              ) : (
                <Play size={16} />
              )}
              {activeCollection
                ? activeCollection.status === "queued"
                  ? "가져오기 대기"
                  : "가져오는 중"
                : busy
                  ? "요청 중"
                  : "가져오기"}
            </button>
          </div>
          {data && (!data.online || data.paused) && (
            <p className="field-hint">{hint}</p>
          )}
          {activeCollection && (
            <p role="status">
              {channelNames[activeCollection.payload?.channel || "all"]} ·{" "}
              {activeCollection.status === "queued"
                ? "수집 요청을 저장했습니다. PC에서 순서대로 처리합니다."
                : "새 자료를 확인하고 있습니다."}
            </p>
          )}
          {latestCollection && !activeCollection && (
            <div className="collection-result" role="status">
              <strong>
                {latestCollection.status === "failed"
                  ? "자료를 가져오지 못했습니다"
                  : "내 자료에 " +
                    (latestCollection.result?.imported || 0) +
                    "건 추가했어요"}
              </strong>
              <p>
                {latestCollection.error ||
                  latestCollection.result?.reason ||
                  "이미 저장한 링크는 건너뜁니다. 새 자료는 자동 정리 후 읽을 수 있습니다."}
              </p>
              {!!latestCollection.result?.failures?.length && (
                <p>
                  읽지 못한 후보 {latestCollection.result.failures.length}건이
                  있습니다.
                </p>
              )}
              {!!latestCollection.result?.items?.length && (
                <details>
                  <summary>가져온 링크 확인</summary>
                  <ul>
                    {latestCollection.result.items.map((item) => (
                      <li key={item.url}>
                        <a href={item.url} target="_blank" rel="noreferrer">
                          {item.title}
                        </a>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              {latestCollection.finished_at && (
                <small>
                  {new Date(latestCollection.finished_at).toLocaleString(
                    "ko-KR",
                  )}
                </small>
              )}
            </div>
          )}
        </>
      ) : (
        <>
          <p>{hint} 브라우저를 닫아도 저장된 요청은 유지됩니다.</p>
          <button
            className="secondary-button"
            disabled={busy || !data}
            onClick={toggle}
          >
            {data?.paused ? "자동 정리 이어하기" : "자동 정리 잠시 멈추기"}
          </button>
          <details className="advanced-settings">
            <summary>AI와 저장 연결</summary>
            <p>
              다음에 시작하는 작업부터 적용됩니다. 연결 정보는 PC에서
              관리합니다.
            </p>
            <div
              className="collection-actions"
              role="group"
              aria-label="분석에 사용할 AI"
            >
              <button
                className={
                  data?.provider === "hermes"
                    ? "primary-button"
                    : "secondary-button"
                }
                aria-pressed={data?.provider === "hermes"}
                disabled={busy || !data}
                onClick={() => selectProvider("hermes")}
              >
                연결한 AI
              </button>
              <button
                className={
                  data?.provider === "ollama"
                    ? "primary-button"
                    : "secondary-button"
                }
                aria-pressed={data?.provider === "ollama"}
                disabled={busy || !data}
                onClick={() => selectProvider("ollama")}
              >
                PC의 로컬 AI
              </button>
            </div>
            <p className="field-hint">
              작업기가 마지막으로 보고한 모델:{" "}
              {data?.worker?.model || "아직 확인되지 않음"}
            </p>
            <p className="field-hint">
              {data?.worker?.vault_synced_at
                ? "Obsidian 마지막 저장: " +
                  new Date(data.worker.vault_synced_at).toLocaleString("ko-KR")
                : "Obsidian 저장 기록이 아직 없습니다."}
            </p>
            {!!data?.worker?.vault_conflicts && (
              <p>
                직접 수정한 파일 {data.worker.vault_conflicts}개는 덮어쓰지 않고
                보존했습니다.
              </p>
            )}
          </details>
          <details className="advanced-settings">
            <summary>최근 작업·오류 확인</summary>
            <p>
              최근 12개 작업입니다. 자료별 상태와 복구는 ‘내 자료 → 확인
              필요’에서 확인하세요.
            </p>
            <ul className="job-list">
              {data?.jobs.map((j) => (
                <li key={j.id}>
                  <div>
                    <strong>
                      {j.payload?.action === "manual-collect"
                        ? "자료 가져오기"
                        : j.payload?.goal === "cards"
                          ? "카드뉴스 제작"
                          : names[j.kind] || "자료 정리"}
                    </strong>{" "}
                    ·{" "}
                    {j.payload?.goal === "cards" &&
                    j.result?.state === "waiting_input"
                      ? "도움 필요"
                      : j.payload?.goal === "cards" &&
                          j.result?.state === "failed"
                        ? "확인 필요"
                        : statuses[j.status]}
                    {j.error && <p>{j.error}</p>}
                  </div>
                  {j.status === "failed" && (
                    <button
                      className="secondary-button"
                      disabled={busy}
                      onClick={() => retry(j.id)}
                    >
                      다시 시도
                    </button>
                  )}
                </li>
              ))}
            </ul>
            <button className="text-button" onClick={load}>
              상태 새로고침
            </button>
          </details>
        </>
      )}
      {error && (
        <p role="alert">
          {error}{" "}
          <button className="text-button" onClick={load}>
            다시 확인
          </button>
        </p>
      )}
    </section>
  );
}
