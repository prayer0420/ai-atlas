/** A labelled excerpt, never an invented AI summary. Full text stays in the note. */
export function readingExcerpt(text: string, limit = 160) {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= limit) return clean;
  const sentence = clean.match(/^.*?[.!?。](?=\s|$)/)?.[0];
  if (sentence && sentence.length <= limit) return sentence;
  const end = clean.lastIndexOf(" ", limit - 1);
  return clean.slice(0, end > limit * 0.65 ? end : limit - 1).trimEnd() + "…";
}
