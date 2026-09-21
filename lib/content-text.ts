/** Repair escaped prose without changing fenced code, inline code, URLs or paths. */
export function readableText(text: string): string {
  const protectedParts = /(```[\s\S]*?```|`[^`\n]*`|https?:\/\/[^\s]+|[A-Za-z]:\\[^\s]+)/g;
  return text.split(protectedParts).map((part, i) => i % 2 ? part : part
    .replace(/\\+r\\+n|\\+n/g, "\n")
    .replace(/(?<=[가-힣.!?])\s*\/n(?=\s|[가-힣0-9])/g, "\n")
    .replace(/\r\n?/g, "\n")
    .replace(/\n[ \t]*\n(?:[ \t]*\n)+/g, "\n\n")
  ).join("").trim();
}

/** Apply to structured prose at the boundary; does not mutate stored source text. */
export function readableValue<T>(value: T): T {
  if (typeof value === "string") return readableText(value) as T;
  if (Array.isArray(value)) return value.map(readableValue) as T;
  if (value && typeof value === "object")
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, readableValue(v)])) as T;
  return value;
}

export function sourceProblem(text: string): string | null {
  const clean = readableText(text);
  if (clean.length < 80) return "분석할 본문이 부족합니다. 원문·출처에서 본문이나 자막을 추가해 주세요.";
  const beginning = clean.slice(0, 700);
  if (/^(?:just a moment|access denied|403 forbidden|404 not found|checking your browser|enable javascript)/i.test(beginning) ||
      (clean.length < 1800 && /(?:you need to enable javascript|sign in to continue|로그인 후 (?:이용|확인)|접근 권한이 없|이 페이지에 접근할 수 없|verify you are human|페이지를 찾을 수 없)/i.test(clean)))
    return "원문 대신 로그인·접근 제한 화면을 받았습니다. 읽을 수 있는 본문을 원문·출처에 추가해 주세요.";
  return null;
}
