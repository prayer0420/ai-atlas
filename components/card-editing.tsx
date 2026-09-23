"use client";
import { useState } from "react";
import { cardDesigns } from "@/lib/card-style";
import type { CardBrief, StoryCard } from "@/lib/card-workflow";

export function CardDesignPicker({ value, onChange, disabled = false }: {
  value: CardBrief["design"]; onChange: (design: CardBrief["design"]) => void; disabled?: boolean;
}) {
  return <div className="studio-designs" role="group" aria-label="카드 디자인">
    {Object.entries(cardDesigns).map(([key, design]) => <button type="button" key={key}
      className="studio-design" aria-pressed={value === key} disabled={disabled}
      onClick={() => onChange(key as CardBrief["design"])}>
      <span className="studio-design-sample" style={{ background: design.paper, color: design.ink }}>
        <strong>한 장에<br />하나의 이야기</strong>
        <span style={{ background: design.highlight }}>핵심이 보이게</span>
        <i style={{ background: design.blue }} />
      </span>
      <span>{design.name}{value === key ? " · 선택됨" : ""}</span>
    </button>)}
  </div>;
}

const layouts: Record<StoryCard["layout"], string> = {
  scene: "큰 제목과 핵심 문구", stack: "메모 묶음", relation: "관계 연결",
  conversation: "대화 말풍선", steps: "단계별 안내", comparison: "두 항목 비교",
  statement: "중요한 한마디", closing: "마무리와 실천",
};
export function CardEditor({ card, index, disabled, onSave }: {
  card: StoryCard; index: number; disabled: boolean;
  onSave: (card: Pick<StoryCard, "title" | "copy" | "condition" | "layout" | "items">) => void;
}) {
  const [draft, setDraft] = useState(() => ({ title: card.title, copy: card.copy, condition: card.condition, layout: card.layout, items: card.items.map((item) => ({ ...item })) }));
  const changed = JSON.stringify(draft) !== JSON.stringify({ title: card.title, copy: card.copy, condition: card.condition, layout: card.layout, items: card.items });
  return <details className="studio-process studio-editor">
    <summary>{index + 1}장 문구·구도 수정</summary>
    <p className="studio-help">지금 보고 있는 장만 수정합니다. 다른 장의 원고는 유지하며, 수정본은 검수 후 새 버전으로 저장합니다.</p>
    <fieldset disabled={disabled} className="studio-fields">
      <label>제목 <input maxLength={30} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></label>
      <label>핵심 문구 · {draft.copy.length}/75자<textarea maxLength={75} rows={3} value={draft.copy} onChange={(e) => setDraft({ ...draft, copy: e.target.value })} /></label>
      <label>조건·제한 <input maxLength={80} value={draft.condition} onChange={(e) => setDraft({ ...draft, condition: e.target.value })} /></label>
      <label>화면 구성<select value={draft.layout} onChange={(e) => setDraft({ ...draft, layout: e.target.value as StoryCard["layout"] })}>
        {Object.entries(layouts).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
      </select></label>
      {draft.items.map((item, i) => <div className="studio-edit-item" key={i}>
        <label>항목 {i + 1}<input maxLength={18} value={item.label} onChange={(e) => setDraft({ ...draft, items: draft.items.map((x, j) => j === i ? { ...x, label: e.target.value } : x) })} /></label>
        <label>짧은 설명<input maxLength={35} value={item.detail} onChange={(e) => setDraft({ ...draft, items: draft.items.map((x, j) => j === i ? { ...x, detail: e.target.value } : x) })} /></label>
        <button type="button" className="text-button" onClick={() => setDraft({ ...draft, items: draft.items.filter((_, j) => j !== i) })}>항목 {i + 1} 제거</button>
      </div>)}
      <p className="studio-help">관계·단계에는 항목 2개 이상, 비교에는 정확히 2개가 필요합니다. 원문에 없는 수치와 경험은 추가하지 마세요.</p>
      {draft.items.length < 4 && <button type="button" className="text-button" onClick={() => setDraft({ ...draft, items: [...draft.items, { label: "", detail: "" }] })}>설명 항목 추가</button>}
      <button type="button" className="primary-button" disabled={!changed || draft.copy.trim().length < 10 || draft.items.some((x) => !x.label.trim())} onClick={() => onSave(draft)}>수정본 만들기</button>
    </fieldset>
  </details>;
}
