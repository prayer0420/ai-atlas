"use client";
import { useRef, useState } from "react";
import { ArrowDown, ArrowLeft, ArrowRight, BookOpen, Download, Network, Quote } from "lucide-react";
import type { Lesson } from "@/lib/types";
import { cardsForLesson } from "@/lib/lesson-cards";

export function LessonCards({ lesson, sourceUrl, onDetail }: {
  lesson: Lesson; sourceUrl: string | null; onDetail: (sectionIndex: number) => void;
}) {
  const { cards, legacy } = cardsForLesson(lesson);
  const [index, setIndex] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const cardRef = useRef<HTMLElement>(null);
  const current = Math.min(index, cards.length - 1);
  const card = cards[current];
  async function download() {
    if (!cardRef.current) return;
    setExporting(true); setError("");
    try {
      const { toBlob } = await import("html-to-image");
      const blob = await toBlob(cardRef.current, { pixelRatio: 2, backgroundColor: "#f8f6ef", skipFonts: true });
      if (!blob) throw new Error("Empty image");
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.download = `${lesson.title.replace(/[\\/:*?"<>|]/g, "")}-${current + 1}.png`;
      link.href = url; document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch { setError("이미지를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요."); }
    finally { setExporting(false); }
  }
  return <section className="lesson-story" aria-label="핵심 카드뉴스">
    <div className="story-heading">
      <div><span className="story-eyebrow">먼저, 한눈에 이해하기</span><h2>핵심 카드뉴스 <small>{cards.length}장</small></h2></div>
      <button className="text-button" onClick={download} disabled={exporting}><Download size={16} />{exporting ? "저장 중…" : "이 카드 저장"}</button>
    </div>
    {legacy && <p className="story-legacy">기존 상세분석으로 구성한 시각 요약입니다. 다시 분석하면 원문 근거가 연결된 카드로 갱신됩니다.</p>}
    <div className="story-grid">
      <article ref={cardRef} className={`story-sheet story-sheet-${card.visual}`} aria-label={`${current + 1} / ${cards.length}: ${card.title}`}>
        <header className="story-sheet-top"><span>AI ATLAS / FIELD NOTES</span><span>{String(current + 1).padStart(2, "0")} — {String(cards.length).padStart(2, "0")}</span></header>
        <div className="story-sheet-intro"><span className="story-category">{lesson.category}</span><h3>{card.title}</h3><p>{card.takeaway}</p></div>
        <div className={`story-visual story-visual-${card.visual}`} role="group" aria-label={card.visual === "flow" ? "흐름으로 이해하기" : card.visual === "compare" ? "나란히 비교하기" : "개념 연결하기"}>
          {card.visual === "concept" && <div className="story-hub"><Network size={26} aria-hidden="true" /><span>핵심 연결</span></div>}
          <ol>{card.nodes.map((node, i) => <li key={i}>
            <span className="story-node-number" aria-hidden="true">{String(i + 1).padStart(2, "0")}</span>
            <div><strong>{node.label}</strong><p>{node.detail}</p></div>
            {card.visual === "flow" && i < card.nodes.length - 1 && <ArrowDown className="story-connector" size={20} aria-hidden="true" />}
          </li>)}</ol>
        </div>
        <p className="story-note"><span>함께 기억하기</span>{card.note}</p>
        <footer className="story-sheet-footer"><span>{sourceUrl ? new URL(sourceUrl).hostname : "직접 입력한 자료"}</span><span>AI 요약 · 원문 확인 필요</span></footer>
      </article>
      <aside className="story-reader">
        <p className="story-eyebrow">이 자료의 핵심 흐름</p>
        <nav className="story-chapters" aria-label="카드 선택">{cards.map((item, i) => <button key={i} aria-current={current === i ? "step" : undefined} onClick={() => setIndex(i)}><span>{String(i + 1).padStart(2, "0")}</span>{item.title}</button>)}</nav>
        <div className="story-detail-link"><BookOpen size={23} /><h3>왜 그런지 궁금하다면</h3><p>배경, 작동 원리, 예시와 주의점은 상세분석에 모두 남겨두었습니다.</p><button className="primary-button" onClick={() => onDetail(card.sectionIndex)}>이 카드의 상세분석 <ArrowRight size={16} /></button></div>
        {card.evidence && <details className="story-evidence" key={current}><summary><Quote size={16} /> 카드의 원문 근거</summary><blockquote>{card.evidence}</blockquote><p>원문에서 확인한 구절입니다. 주장 자체의 사실 검증을 의미하지는 않습니다.</p></details>}
        {sourceUrl && <a className="text-button" href={sourceUrl} target="_blank" rel="noopener noreferrer">원문 사이트 열기 ↗</a>}
      </aside>
    </div>
    <div className="story-controls"><button className="secondary-button" aria-label="이전 카드" disabled={current === 0} onClick={() => setIndex(current - 1)}><ArrowLeft size={18} /> 이전</button><span role="status" aria-live="polite">{current + 1} / {cards.length}</span><button className="secondary-button" aria-label="다음 카드" disabled={current === cards.length - 1} onClick={() => setIndex(current + 1)}>다음 <ArrowRight size={18} /></button></div>
    {error && <p role="alert">{error}</p>}
  </section>;
}
