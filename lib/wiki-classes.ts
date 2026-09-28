// 십진 분류 번호(도서관 DDC처럼)로 위키 문서마다 "기억할 수 있는 주소"를 붙인다.
// 제목을 잊어도 번호(예: 200)로 찾아 들어갈 수 있게 하고, 에이전트가 메타데이터만 읽고도
// 어느 영역의 문서인지 판단하게 하려는 것이다. 분류는 제목·요약·태그의 낱말로 정하는
// 결정적 규칙이며(모델 호출 없음), 맞는 낱말이 없으면 000으로 두고 점검에서 알린다.
export type WikiClass = { code: string; name: string; words: string[] };

export const WIKI_CLASSES: WikiClass[] = [
  { code: "000", name: "총류·AI 기초 개념", words: ["개념", "기초", "입문", "정의", "용어"] },
  { code: "100", name: "모델·연구·성능", words: ["모델", "벤치마크", "성능", "효율", "훈련", "추론", "파인튜닝", "llm", "mlx", "오픈소스"] },
  { code: "200", name: "에이전트·자동화 워크플로", words: ["에이전트", "agent", "워크플로", "자동화", "오케스트레이션", "하네스", "크루", "mcp", "위임"] },
  { code: "300", name: "이미지·영상·디자인 제작", words: ["이미지", "영상", "디자인", "ppt", "발표", "카드뉴스", "higgsfield", "포스터", "썸네일", "시각"] },
  { code: "400", name: "콘텐츠·마케팅·수익", words: ["콘텐츠", "마케팅", "수익", "광고", "블로그", "유튜브", "인스타", "스레드", "발행", "sns"] },
  { code: "500", name: "지식관리·검색", words: ["rag", "검색", "위키", "지식", "옵시디언", "obsidian", "노트", "근거", "메모"] },
  { code: "600", name: "개발·인프라", words: ["개발", "코드", "서버", "csp", "배포", "api", "빌드", "엔진", "프레임"] },
  { code: "700", name: "정책·보안·법률·윤리", words: ["법률", "보안", "거버넌스", "정책", "윤리", "저작권", "보호", "규제", "위험"] },
  { code: "800", name: "산업·업무 적용", words: ["금융", "ipo", "의료", "교육", "산업", "데이터 통합", "도입", "업무"] },
  { code: "900", name: "Hive·NOA 운영", words: ["noa", "hive", "하이브", "노아", "jarvis"] },
];

export function classifyWiki(text: string): WikiClass & { matched: boolean } {
  const haystack = text.toLowerCase();
  let best = WIKI_CLASSES[0],
    bestScore = 0;
  for (const item of WIKI_CLASSES) {
    const score = item.words.reduce(
      (n, word) => n + (haystack.includes(word) ? 1 : 0),
      0,
    );
    // 동점이면 표의 앞쪽(더 일반적인 번호)을 유지한다.
    if (score > bestScore) {
      best = item;
      bestScore = score;
    }
  }
  return { ...best, matched: bestScore > 0 };
}

/**
 * Obsidian 태그 규칙에 맞춘다. 숫자로만 된 태그는 태그로 인식되지 않고,
 * 공백·#·쉼표는 태그를 끊는다.
 */
export function obsidianTag(value: string) {
  const tag = value
    .normalize("NFC")
    .trim()
    .replace(/^#+/, "")
    .replace(/[\s,#]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  if (!tag) return "";
  return /^\d+$/.test(tag) ? "n" + tag : tag;
}
