import { NextRequest, NextResponse } from "next/server";
import { admin, authenticate, AppError, body, checkDb, errorResponse, uuid } from "@/lib/server";
import { cardSource, publishedCards } from "@/lib/card-service";
import { cardRevisionSchema, prepareCardRevision } from "@/lib/card-revision";
import { CARD_PROMPT_VERSION } from "@/lib/card-workflow";
import { readableText } from "@/lib/content-text";
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await authenticate(req);
    const id = uuid.parse((await ctx.params).id);
    const input = cardRevisionSchema.parse(await body(req));
    const source = await cardSource(user.id, id);
    const base = await publishedCards(user.id, source, input.runId);
    if (!base || base.revision !== input.revision) throw new AppError("완성본이 변경됐습니다. 새로고침한 뒤 수정해 주세요.", 409);
    let revision;
    try { revision = prepareCardRevision(base, input, readableText(source.raw_text)); }
    catch (e) { throw new AppError((e as Error).message, 400); }
    const result = await admin().rpc("ai_atlas_revise_cards", { p_user_id: user.id, p_resource_id: id, p_base_id: base.id, p_revision: base.revision, p_brief: revision.brief, p_data: revision.data, p_version: CARD_PROMPT_VERSION });
    if (result.error && /BASE_CHANGED|ALREADY_RUNNING/.test(result.error.message)) throw new AppError("새 제작이 진행 중이거나 완성본이 변경됐습니다. 현재 제작이 끝나면 다시 수정해 주세요.", 409);
    checkDb(result.error);
    return NextResponse.json({ run: result.data, message: "수정본 제작을 예약했습니다. 이전 완성본은 유지됩니다." }, { status: 202 });
  } catch (e) { return errorResponse(e); }
}
