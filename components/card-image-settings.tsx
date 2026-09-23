"use client";
import type { CardBrief } from "@/lib/card-workflow";
import { imageProviders } from "@/lib/card-image-options";

export function CardImageSettings({ brief, onChange, disabled }: { brief: CardBrief; onChange(value: CardBrief): void; disabled?: boolean }) {
  return <div className="studio-image-settings">
    <label>이미지 만드는 방식
      <select aria-label="이미지 만드는 방식" value={brief.imageProvider} disabled={disabled}
        onChange={(e) => onChange({ ...brief, imageProvider: e.target.value as CardBrief["imageProvider"] })}>
        {Object.entries(imageProviders).map(([id, p]) => <option key={id} value={id}>{p.name}</option>)}
      </select>
    </label>
    <p className="studio-help">{imageProviders[brief.imageProvider].description}</p>
    {brief.imageProvider !== "editorial" && <>
      <div className="studio-image-options">
        <label>삽화 넣을 곳<select aria-label="삽화 넣을 곳" value={brief.imageScope} disabled={disabled}
          onChange={(e) => onChange({ ...brief, imageScope: e.target.value as CardBrief["imageScope"] })}>
          <option value="cover">표지만 · 1회 생성</option><option value="all">모든 장 · 장수만큼 생성</option>
        </select></label>
        {brief.imageProvider === "openai" && <label>이미지 품질<select aria-label="이미지 품질" value={brief.imageQuality} disabled={disabled}
          onChange={(e) => onChange({ ...brief, imageQuality: e.target.value as CardBrief["imageQuality"] })}>
          <option value="low">낮음 · 비용 절약</option><option value="medium">중간 · 기본</option><option value="high">높음 · 비용 증가</option>
        </select></label>}
      </div>
      <p className="studio-help">새 제작 시 {brief.imageScope === "cover" ? 1 : brief.count}회 생성합니다. 한글은 별도로 배치하며, 생성 삽화는 실제 사진·서비스 화면이 아닙니다. 연결은 제작 시 확인합니다.</p>
      <details><summary>처음 연결하는 방법</summary>
        {brief.imageProvider === "openai" ? <p className="studio-help">처리 PC에서 <code>scripts/configure-image-openai.ps1</code>을 실행해 API 키를 저장한 뒤 처리기를 다시 시작해 주세요. 키는 웹사이트나 채팅에 붙여넣지 마세요. 모델은 gpt-image-2이며 <a href="https://developers.openai.com/api/docs/pricing" target="_blank" rel="noreferrer">API 요금</a>이 적용됩니다.</p>
          : <p className="studio-help">처리 PC에 ComfyUI와 Z-Image Turbo 모델 파일을 준비하고 <code>127.0.0.1:8188</code>에서 실행하세요. Z-Image Turbo 기본 연결은 포함돼 있습니다. 다른 모델은 <code>.local/card-image-workflow.json</code>의 API 워크플로로 연결할 수 있습니다. 설치·모델 파일 준비는 별도로 필요합니다.</p>}
        <p className="studio-help">자세한 설명: 프로젝트의 <code>docs/image-generation.md</code>. 연결 실패 시 다른 제공자로 자동 전환하지 않습니다.</p>
      </details>
    </>}
  </div>;
}
