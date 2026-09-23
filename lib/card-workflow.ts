import { z } from "zod";

export const CARD_PROMPT_VERSION = "ko-editorial-2026-09-23-v3";
export const CARD_SIZE = { width: 1080, height: 1350 } as const;
export const cardBriefSchema = z
  .object({
    audience: z
      .string()
      .trim()
      .max(160)
      .default("AI와 개발 도구를 쉽게 이해하고 싶은 한국어 독자"),
    purpose: z
      .string()
      .trim()
      .max(240)
      .default("핵심을 이해하고 작은 행동으로 옮기기"),
    count: z.number().int().min(3).max(12).default(8),
    brand: z.string().trim().max(40).default(""),
    mood: z
      .string()
      .trim()
      .max(240)
      .default("따뜻한 종이와 선명한 색을 사용하는 독립 잡지 편집 디자인"),
    required: z.string().trim().max(1500).default(""),
    design: z.enum(["magazine", "cream"]).default("magazine"),
    imageProvider: z.enum(["editorial", "comfyui", "openai"]).default("editorial"),
    imageScope: z.enum(["cover", "all"]).default("cover"),
    imageQuality: z.enum(["low", "medium", "high"]).default("medium"),
    tone: z.string().trim().max(400).default("친한 동료에게 설명하듯 담백하고 구체적으로"),
    avoid: z.string().trim().max(300).default("과장, 억지 감탄, 자료에 없는 사용 경험"),
  })
  .strict();
