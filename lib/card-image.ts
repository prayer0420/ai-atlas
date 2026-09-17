import type { Story, FeedItem } from "./brain-types";
const escape = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[c]!,
  );
function wrap(text: string, width: number) {
  const lines: string[] = [];
  let line = "",
    used = 0;
  for (const c of text) {
    const size = /[\u0020-\u007e]/.test(c) ? 0.56 : 1;
    if (c === "\n" || used + size > width) {
      lines.push(line);
      line = "";
      used = 0;
      if (c === "\n") continue;
    }
    line += c;
    used += size;
  }
  if (line) lines.push(line);
  return lines;
}
/** Searchable, accessible vector card; original layout, no paid image generation. */
export function cardSvg(
  story: Story,
  index: number,
  source: FeedItem | undefined,
  date: string,
  mode: string,
) {
  const slide = story.slides[index],
    title = wrap(slide.title, 15),
    body = wrap(slide.body, 27),
    bullets = slide.bullets.map((b) => wrap(b, 28));
  const total =
    title.length * 68 +
    body.length * 47 +
    bullets.reduce((n, b) => n + b.length * 42 + 30, 0) +
    130;
  const scale = Math.min(1, 900 / total);
  let y = 240;
  const lineText = (
    lines: string[],
    size: number,
    lineHeight: number,
    fill: string,
    weight = 400,
  ) =>
    lines
      .map((line) => {
        const tag = `<text x="80" y="${y.toFixed(1)}" fill="${fill}" font-size="${(size * scale).toFixed(1)}" font-weight="${weight}">${escape(line)}</text>`;
        y += lineHeight * scale;
        return tag;
      })
      .join("");
  let text = lineText(title, 58, 68, "#ffffff", 700);
  y += 35 * scale;
  text += lineText(body, 34, 47, "#e2eadc");
  y += 35 * scale;
  bullets.forEach((b, i) => {
    text += lineText(
      [`${i + 1}. ${b[0]}`, ...b.slice(1)],
      31,
      42,
      "#d5ec8b",
      500,
    );
    y += 30 * scale;
  });
  const footer = source?.source_name || "AI Atlas";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350" role="img" aria-labelledby="title description"><title id="title">${escape(slide.title)}</title><desc id="description">${escape(slide.body + " " + slide.bullets.join(" "))}</desc><rect width="1080" height="1350" fill="#203b30"/><rect x="0" y="0" width="14" height="1350" fill="#d5ec8b"/><g font-family="Malgun Gothic,Apple SD Gothic Neo,Noto Sans KR,sans-serif"><text x="80" y="95" fill="#d5ec8b" font-size="30" font-weight="700">AI ATLAS · DAILY</text><text x="1000" y="95" text-anchor="end" fill="#e2eadc" font-size="27">${index + 1} / ${story.slides.length}</text><line x1="80" y1="132" x2="1000" y2="132" stroke="#647b64"/>${text}<line x1="80" y1="1194" x2="1000" y2="1194" stroke="#647b64"/><text x="80" y="1245" fill="#ffffff" font-size="27">${escape(footer)}</text><text x="1000" y="1245" text-anchor="end" fill="#e2eadc" font-size="27">${escape(date)}</text><text x="80" y="1292" fill="#c6d4c2" font-size="24">${mode === "ai" ? "공개 출처 기반 · AI 학습 자료 · 원문 확인 권장" : "원문 미리보기 · AI 정리 대기"}</text></g></svg>`;
}
