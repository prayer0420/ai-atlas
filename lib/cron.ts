import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { admin, checkDb, errorResponse } from "./server";
import { aiProblem, ensureOwner } from "./brain-ai";
import { runDaily } from "./daily";
import { compileWiki } from "./wiki";
export async function cron(req: NextRequest, kind: "daily" | "wiki") {
  const secret = process.env.CRON_SECRET;
  const actual = Buffer.from(req.headers.get("authorization") || "");
  const expected = Buffer.from("Bearer " + (secret || ""));
  if (
    !secret ||
    actual.length !== expected.length ||
    !timingSafeEqual(actual, expected)
  )
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const db = admin();
    let query = db
      .from("ai_atlas_preferences")
      .select("user_id")
      .eq("daily_enabled", true);
    if (kind === "wiki") query = query.eq("auto_wiki", true);
    const prefs = await query.limit(10);
    checkDb(prefs.error);
    const results = [];
    for (const row of prefs.data || []) {
      const { data } = await db.auth.admin.getUserById(row.user_id);
      try {
        ensureOwner(data.user?.email);
      } catch {
        continue;
      }
      try {
        const result =
          kind === "daily"
            ? await runDaily(row.user_id)
            : await compileWiki(row.user_id);
        results.push({ ok: true, result });
      } catch (e) {
        results.push({ ok: false, error: aiProblem(e) });
      }
      break;
    }
    return NextResponse.json(
      { kind, results },
      { status: results.some((r) => !r.ok) ? 503 : 200 },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