export type CardBrief = z.infer<typeof cardBriefSchema>;
export const cardNodes = [
  "source",
  "analysis",
  "story",
  "render",
  "verify",
  "done",
] as const;
export type CardNode = (typeof cardNodes)[number];
export const nodeLabels: Record<CardNode, string> = {
  source: "원문 확보",
  analysis: "내용 분석",
  story: "이야기·문구 구성",
  render: "이미지 제작",
  verify: "검수",
  done: "완성",
};
export const cardGraph = [
  { from: "source", to: "analysis", when: "읽을 수 있는 본문 확보" },
  { from: "analysis", to: "story", when: "원문 근거와 설명 확인" },
  { from: "story", to: "render", when: "장수·문구·흐름·근거 통과" },
  { from: "render", to: "verify", when: "장별 PNG 저장" },
  { from: "verify", to: "done", when: "이미지·캡션·출처 검수 통과" },
  { from: "story", to: "story", when: "문구·근거·구도 수정" },
  { from: "render", to: "render", when: "배치·이미지 재제작" },
  { from: "verify", to: "render", when: "손상·누락 이미지 재제작" },
  { from: "render", to: "story", when: "넘치는 문구·배치를 수정" },
  { from: "verify", to: "story", when: "원고 검수 오류 수정" },
] as const;
export const storyCardSchema = z.object({
  role: z.string().trim().min(1).max(35),
  title: z.string().trim().max(30),
  copy: z.string().trim().min(10).max(100),
  condition: z.string().trim().max(80),
  layout: z.enum([
    "scene",
    "stack",
    "relation",
    "conversation",
    "steps",
    "comparison",
    "statement",
    "closing",
  ]),
  composition: z.string().trim().min(15).max(350),
  items: z
    .array(
      z.object({
        label: z.string().trim().min(1).max(18),
        detail: z.string().trim().max(35),
      }),
    )
    .max(4),
  evidence: z.string().trim().min(8).max(220),
});
export const storyboardSchema = z.object({
  direction: z.string().trim().min(30).max(500),
  narrative: z.string().trim().min(40).max(1200),
  cards: z.array(storyCardSchema).min(3).max(12),
  caption: z.string().trim().min(40).max(3000),
  caveats: z.array(z.string().trim().min(1).max(250)).max(8),
});
export type Storyboard = z.infer<typeof storyboardSchema>;
export type StoryCard = z.infer<typeof storyCardSchema>;
export type CardAsset = {
  index: number;
  path: string;
  sha256: string;
  width: number;
  height: number;
  bytes: number;
  layout: string;
  checked: boolean;
};
export type CardRun = {
  id: string;
  user_id: string;
  resource_id: string;
  queue_id: string | null;
  state:
    | "queued"
    | "running"
    | "recovering"
    | "waiting_input"
    | "failed"
    | "completed";
  node: CardNode;
  input_hash: string;
  brief: CardBrief;
  revision: number;
  attempts: Partial<Record<CardNode, number>>;
  data: {
    visuals?: Record<string, { state: "requesting" | "queued" | "saved"; provider: "comfyui" | "openai"; key: string; jobId?: string; path?: string; sha256?: string }>;
    parentRunId?: string;
    editedIndex?: number;
    story?: Storyboard;
    sourceHash?: string;
    model?: string;
    appliedRules?: string[];
    issues?: string[];
    pendingRecovery?: {
      signature: string;
      strategy: RecoveryStrategy;
      node: CardNode;
    };
    qa?: { passed: boolean; checks: string[] };
    promptVersion?: string;
  };
  manifest: CardAsset[];
  error_code: string | null;
  message: string;
  next_action: string | null;
  created_at: string;
  updated_at: string;
};
export type CardEvent = {
  id: number;
  node: CardNode;
  state: string;
  code: string | null;
  strategy: string | null;
  message: string;
  created_at: string;
};
export const recoveryStrategies = [
  "retry_connection",
  "rewrite_story",
  "rebuild_images",
  "request_source",
  "check_connection",
] as const;
export type RecoveryStrategy = (typeof recoveryStrategies)[number];
export class CardWorkflowError extends Error {
  constructor(
    public code: string,
    message: string,
    public issues: string[] = [],
  ) {
    super(message);
  }
}
export function validateStoryboard(
  story: Storyboard,
  brief: CardBrief,
  source: string,
): string[] {
  const normalize = (s: string) => s.replace(/\s+/g, " ").trim();
  const issues: string[] = [];
  if (story.cards.length !== brief.count)
    issues.push(`장수는 정확히 ${brief.count}장이어야 합니다.`);
  const copies = new Set<string>();
  story.cards.forEach((c, i) => {
    const n = i + 1;
    if (!normalize(source).includes(normalize(c.evidence)))
      issues.push(`${n}장: 원문에 없는 근거 인용입니다.`);
    const compact = c.copy.replace(/\s|[.,!?。]/g, "");
    if (copies.has(compact)) issues.push(`${n}장: 앞 장과 본문이 같습니다.`);
    copies.add(compact);
    if (c.title && c.copy.includes(c.title) && c.title.length > 7)
      issues.push(`${n}장: 제목을 본문에서 반복합니다.`);
    if (c.copy.length > 75)
      issues.push(
        `${n}장: 본문을 짧은 1~2문장, 75자 이내로 줄이세요. 목표는 20~45자입니다.`,
      );
    if (
      i > 1 &&
      c.layout === story.cards[i - 1].layout &&
      c.layout === story.cards[i - 2].layout
    )
      issues.push(`${n}장: 같은 구도가 3장 연속 반복됩니다.`);
    if (
      ["steps", "relation", "comparison"].includes(c.layout) &&
      c.items.length < 2
    )
      issues.push(
        `${n}장: 관계·비교·단계에는 근거가 있는 항목이 2개 이상 필요합니다.`,
      );
    if (c.layout === "comparison" && c.items.length !== 2)
      issues.push(`${n}장: 비교는 같은 기준의 두 항목으로 작성하세요.`);
    if (
      /직접 써|써보니|사용해 보니|제가 써|내가 써/.test(c.copy) &&
      !/직접 써|써보니|사용해 보니|제가 써|내가 써/.test(source)
    )
      issues.push(`${n}장: 제공되지 않은 사용 경험을 만들지 마세요.`);
    for (const number of (
      c.title +
      " " +
      c.copy +
      " " +
      c.condition +
      " " +
      c.items.map((x) => x.label + " " + x.detail).join(" ")
    ).match(/\d+(?:[.,]\d+)*(?:%|원|달러|배|시간|분|초|명|개|년|월|일)/g) || [])
      if (!source.replace(/\s/g, "").includes(number))
        issues.push(`${n}장: 수치 '${number}'의 원문 근거가 없습니다.`);
  });
  if (
    story.cards.length >= 6 &&
    new Set(story.cards.map((c) => c.layout)).size < 4
  )
    issues.push("장별 역할에 맞게 최소 네 가지 구도를 사용하세요.");
  return issues;
}
export function recoveryFor(
  node: CardNode,
  error: unknown,
  attempt: number,
): {
  code: string;
  strategy: RecoveryStrategy;
  state: "recovering" | "waiting_input" | "failed";
  message: string;
} {
  const e = error as { code?: string; status?: number; name?: string };
  const code =
    e.code ||
    (e.status === 422
      ? "SOURCE_REQUIRED"
      : e.status === 401 || e.status === 402 || e.status === 403
        ? "CONNECTION_REQUIRED"
        : "TRANSIENT_FAILURE");
  if (code === "SOURCE_REQUIRED")
    return {
      code,
      strategy: "request_source",
      state: "waiting_input",
      message:
        "자동으로 읽을 수 있는 본문을 확보하지 못했습니다. 본문을 추가하면 이 단계부터 이어갑니다.",
    };
  if (code === "CONNECTION_REQUIRED")
    return {
      code,
      strategy: "check_connection",
      state: "waiting_input",
      message:
        "AI 연결 또는 이용 권한 확인이 필요합니다. 연결을 확인한 뒤 이어서 제작할 수 있습니다.",
    };
  const strategy: RecoveryStrategy =
    code === "STORY_INVALID" || (code === "IMAGE_INVALID" && node === "render")
      ? "rewrite_story"
      : code === "IMAGE_INVALID"
        ? "rebuild_images"
        : "retry_connection";
  return {
    code,
    strategy,
    state: attempt >= 3 ? "failed" : "recovering",
    message:
      attempt >= 3
        ? "같은 단계에서 세 번 완료하지 못해 자동 시도를 멈췄습니다. 사유를 확인한 뒤 다시 이어갈 수 있습니다."
        : strategy === "rewrite_story"
          ? "검수에서 찾은 문제를 반영해 이야기와 문구를 다시 구성합니다."
          : strategy === "rebuild_images"
            ? "문제가 있는 이미지 제작 단계로 돌아가 다시 만듭니다."
            : "일시적인 연결 문제로 보입니다. 완료한 단계는 보관하고 잠시 후 이어갑니다.",
  };
}
export function cardRunProgress(
  run: Pick<CardRun, "state" | "node" | "message" | "error_code">,
) {
  if (run.state === "completed")
    return {
      phase: "ready" as const,
      label: "카드뉴스 완성",
      message: "장별 PNG·캡션·출처 검수를 마쳤습니다.",
      action: null,
    };
  if (run.state === "waiting_input")
    return {
      phase:
        run.error_code === "SOURCE_REQUIRED"
          ? ("needs_content" as const)
          : ("failed" as const),
      label: "도움 필요",
      message: run.message,
      action:
        run.error_code === "SOURCE_REQUIRED"
          ? ("source" as const)
          : ("analyze" as const),
    };
  if (run.state === "failed")
    return {
      phase: "failed" as const,
      label: "확인 필요",
      message: run.message,
      action: "analyze" as const,
    };
  if (run.state === "queued")
    return {
      phase: "queued" as const,
      label: "제작 대기",
      message: "카드뉴스 이미지 완성을 목표로 요청을 저장했습니다.",
      action: null,
    };
  return {
    phase:
      run.state === "recovering" ? ("queued" as const) : ("running" as const),
    label: run.state === "recovering" ? "자동 복구 중" : nodeLabels[run.node],
    message: run.message,
    action: null,
  };
}

