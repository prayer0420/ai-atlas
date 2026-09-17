"use client";
import { ArrowRight, RotateCcw, Download, Layers, Check } from "lucide-react";
import { useRef, useState } from "react";
import type { Lesson } from "@/lib/types";
export function Diagram({
  diagram,
  compact = false,
}: {
  diagram: Lesson["diagram"];
  compact?: boolean;
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
      <div ref={ref} className={`diagram ${diagram.kind}`}>
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
                <span className="node-num">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <strong>{node.label}</strong>
                {!compact && <p>{node.description}</p>}
              </div>
              {i < diagram.nodes.length - 1 && (
                <ArrowRight className="diagram-arrow" size={20} />
              )}
            </div>
          ))}
        </div>
        {!compact && (
          <p className="diagram-caption">
            {diagram.kind === "cycle" && <RotateCcw size={16} />}{" "}
            {diagram.caption}
          </p>
        )}
      </div>
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
}: {
  category: string;
  index?: number;
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
  const nodes = sets[category] || sets["AI 기초"];
  return (
    <div
      className={`cover cover-${index % 4}`}
      aria-label={`${category} 분야 개념 흐름`}
    >
      <span className="cover-label">
        {category.toUpperCase()} <span>↗</span>
      </span>
      <div className="cover-flow">
        {nodes.map((n, i) => (
          <div className="cover-step" key={n}>
            <span>{n}</span>
            {i < 3 && <ArrowRight size={13} />}
          </div>
        ))}
      </div>
      <span className="cover-bottom">
        AI ATLAS <span>COLLECT · CONNECT · LEARN</span>
      </span>
    </div>
  );
}
