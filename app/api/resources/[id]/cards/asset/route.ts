import { NextRequest } from "next/server";
import { zipSync, strToU8 } from "fflate";
import {
  admin,
  authenticate,
  AppError,
  errorResponse,
  uuid,
} from "@/lib/server";
import { CARD_BUCKET, cardSource, publishedCards, assertCardPath } from "@/lib/card-service";
import { imagePrompt } from "@/lib/card-workflow";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await authenticate(req);
    const id = uuid.parse((await ctx.params).id);
    const requestedRun = req.nextUrl.searchParams.get("run");
    const runId = requestedRun === null ? undefined : uuid.parse(requestedRun);
    const source = await cardSource(user.id, id);
    const run = await publishedCards(user.id, source, runId);
    if (!run)
      throw new AppError("검수가 끝난 카드뉴스가 없습니다.", 409);
    const all = req.nextUrl.searchParams.get("download") === "all";
    const index = Number(req.nextUrl.searchParams.get("index"));
    if (
      !all &&
      (!Number.isInteger(index) || index < 0 || index >= run.manifest.length)
    )
      throw new AppError("이미지를 찾을 수 없습니다.", 404);
    const files: Record<string, Uint8Array> = {};
    for (const asset of all ? run.manifest : [run.manifest[index]]) {
      assertCardPath(user.id, run, asset.path);
      const downloaded = await admin()
        .storage.from(CARD_BUCKET)
        .download(asset.path);
      if (downloaded.error || !downloaded.data)
        throw new AppError(
          "이미지를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.",
          502,
        );
      files[`card-${String(asset.index + 1).padStart(2, "0")}.png`] =
        new Uint8Array(await downloaded.data.arrayBuffer());
    }
    if (all) {
      const story = run.data.story!;
      files["caption.txt"] = strToU8(story.caption);
      files["sources.txt"] = strToU8(
        `${source.source_url || "사용자가 제공한 본문"}\n\n원문 기준 정리입니다. 독립적인 최신 사실 검증은 수행하지 않았습니다.\n${story.caveats.join("\n")}`,
      );
      files["image-prompts.txt"] = strToU8(
        story.cards
          .map((c, i) => imagePrompt(c, i, run.brief))
          .join("\n\n---\n\n"),
      );
      files["storyboard.json"] = strToU8(JSON.stringify(story, null, 2));
    }
    const bytes = all ? zipSync(files, { level: 0 }) : Object.values(files)[0];
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": all ? "application/zip" : "image/png",
        "Content-Disposition": `${all ? "attachment" : "inline"}; filename="${all ? "card-news.zip" : `card-${index + 1}.png`}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
