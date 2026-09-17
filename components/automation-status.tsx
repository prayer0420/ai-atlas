"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, Laptop, LoaderCircle, RefreshCw } from "lucide-react";
type Job = {
  id: string;
  kind: string;
  status: string;
  error: string | null;
  created_at: string;
};
type State = {
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
  daily: "오늘의 카드뉴스",
  wiki: "지식 위키",
  question: "위키 질문",
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
}: {
  api: (p: string, o?: RequestInit) => Promise<any>;
  onUpdated: () => void;
}) {
  const [data, setData] = useState<State | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const pending = useRef(0);
  const completed = useRef<string | null>(null);
  const load = useCallback(async () => {
    try {
      const next: State = await api("/api/automation");
      const signature = next.jobs
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
    }, 15000);
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
  return (
    <details className="automation-status">
      <summary>
        <Laptop size={18} />
        <strong aria-live="polite">
          {!data
            ? "자동화 상태 확인 중"
            : data.paused
              ? "자동 정리 일시 중지"
              : data.online
                ? data.worker?.busy
                  ? "무료 AI가 정리하고 있어요"
                  : "무료 AI 연결됨"
                : "PC 연결 대기"}
        </strong>
        <span>
          {data?.pending
            ? `${data.pending}개 작업 대기·처리 중`
            : "수집부터 보관까지 자동으로"}
        </span>
      </summary>
      <div className="automation-details">
        <p>
          매일 오전 9시대에 공개 자료를 수집합니다. AI 분석과 Obsidian 저장은
          연결된 PC가 켜져 있고 로그인되어 있을 때 이어서 처리합니다. 브라우저를
          닫아도 요청은 보관됩니다.
        </p>
        <div className="automation-facts">
          <span>API 사용료 0원 · {data?.worker?.model || "로컬 AI"}</span>
          <span>한 번에 한 작업 · 오류 시 최대 3회 시도</span>
          <span>
            {data?.worker?.vault_synced_at
              ? `Obsidian 저장: ${new Date(data.worker.vault_synced_at).toLocaleString("ko-KR")}`
              : "Obsidian 자동 저장 대기"}
          </span>
        </div>
        {!!data?.worker?.vault_conflicts && (
          <p>
            직접 수정한 파일 {data.worker.vault_conflicts}개를 보존했습니다.
            최신 내용은 홈페이지에서 확인할 수 있습니다.
          </p>
        )}
        {error && <p role="alert">{error}</p>}
        {!data?.online && (
          <p>
            PC가 꺼져 있거나 AI가 준비 중입니다. PC에서 AI Atlas 자동화를
            실행하면 대기 작업을 이어서 처리합니다.
          </p>
        )}
        <ul>
          {data?.jobs.map((j) => (
            <li key={j.id}>
              <span>
                {j.status === "completed" ? (
                  <CheckCircle2 size={16} />
                ) : j.status === "running" ? (
                  <LoaderCircle size={16} />
                ) : null}
                <strong>{names[j.kind]}</strong> · {statuses[j.status]}
                {j.error && <small>{j.error}</small>}
              </span>
              {j.status === "failed" && (
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() => retry(j.id)}
                >
                  <RefreshCw size={14} />
                  다시 시도
                </button>
              )}
            </li>
          ))}
        </ul>
        <button className="text-button" onClick={load}>
          상태 새로고침
        </button>
        <button className="button secondary" disabled={busy} onClick={toggle}>
          {data?.paused ? "자동 정리 이어하기" : "자동 정리 잠시 멈춤"}
        </button>
        {data?.paused && (
          <p>
            자동 정리가 일시 중지됐습니다. 진행 중인 작업은 마친 뒤 멈추며, 새
            요청은 보관됩니다.
          </p>
        )}
      </div>
    </details>
  );
}
