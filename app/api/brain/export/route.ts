import { NextRequest, NextResponse } from "next/server";
import { authenticate, checkDb, errorResponse, AppError } from "@/lib/server";
import { ensureOwner } from "@/lib/brain-ai";
import { buildVault, type VaultInput } from "@/lib/vault";
import { zipSync, strToU8 } from "fflate";
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  try {
    const { db, user } = await authenticate(req);
    ensureOwner(user.email);
    const read = async (table: string, deleted = false) => {
      const rows = [];
      for (let page = 0; page < 20; page++) {
        let q = db
          .from(table)
          .select("*")
          .order("id")
          .range(page * 100, page * 100 + 99);
        if (deleted) q = q.is("deleted_at", null);
        const r = await q;
        checkDb(r.error);
        rows.push(...(r.data || []));
        if ((r.data?.length || 0) < 100) return rows;
      }
      throw new AppError(
        "한 번에 2,000개 미만의 자료를 내보낼 수 있습니다. 운영자에게 분할 내보내기를 요청해 주세요.",
        413,
      );
    };
    const [resources, pages, issues, tasks] = await Promise.all([
      read("ai_atlas_resources", true),
      read("ai_atlas_wiki_pages"),
      read("ai_atlas_issues"),
      read("ai_atlas_tasks"),
    ]);
    const feedIds = [
      ...new Set(
        issues.flatMap((i) =>
          (i.content.stories as { feed_id: string }[]).map((s) => s.feed_id),
        ),
      ),
    ];
    const items = [];
    for (let start = 0; start < feedIds.length; start += 100) {
      const r = await db
        .from("ai_atlas_feed_items")
        .select("*")
        .in("id", feedIds.slice(start, start + 100));
      checkDb(r.error);
      items.push(...(r.data || []));
    }
    const files = buildVault({
      resources,
      pages,
      issues,
      items,
      tasks,
    } as VaultInput);
    const payload = JSON.stringify({
      archive: Buffer.from(
        zipSync(
          Object.fromEntries(
            Object.entries(files).map(([path, text]) => [path, strToU8(text)]),
          ),
        ),
      ).toString("base64"),
      file_count: Object.keys(files).length,
      created_at: new Date().toISOString(),
    });
    if (Buffer.byteLength(payload) > 4_000_000)
      throw new AppError(
        "내보낼 자료가 큽니다. 운영자에게 분할 내보내기를 요청해 주세요.",
        413,
      );
    return new NextResponse(payload, {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
