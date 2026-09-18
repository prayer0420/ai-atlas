"use client";

import { useState } from "react";
import { ArrowDown, ArrowUpRight, ChevronLeft, ChevronRight, BookOpen } from "lucide-react";
import type { Resource } from "@/lib/types";
import { readingExcerpt } from "@/lib/reading";

/** A small, manually controlled reading shelf: no autoplay or extra requests. */
export function ReadingDesk({ resources, demo, onRead, onBrowse }: {
  resources: Resource[];
  demo: boolean;
  onRead: (resource: Resource) => void;
  onBrowse: () => void;
}) {
  const [position, setPosition] = useState(0);
  const entries = resources.filter((r) => !r.deleted_at).slice(0, 5);
  const index = entries.length ? position % entries.length : 0;
  const entry = entries[index];
  const concepts = entry?.lesson?.diagram?.nodes.slice(0, 3) || [];

  return (
    <section className="reading-desk" aria-label="읽기 시작하기">
      <div className="desk-intro">
        <span className="desk-kicker"><span /> THE READING ROOM</span>
        <h2>수집에서 끝내지 않는<br /><em>나의 지식 서재.</em></h2>
        <p>발견한 정보를 한 장으로 이해하고,<br />궁금한 생각은 더 깊이 연결하세요.</p>
        <button className="desk-browse" onClick={onBrowse}>서재 둘러보기 <ArrowDown size={16} /></button>
        <div className="desk-footnote">COLLECT <span>—</span> UNDERSTAND <span>—</span> CONNECT</div>
      </div>
      <div className="desk-feature">
        <div className="feature-heading">
          <span><BookOpen size={15} /> {demo ? "미리 둘러보는 서재" : "서재에서 꺼낸 한 편"}</span>
          <span>{entry ? String(index + 1).padStart(2, "0") : "00"} / {String(entries.length).padStart(2, "0")}</span>
        </div>
        {entry ? (
          <button className="feature-story" onClick={() => onRead(entry)} key={entry.id}>
            <div className="feature-art" aria-hidden="true">
              <div className="atlas-orbit orbit-one" /><div className="atlas-orbit orbit-two" /><div className="atlas-orbit orbit-three" />
              <span className="orbit-center">a.</span>
              {concepts.map((node, i) => <span className={`orbit-label label-${i}`} key={node.label}>{node.label}</span>)}
            </div>
            <div className="feature-copy">
              <span className="feature-category">{entry.category} · {demo ? "체험 자료" : entry.status === "ready" ? "학습 노트" : "보관한 원문"}</span>
              <h3>{entry.title}</h3>
              <p>{readingExcerpt(entry.lesson?.takeaways[0] || entry.lesson?.summary || entry.summary || "아직 분석 전인 자료입니다. 저장한 원문부터 읽어보세요.", 90)}</p>
              <span className="feature-link">{entry.lesson ? `${entry.lesson.readMinutes}분 읽기` : "원문 열어보기"} <ArrowUpRight size={18} /></span>
            </div>
          </button>
        ) : (
          <div className="feature-empty"><BookOpen size={36} /><h3>첫 번째 읽을거리를 기다립니다.</h3><p>자료를 저장하고 분석하면 이곳에서 펼쳐볼 수 있어요.</p></div>
        )}
        <div className="feature-pagination">
          <span aria-live="polite">{demo ? "예시를 둘러보고 나만의 서재를 시작하세요" : "현재 불러온 자료에서 최대 다섯 편"} · {entries.length ? index + 1 : 0}/{entries.length}</span>
          <div>
            <button aria-label="이전 추천 노트" disabled={entries.length < 2} onClick={() => setPosition((p) => (p + entries.length - 1) % entries.length)}><ChevronLeft size={17} /></button>
            <button aria-label="다음 추천 노트" disabled={entries.length < 2} onClick={() => setPosition((p) => (p + 1) % entries.length)}><ChevronRight size={17} /></button>
          </div>
        </div>
      </div>
    </section>
  );
}