export function imagePrompt(card: StoryCard, index: number, brief: CardBrief) {
  return `한국어 인스타그램 카드뉴스 ${index + 1}/${brief.count} 한 장만 제작. 세로 4:5, 1080×1350. 여러 장을 합치지 않는다. ${brief.design === "cream" ? "크림 노트 편집 디자인. 크림색 #F6F1E7, 네이비 #182C3C, 따뜻한 강조색 #F1DEA9, 청회색 #385C70." : "독립 잡지 편집 디자인. 종이색 #F4F0E6, 검정 #202021, 붉은색 #EE513B, 파랑 #2C49C6."} 한글 산세리프 Noto Sans KR, 선명한 제목과 충분한 여백. 독자: ${brief.audience}. 목적: ${brief.purpose}. 분위기: ${brief.mood}. 역할: ${card.role}. 구도: ${card.composition}. 필요한 사진·평면 그림·콜라주를 내용 설명에만 사용한다. 실제 서비스 화면이나 사용 후기로 오해할 화면은 금지. 정확한 한국어 문구: 제목 «${card.title}», 본문 «${card.copy}»${card.condition ? `, 조건·제한 «${card.condition}»` : ""}. 시각 항목: ${card.items.map((x) => `«${x.label}»: «${x.detail}»`).join("; ") || "추가 글자 없음"}. ${brief.brand ? `작은 서명 «${brief.brand}».` : "브랜드명·서명은 생략."} 장 번호 ${String(index + 1).padStart(2, "0")} / ${String(brief.count).padStart(2, "0")}. 본문 2~4줄, 한 장에 핵심 하나. 한글 오탈자·잘림 금지. 장식적 3D 아이콘, 과장 문구, 큰 글씨 위+아이콘 아래의 기계적 반복 금지.`;
}
