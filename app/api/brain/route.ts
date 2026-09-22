import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  admin,
  authenticate,
  body,
  checkDb,
  errorResponse,
  uuid,
  AppError,
} from "@/lib/server";
import { ensureOwner } from "@/lib/brain-ai";
import { archiveFeed, preferences, runDaily } from "@/lib/daily";
import { startCards } from "@/lib/card-service";
import { feedSources } from "@/lib/feeds";
import { compileWiki, wikiLint } from "@/lib/wiki";
import type { WikiPage } from "@/lib/brain-types";
export const maxDuration = 300;
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  try {
    const { db, user } = await authenticate(req);
    ensureOwner(user.email);
    const kind = req.nextUrl.searchParams.get("view");
    if (kind === "wiki") {
      const [p, r, t] = await Promise.all([
        db
          .from("ai_atlas_wiki_pages")
          .select("*")
          .order("updated_at", { ascending: false })
          .limit(500),
        db
          .from("ai_atlas_resources")
          .select("id,title,source_url,updated_at")
          .is("deleted_at", null)
          .limit(2000),
        db
          .from("ai_atlas_tasks")
          .select("id,kind,status,error,created_at,finished_at")
          .in("kind", ["wiki", "question"])
          .order("created_at", { ascending: false })
          .limit(15),
      ]);
      [p.error, r.error, t.error].forEach(checkDb);
      return NextResponse.json(
        {
          pages: p.data,
          resources: r.data,
          tasks: t.data,
          lint: wikiLint(p.data as WikiPage[], r.data || []),
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    if (kind === "history") {
      const id = uuid.parse(req.nextUrl.searchParams.get("id"));
      const r = await db
        .from("ai_atlas_wiki_revisions")
        .select("revision,snapshot,created_at")
        .eq("page_id", id)
        .order("revision", { ascending: false })
        .limit(20);
      checkDb(r.error);
      return NextResponse.json({ revisions: r.data });
    }
    const [issues, items, prefs, tasks] = await Promise.all([
      db
        .from("ai_atlas_issues")
        .select("*")
        .order("issue_date", { ascending: false })
        .limit(30),
      db
        .from("ai_atlas_feed_items")
        .select("*")
        .order("score", { ascending: false })
        .limit(150),
      preferences(user.id),
      db
        .from("ai_atlas_tasks")
        .select("id,kind,status,error,created_at")
        .eq("kind", "daily")
        .order("created_at", { ascending: false })
        .limit(10),
    ]);
    [issues.error, items.error, tasks.error].forEach(checkDb);
    const missingIds = [
      ...new Set(
        (issues.data || []).flatMap((i) =>
          (i.content.stories as { feed_id: string }[]).map((s) => s.feed_id),
        ),
      ),
    ].filter((id) => !items.data?.some((i) => i.id === id));
    if (missingIds.length) {
      const historic = await db
        .from("ai_atlas_feed_items")
        .select("*")
        .in("id", missingIds);
      checkDb(historic.error);
      items.data?.push(...(historic.data || []));
    }
    return NextResponse.json(
      {
        issues: issues.data,
        items: items.data,
        preferences: prefs,
        sources: feedSources,
        tasks: tasks.data,
        schedule: "매일 오전 9시대 수집 · 오전 11시대 위키 정리 (한국 시간)",
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
export async function POST(req: NextRequest) {
  try {
    const { user } = await authenticate(req);
    ensureOwner(user.email);
    const input = await body(req);
    const action = z
      .enum([
        "collect",
        "preferences",
        "archive",
        "cards",
        "review",
        "compile",
        "ask",
        "protect",
      ])
      .parse(input.action);
    const db = admin();
    if (action === "collect") return NextResponse.json(await runDaily(user.id));
    if (action === "compile" || action === "ask") {
      const question =
        action === "ask"
          ? z.string().trim().min(3).max(1500).parse(input.question)
          : undefined;
      const sourceId =
        action === "compile"
          ? uuid.optional().parse(input.sourceId)
          : undefined;
      return NextResponse.json(await compileWiki(user.id, question, sourceId));
    }
    if (action === "preferences") {
      const values = z
        .object({
          daily_enabled: z.boolean(),
          source_ids: z
            .array(
              z.enum(feedSources.map((s) => s.id) as [string, ...string[]]),
            )
            .min(1)
            .max(6),
          topics: z.array(z.string().trim().min(1).max(40)).max(10),
          story_count: z.number().int().min(1).max(5),
          auto_wiki: z.boolean(),
        })
        .parse(input.preferences);
      checkDb(
        (
          await db.from("ai_atlas_preferences").upsert({
            user_id: user.id,
            ...values,
            updated_at: new Date().toISOString(),
          })
        ).error,
      );
      return NextResponse.json({ ok: true });
    }
    const id = uuid.parse(input.id);
    if (action === "cards") {
      const resource_id = await archiveFeed(user.id, id);
      const run = await startCards(user.id, resource_id);
      return NextResponse.json(
        { resource_id, run, queued: run.state !== "completed" },
        { status: 202 },
      );
    }
    if (action === "archive")
      return NextResponse.json({ resource_id: await archiveFeed(user.id, id) });
    if (action === "review") {
      const values = z
        .object({
          learned: z.boolean().optional(),
          favorite: z.boolean().optional(),
        })
        .parse(input);
      const r = await db
        .from("ai_atlas_feed_items")
        .update(values)
        .eq("user_id", user.id)
        .eq("id", id)
        .select("id")
        .maybeSingle();
      checkDb(r.error);
      if (!r.data) throw new AppError("자료를 찾을 수 없습니다.", 404);
      return NextResponse.json({ ok: true });
    }
    const protectedValue = z.boolean().parse(input.protected);
    const r = await db
      .from("ai_atlas_wiki_pages")
      .update({ protected: protectedValue })
      .eq("user_id", user.id)
      .eq("id", id)
      .select("id")
      .maybeSingle();
    checkDb(r.error);
    if (!r.data) throw new AppError("위키 문서를 찾을 수 없습니다.", 404);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
