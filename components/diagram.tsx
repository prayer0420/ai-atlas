"use client";
import {
  ArrowRight,
  RotateCcw,
  Download,
  Layers,
  Check,
  Search,
  Database,
  FileText,
  BrainCircuit,
  MessageSquare,
  ShieldCheck,
} from "lucide-react";
import { useRef, useState } from "react";
import type { Lesson } from "@/lib/types";
import { readingExcerpt } from "@/lib/reading";
function ConceptIcon({ label }: { label: string }) {
  const Icon = /검색|질의|retriev|search/i.test(label)
    ? Search
    : /저장|벡터|데이터|index/i.test(label)
      ? Database
      : /문서|자료|원문|입력/i.test(label)
        ? FileText
        : /검증|검토|평가|확인/i.test(label)
          ? ShieldCheck
          : /답변|응답|출력/i.test(label)
            ? MessageSquare
            : /모델|생성|llm|학습/i.test(label)
              ? BrainCircuit
              : Layers;
  return <Icon size={25} aria-hidden="true" />;
}
export function Diagram({
  diagram,
  compact = false,
  summary = false,
}: {
  diagram: Lesson["diagram"];
  compact?: boolean;
  summary?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  async function download() {
    try {
      setError("");
      const { toPng } = await import("html-to-image");
      const url = await toPng(ref.current!, {
        pixelRatio: 2,
        backgroundColor: "#f2f3ff",
      });
      const a = document.createElement("a");
      a.download = "AI-Atlas-개념도.png";
      a.href = url;
      a.click();
      setSaved(true);
    } catch {
      setError("이미지 저장에 실패했습니다. 다시 시도해 주세요.");
    }
  }
  return (
    <div className={`diagram-wrap ${compact ? "compact" : ""}`}>
      <div
        ref={ref}
        className={`diagram ${diagram.kind} ${summary ? "diagram-summary" : ""}`}
        role="group"
        aria-label={diagram.title}
      >
        <div className="diagram-heading">
          <span>
            <Layers size={16} /> {diagram.title}
          </span>
          <span className="eyebrow">VISUAL NOTE</span>
        </div>
        <div className="diagram-nodes">
          {diagram.nodes.map((node, i) => (
            <div className="diagram-step" key={i}>
              <div className="diagram-node">
                <span className="concept-icon">
                  <ConceptIcon label={node.label} />
                </span>
                <span className="node-num">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <strong>{node.label}</strong>
                {!compact && !summary && <p>{node.description}</p>}
              </div>
              {i < diagram.nodes.length - 1 && (
                <ArrowRight
                  className="diagram-arrow"
                  size={20}
                  aria-hidden="true"
                />
              )}
            </div>
          ))}
        </div>
        {!compact && (
          <p className="diagram-caption">
            {diagram.kind === "cycle" && <RotateCcw size={16} />}{" "}
            {summary ? readingExcerpt(diagram.caption, 160) : diagram.caption}
          </p>
        )}
      </div>
      {summary && (
        <details className="diagram-text">
          <summary>개념도를 글로 읽기</summary>
          <ol>
            {diagram.nodes.map((n, i) => (
              <li key={i}>
                <strong>{n.label}</strong>
                <p>{n.description}</p>
              </li>
            ))}
          </ol>
          <p>{diagram.caption}</p>
        </details>
      )}
      {!compact && (
        <div className="diagram-actions">
          <span>{error || "개념의 흐름을 한 장으로 기억하세요."}</span>
          <button className="text-button" onClick={download}>
            {saved ? <Check size={15} /> : <Download size={15} />}{" "}
            {saved ? "저장 완료" : "이미지 저장"}
          </button>
        </div>
      )}
    </div>
  );
}
export function Cover({
  category,
  index = 0,
  diagram,
}: {
  category: string;
  index?: number;
  diagram?: Lesson["diagram"] | null;
}) {
  const sets: Record<string, string[]> = {
    "AI 에이전트": ["목표", "도구", "실행", "확인"],
    프롬프트: ["목표", "맥락", "조건", "형식"],
    "개발·자동화": ["문서", "검색", "근거", "응답"],
    "이미지·영상": ["텍스트", "조건", "생성", "이미지"],
    "AI 기초": ["데이터", "학습", "모델", "예측"],
    생산성: ["수집", "정리", "실행", "검토"],
    "산업·트렌드": ["기술", "제품", "산업", "변화"],
  };
  const nodes =
    diagram?.nodes.map((n) => n.label) || sets[category] || sets["AI 기초"];
  return (
    <div
      className={`cover cover-${Math.max(0, index) % 4} ${diagram ? "cover-evidence" : ""} cover-kind-${diagram?.kind || "flow"}`}
      role="img"
      aria-label={
        diagram
          ? `${diagram.title}: ${nodes.join(diagram.kind === "cycle" ? " → " : " · ")}${diagram.kind === "cycle" ? " → " + nodes[0] : ""}`
          : `${category} 분야 안내도. 이 자료의 분석 결과는 아닙니다.`
      }
    >
      <span className="cover-label">
        {diagram ? "이 자료의 개념도" : category + " · 분야 안내"}
      </span>
      <div className="cover-flow">
        {nodes.map((n, i) => (
          <div className="cover-step" key={i}>
            <span>{n}</span>
            {i < nodes.length - 1 && <ArrowRight size={15} />}
          </div>
        ))}
      </div>
      <span className="cover-bottom">
        {diagram?.title || "분석 후 자료별 개념도가 표시됩니다."}
      </span>
    </div>
  );
}
