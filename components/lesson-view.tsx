"use client";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  Bookmark,
  Check,
  Clock,
  Download,
  FileText,
  Lightbulb,
  Copy,
  BookOpen,
  RefreshCw,
  Save,
  Trash2,
} from "lucide-react";
import type { Resource } from "@/lib/types";
import { sourceNames, categories } from "@/lib/types";
import { Diagram } from "./diagram";
import { readingExcerpt } from "@/lib/reading";
import { readableText, readableValue } from "@/lib/content-text";
import { LessonCards } from "./lesson-cards";
import { learningProgress } from "@/lib/learning-progress";
import { CardStudio } from "./card-studio";
export function LessonView({
  resource: r,
  onBack,
  onUpdate,
  onAnalyze,
  onSaveSource,
  busy,
  onTrash,
  onWiki,
  api,
  fetchFile,
}: {
  resource: Resource;
  onBack: () => void;
  onUpdate: (data: Partial<Resource>) => Promise<boolean>;
  onAnalyze: () => void;
  onSaveSource: (text: string) => Promise<boolean>;
  busy: boolean;
  onTrash: () => void;
  onWiki: () => void;
  api: (path: string, options?: RequestInit) => Promise<any>;
  fetchFile: (path: string) => Promise<Blob>;
}) {
  const [tab, setTab] = useState("brief");
  const progress = r.progress || learningProgress(r);
  const inProgress = ["queued", "running"].includes(progress.phase);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [notes, setNotes] = useState(r.notes);
  const [raw, setRaw] = useState(readableText(r.raw_text));
  const [editTitle, setEditTitle] = useState(r.title);
  const [editCategory, setEditCategory] = useState(r.category);
  const [editTags, setEditTags] = useState(r.tags.join(", "));
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const l = r.lesson ? readableValue(r.lesson) : null;
  const [detailSection, setDetailSection] = useState<number | null>(null);
  useEffect(() => {
    if (tab === "learn" && detailSection !== null) {
      document
        .getElementById(`section-${detailSection}`)
        ?.scrollIntoView({ block: "start" });
      setDetailSection(null);
    }
  }, [tab, detailSection]);
  useEffect(() => setRaw(readableText(r.raw_text)), [r.raw_text]);
  useEffect(() => setNotes(r.notes), [r.notes]);
  useEffect(() => setEditTitle(r.title), [r.title]);
  useEffect(() => setEditCategory(r.category), [r.category]);
  useEffect(() => setEditTags(r.tags.join(", ")), [r.tags]);
  function exportNote() {
    if (!l) return;
    const md = `# ${l.title}\n\n${l.summary}\n\n${r.source_url ? `출처: ${r.source_url}` : "출처: 직접 입력"}\n\n## 핵심 요약\n${l.takeaways.map((t) => "- " + t).join("\n")}\n\n${l.sections.map((s) => `## ${s.heading}\n\n${s.body}\n\n예시: ${s.example}\n\n근거 구분: ${s.sourceBasis}`).join("\n\n")}\n\n## ${l.diagram.title}\n${l.diagram.nodes.map((n, i) => `${i + 1}. ${n.label}: ${n.description}`).join("\n")}\n\n## ${l.comparison.title}\n|항목|${l.comparison.columns.join("|")}|\n|---|${l.comparison.columns.map(() => "---").join("|")}|\n${l.comparison.rows.map((row) => `|${row.label}|${row.values.join("|")}|`).join("\n")}\n\n## 용어 사전\n${l.glossary.map((g) => `- **${g.term}**: ${g.definition}`).join("\n")}\n\n## 실습: ${l.practice.title}\n${l.practice.steps.map((s, i) => `${i + 1}. ${s}`).join("\n")}\n\n${l.practice.prompt}\n\n## 복습 문제\n${l.quiz.map((q) => `${q.question}\n${q.choices.map((c, i) => `${i + 1}. ${c}`).join("\n")}\n정답: ${q.answer + 1}. ${q.explanation}`).join("\n\n")}\n\n## 확인할 점\n${l.caveats.map((c) => "- " + c).join("\n")}\n\n## 나의 메모\n${notes}`;
    const url = URL.createObjectURL(
      new Blob([md], { type: "text/markdown;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = l.title.replace(/[\\/:*?"<>|]/g, "") + ".md";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <div className="detail">
      <div className="detail-toolbar">
        <button className="text-button" onClick={onBack}>
          <ArrowLeft size={18} /> 자료함으로
        </button>
        <div className="toolbar-actions">
          <button
            className={`icon-button ${r.favorite ? "active" : ""}`}
            aria-label={r.favorite ? "즐겨찾기 해제" : "즐겨찾기"}
            onClick={() => onUpdate({ favorite: !r.favorite })}
          >
            <Bookmark size={18} fill={r.favorite ? "currentColor" : "none"} />
          </button>
          <details className="resource-actions">
            <summary>더 보기</summary>
            <div>
              {l && (
                <button
                  className="secondary-button"
                  onClick={exportNote}
                  aria-label="노트 내보내기"
                >
                  <Download size={16} />
                  <span>노트 내보내기</span>
                </button>
              )}
              <button
                className="icon-button danger"
                aria-label="휴지통으로 이동"
                onClick={onTrash}
              >
                <Trash2 size={17} /> 휴지통으로 이동
              </button>
            </div>
          </details>
        </div>
      </div>
      {r.demo && (
        <div className="notice">
          체험용으로 미리 작성한 자료입니다. 실제 AI 분석 결과가 아닙니다.
        </div>
      )}
      <div className="detail-header">
        <div className="meta-row">
          <span className="category-pill">{r.category}</span>
          <span>{sourceNames[r.source_type]}</span>
          {l && (
            <>
              <span>·</span>
              <span>{l.level}</span>
              <span className="inline">
                <Clock size={14} /> {l.readMinutes}분
              </span>
            </>
          )}
        </div>
        <h1>{readableText(r.title)}</h1>
        <p className="detail-summary">
          {l
            ? readingExcerpt(l.summary, 160)
            : "저장한 원문에서 시작해 핵심과 근거를 함께 쌓아갑니다."}
        </p>
        <div className="detail-bottom">
          <div className="tags">
            {r.tags.map((t) => (
              <span key={t}>#{t}</span>
            ))}
          </div>
          {l && (
            <button
              className={
                r.learned ? "secondary-button success" : "primary-button"
              }
              onClick={() => onUpdate({ learned: !r.learned })}
            >
              <Check size={16} />
              {r.learned ? "읽은 자료" : "읽음 표시"}
            </button>
          )}
        </div>
      </div>
      {l && tab !== "brief" && progress.phase !== "ready" && (
        <div className="notice" role="status">
          {progress.label} · {progress.message} 아래에는 이전에 완성된 분석을
          표시합니다.
        </div>
      )}
      <nav className="tabs" aria-label="자료 읽기 방식">
        {[
          ["brief", "카드뉴스"],
          ["learn", "상세분석"],
          ["source", "원문·출처"],
          ["memo", "나의 메모"],
        ].map(([id, label]) => (
          <button
            key={id}
            aria-current={tab === id ? "page" : undefined}
            aria-controls="lesson-reading-panel"
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </nav>
      <div id="lesson-reading-panel" aria-label="선택한 읽기 내용">
        {tab === "brief" && (
          <div className="brief-layout">
            {!r.demo ? (
              <CardStudio
                resourceId={r.id}
                api={api}
                fetchFile={fetchFile}
                onSource={() => setTab("source")}
              />
            ) : l ? (
              <LessonCards
                key={r.id + r.updated_at}
                lesson={l}
                sourceUrl={r.source_url}
                onDetail={(section) => {
                  setTab("learn");
                  setDetailSection(section);
                }}
              />
            ) : (
              <section
                className={"brief-pending progress-" + progress.phase}
                role="status"
              >
                <BookOpen size={32} />
                <span className="progress-label">{progress.label}</span>
                <h2>
                  {progress.phase === "queued"
                    ? "요청을 저장했어요. 차례를 기다리고 있습니다."
                    : progress.phase === "running"
                      ? "카드와 상세 분석을 만들고 있어요"
                      : progress.phase === "needs_content"
                        ? "본문을 추가하면 이어서 정리할 수 있어요"
                        : progress.phase === "failed"
                          ? "정리가 중단됐어요. 다시 시도할 수 있습니다."
                          : "원문을 저장했어요. 이제 정리해 볼까요?"}
                </h2>
                <p>{progress.message}</p>
                <ol className="learning-steps" aria-label="자료 처리 단계">
                  <li className="done">저장 완료</li>
                  <li className={inProgress ? "current" : ""}>원문 분석</li>
                  <li>카드·상세 분석</li>
                </ol>
                {r.error_message && progress.phase !== "queued" && (
                  <p className="brief-pending-reason">{r.error_message}</p>
                )}
                <div className="brief-next-actions">
                  {progress.action && (
                    <button
                      className="primary-button"
                      disabled={busy}
                      onClick={
                        progress.action === "source"
                          ? () => setTab("source")
                          : onAnalyze
                      }
                    >
                      {busy
                        ? "요청 중…"
                        : progress.action === "source"
                          ? "본문 추가"
                          : progress.phase === "saved"
                            ? "정리 시작"
                            : "다시 시도"}
                    </button>
                  )}
                  <button
                    className="text-button"
                    onClick={() => setTab("source")}
                  >
                    저장한 원문 보기
                  </button>
                </div>
              </section>
            )}
          </div>
        )}
        {tab === "learn" && (
          <div className="lesson-grid">
            <article className="lesson-content">
              {l ? (
                <>
                  <section className="lesson-section">
                    <h2>전체 요약과 맥락</h2>
                    <p>{l.summary}</p>
                    <button className="text-button" onClick={onWiki}>
                      연결된 지식 노트 읽기 <ArrowUpRight size={16} />
                    </button>
                  </section>
                  <section className="takeaways">
                    <div className="section-kicker">
                      <Lightbulb size={19} /> 먼저, 이것만 기억하세요
                    </div>
                    {l.takeaways.map((t, i) => (
                      <div key={t} className="takeaway">
                        <span>{String(i + 1).padStart(2, "0")}</span>
                        <p>{t}</p>
                      </div>
                    ))}
                  </section>
                  <Diagram diagram={l.diagram} />
                  {l.sections.map((s, i) => (
                    <section
                      className="lesson-section"
                      id={`section-${i}`}
                      key={i}
                    >
                      <span className="section-number">
                        CHAPTER {String(i + 1).padStart(2, "0")}
                      </span>
                      <h2>{s.heading}</h2>
                      <span className="basis-label">{s.sourceBasis}</span>
                      <p>{s.body}</p>
                      <div className="example">
                        <Lightbulb size={19} />
                        <div>
                          <strong>이렇게 생각해 보세요</strong>
                          <p>{s.example}</p>
                        </div>
                      </div>
                    </section>
                  ))}
                  <section className="lesson-section">
                    <h2>{l.comparison.title}</h2>
                    <div className="table-scroll">
                      <table>
                        <thead>
                          <tr>
                            <th>비교 기준</th>
                            {l.comparison.columns.map((c) => (
                              <th key={c}>{c}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {l.comparison.rows.map((row) => (
                            <tr key={row.label}>
                              <th>{row.label}</th>
                              {row.values.map((v, i) => (
                                <td key={i}>{v}</td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                  <section className="practice lesson-section">
                    <span className="section-number">LEARNING BY DOING</span>
                    <h2>{l.practice.title}</h2>
                    {l.practice.steps.map((s, i) => (
                      <div className="practice-step" key={i}>
                        <span>{i + 1}</span>
                        <p>{s}</p>
                      </div>
                    ))}
                    <div className="prompt-box">
                      <div>
                        직접 써보는 프롬프트
                        <button
                          className="text-button"
                          onClick={async () => {
                            try {
                              await navigator.clipboard.writeText(
                                l.practice.prompt,
                              );
                              setCopied(true);
                            } catch {
                              setCopied(false);
                            }
                          }}
                        >
                          {copied ? <Check size={14} /> : <Copy size={14} />}{" "}
                          {copied ? "복사됨" : "복사"}
                        </button>
                      </div>
                      <pre>{l.practice.prompt}</pre>
                    </div>
                  </section>
                  <section className="lesson-section">
                    <span className="section-number">
                      CHECK YOUR UNDERSTANDING
                    </span>
                    <h2>얼마나 이해했을까요?</h2>
                    {l.quiz.map((q, i) => (
                      <div className="quiz" key={i}>
                        <h3>
                          <span>Q{i + 1}.</span> {q.question}
                        </h3>
                        <div className="quiz-options">
                          {q.choices.map((c, j) => (
                            <button
                              key={j}
                              className={
                                answers[i] === j
                                  ? j === q.answer
                                    ? "correct"
                                    : "incorrect"
                                  : answers[i] !== undefined && j === q.answer
                                    ? "correct"
                                    : ""
                              }
                              disabled={answers[i] !== undefined}
                              onClick={() => setAnswers({ ...answers, [i]: j })}
                            >
                              <span>{j + 1}</span>
                              {c}
                            </button>
                          ))}
                        </div>
                        {answers[i] !== undefined && (
                          <p className="quiz-answer">
                            {answers[i] === q.answer
                              ? "정답이에요."
                              : "다시 확인해 보세요."}{" "}
                            {q.explanation}
                          </p>
                        )}
                      </div>
                    ))}
                    {Object.keys(answers).length > 0 && (
                      <button
                        className="text-button"
                        onClick={() => setAnswers({})}
                      >
                        <RefreshCw size={15} /> 다시 풀기
                      </button>
                    )}
                  </section>
                  <section className="caveats">
                    <h3>읽고 나서 확인할 점</h3>
                    <ul>
                      {l.caveats.map((c) => (
                        <li key={c}>{c}</li>
                      ))}
                    </ul>
                    <p>
                      AI가 만든 설명은 원문과 함께 확인하세요.{" "}
                      {r.model && `분석 모델: ${r.model}`}
                    </p>
                  </section>
                </>
              ) : (
                <div className="empty-state">
                  <BookOpen size={38} />
                  <h2>{progress.label}</h2>
                  <p>{progress.message}</p>
                  <button
                    className="primary-button"
                    onClick={
                      progress.action === "source"
                        ? () => setTab("source")
                        : onAnalyze
                    }
                    disabled={busy || inProgress}
                  >
                    {busy
                      ? "요청 중…"
                      : inProgress
                        ? progress.label
                        : progress.action === "source"
                          ? "본문 추가"
                          : "정리 시작"}
                  </button>
                </div>
              )}
            </article>
            <aside className="lesson-aside">
              {l && (
                <>
                  <div className="aside-box">
                    <span className="eyebrow">이번 노트의 학습 목표</span>
                    {l.objectives.map((o) => (
                      <p className="objective" key={o}>
                        <Check size={16} />
                        {o}
                      </p>
                    ))}
                  </div>
                  <div className="aside-box">
                    <span className="eyebrow">작은 용어 사전</span>
                    {l.glossary.map((g) => (
                      <div className="glossary" key={g.term}>
                        <strong>{g.term}</strong>
                        <p>{g.definition}</p>
                      </div>
                    ))}
                  </div>
                </>
              )}
              <div className="aside-box source-box">
                <FileText size={21} />
                <strong>원문에서 시작한 지식</strong>
                <p>
                  {r.source_method === "pasted"
                    ? "직접 입력한 본문을 바탕으로 분석합니다."
                    : "수집한 본문을 바탕으로 분석합니다."}
                </p>
                {r.source_url && (
                  <a href={r.source_url} target="_blank" rel="noreferrer">
                    원문 열기 <ArrowUpRight size={15} />
                  </a>
                )}
                <button
                  className="text-button"
                  onClick={() => setTab("source")}
                >
                  저장한 원문 보기
                </button>
                {l && !r.demo && (
                  <button
                    className="text-button"
                    disabled={busy || inProgress}
                    onClick={onAnalyze}
                  >
                    <RefreshCw size={14} />
                    {busy ? "분석 중…" : "다시 분석"}
                  </button>
                )}
              </div>
            </aside>
          </div>
        )}
        {tab === "source" && (
          <div className="editor-section">
            <details className="metadata-details">
              <summary>제목·분류·태그 수정</summary>
              <div className="metadata-editor">
                <label htmlFor="edit-title">제목</label>
                <input
                  id="edit-title"
                  value={editTitle}
                  maxLength={120}
                  onChange={(e) => {
                    setEditTitle(e.target.value);
                    setSaved(false);
                  }}
                />
                <label htmlFor="edit-category">분야</label>
                <select
                  id="edit-category"
                  value={editCategory}
                  onChange={(e) => {
                    setEditCategory(e.target.value);
                    setSaved(false);
                  }}
                >
                  {categories.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
                <label htmlFor="edit-tags">태그 · 쉼표로 구분</label>
                <input
                  id="edit-tags"
                  value={editTags}
                  onChange={(e) => {
                    setEditTags(e.target.value);
                    setSaved(false);
                  }}
                />
                <button
                  className="secondary-button"
                  disabled={busy || !editTitle.trim()}
                  onClick={async () =>
                    setSaved(
                      await onUpdate({
                        title: editTitle,
                        category: editCategory,
                        tags: [
                          ...new Set(
                            editTags
                              .split(",")
                              .map((t) => t.trim())
                              .filter(Boolean),
                          ),
                        ].slice(0, 8),
                      }),
                    )
                  }
                >
                  <Save size={16} />
                  자료 정보 저장
                </button>
              </div>
            </details>
            <h2>원문과 출처</h2>
            {r.source_url && (
              <a
                className="source-link"
                href={r.source_url}
                target="_blank"
                rel="noreferrer"
              >
                {r.source_url}
                <ArrowUpRight size={16} />
              </a>
            )}
            <p>
              영상 자막이나 게시물 본문을 추가하면 더 충실한 학습 노트를 만들 수
              있습니다. 본문을 바꾸면 기존 분석을 다시 만들어야 합니다.
            </p>
            <label htmlFor="source-text">저장한 본문</label>
            <textarea
              id="source-text"
              rows={16}
              value={raw}
              maxLength={60000}
              disabled={busy || inProgress}
              onChange={(e) => {
                setRaw(e.target.value);
                setSaved(false);
              }}
            />
            <div className="editor-footer">
              <span>{raw.length.toLocaleString()} / 60,000자</span>
              <button
                className="primary-button"
                disabled={busy || inProgress || raw.trim().length < 80}
                onClick={async () => setSaved(await onSaveSource(raw))}
              >
                <Save size={16} />{" "}
                {busy ? "요청 중…" : "본문 저장하고 정리하기"}
              </button>
            </div>
          </div>
        )}
        {tab === "memo" && (
          <div className="editor-section">
            <h2>내 생각을 연결해 보세요</h2>
            <p>적용하고 싶은 아이디어, 떠오른 질문, 실습 결과를 남겨두세요.</p>
            <label htmlFor="memo-text">나의 메모</label>
            <textarea
              id="memo-text"
              rows={14}
              value={notes}
              maxLength={20000}
              placeholder="이 내용을 내 일에 어떻게 써볼 수 있을까?"
              onChange={(e) => {
                setNotes(e.target.value);
                setSaved(false);
              }}
            />
            <div className="editor-footer">
              <span>직접 저장한 메모는 다시 분석해도 유지됩니다.</span>
              <button
                className="primary-button"
                disabled={busy}
                onClick={async () => setSaved(await onUpdate({ notes }))}
              >
                <Save size={16} />
                {saved ? "저장됨" : "메모 저장"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
