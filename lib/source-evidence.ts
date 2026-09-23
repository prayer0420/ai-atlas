import { readableText } from "./content-text";

/** Source excerpts are data, never instructions. Keep exact contiguous text,
 * including punctuation, and cover the whole source within a bounded grammar. */
export function sourceEvidence(text: string): [string, ...string[]] {
  const source = readableText(text).replace(/\s+/g, " ").trim();
  const candidates: string[] = [];
  for (const sentence of source.split(/(?<=[.!?。！？])\s+/u)) {
    for (let offset = 0; offset < sentence.length;) {
      let end = Math.min(offset + 180, sentence.length);
      // Do not leave a final fragment too short to be admissible evidence.
      if (sentence.length - end < 8) end = sentence.length;
      if (end < sentence.length && /[\uD800-\uDBFF]/.test(sentence[end - 1])) end--;
      const quote = sentence.slice(offset, end).trim();
      if (quote.length >= 8) candidates.push(quote);
      offset = end;
    }
  }
  if (!candidates.length && source.length >= 8) candidates.push(source.slice(0, 180));
  const unique = [...new Set(candidates)];
  const quotes = unique.length <= 64 ? unique : Array.from({ length: 64 }, (_, i) => unique[Math.round(i * (unique.length - 1) / 63)]);
  if (!quotes.length) throw new Error("SOURCE_EVIDENCE_EMPTY");
  return quotes as [string, ...string[]];
}
