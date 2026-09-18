import { z } from "zod";
import { wikiDraftSchema, type WikiPage } from "./brain-types";

export const agentWikiSchema = wikiDraftSchema.extend({
  expected_revision: z.number().int().min(0),
}).strict();

/** Check evidence and revisions independently of what the model claims. */
export function guardAgentWiki(
  input: unknown,
  readSources: ReadonlySet<string>,
  readRevisions: ReadonlyMap<string, number>,
  pages: Pick<WikiPage, "slug" | "revision" | "protected" | "source_ids">[],
) {
  const draft = agentWikiSchema.parse(input);
  if (draft.source_ids.some((id) => !readSources.has(id)))
    throw new Error("먼저 atlas_read_note로 인용할 raw 원문을 읽어 주세요.");
  const prior = pages.find((p) => p.slug === draft.slug);
  if (prior?.protected) throw new Error("검토 완료 문서는 자동 수정할 수 없습니다.");
  if (prior && (readRevisions.get(prior.slug) !== prior.revision || draft.expected_revision !== prior.revision))
    throw new Error("기존 위키를 다시 읽고 최신 revision으로 수정해 주세요.");
  if (!prior && draft.expected_revision !== 0) throw new Error("새 문서의 expected_revision은 0입니다.");
  if (prior?.source_ids.some((id) => !draft.source_ids.includes(id)))
    throw new Error("기존 근거를 삭제할 수 없습니다. 기존 출처도 읽고 유지해 주세요.");
  const known = new Set(pages.map((p) => p.slug));
  if (draft.links.some((slug) => !known.has(slug) || slug === draft.slug))
    throw new Error("links에는 실제 존재하는 다른 위키 slug만 사용할 수 있습니다.");
  for (const match of draft.body.matchAll(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g))
    if (!known.has(match[1])) throw new Error("본문에 존재하지 않는 위키 링크가 있습니다.");
  return {
    ...draft,
    source_ids: [...new Set(draft.source_ids)],
    links: [...new Set(draft.links)],
    caveats: [...new Set([
      "Hermes가 읽은 자료를 바탕으로 작성한 AI 초안입니다. 사실 검토 완료를 뜻하지 않습니다.",
      "긴 원문은 발췌 단위로 읽습니다. 연결된 원문과 함께 확인하세요.",
      ...draft.caveats,
    ])].slice(0, 8),
  };
}
