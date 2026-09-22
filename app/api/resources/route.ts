import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { z } from "zod";
import {
  authenticate,
  body,
  checkDb,
  errorResponse,
  AppError,
  ensureAIAllowed,
} from "@/lib/server";
import { queueLocally } from "@/lib/automation";
import { withProgress } from "@/lib/resource-progress";
import { STALE_ANALYSIS_MS } from "@/lib/learning-progress";
import type { Resource } from "@/lib/types";
import { sourceType, validateUrl } from "@/lib/extract";
import { readableValue } from "@/lib/content-text";
import { startCards } from "@/lib/card-service";
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  try {
    const { db, user } = await authenticate(req);
    const p = req.nextUrl.searchParams;
    const page = Math.max(0, Math.min(10000, Number(p.get("page")) || 0));
    let q = db
      .from("ai_atlas_resources")
      .select(
        "id,title,source_url,source_type,category,tags,status,card_state,content_hash,favorite,learned,created_at,updated_at,analysis_started_at,deleted_at,error_message,summary:lesson->>summary,visual:lesson->diagram",
        { count: "exact" },
      )
      .eq("user_id", user.id);
    const view = p.get("view");
    q =
      view === "trash"
        ? q.not("deleted_at", "is", null)
        : q.is("deleted_at", null);
    if (view === "favorites") q = q.eq("favorite", true);
    if (view === "learned") q = q.eq("learned", true);
    if (view === "inbox")
      q = q.or("card_state.is.null,card_state.neq.completed");
    const state = p.get("state");
    const cutoff = new Date(Date.now() - STALE_ANALYSIS_MS).toISOString();
    if (state === "ready") q = q.eq("card_state", "completed");
    if (state === "pending")
      q = q.or(
        `card_state.in.(queued,running,recovering),and(card_state.is.null,status.in.(saved,ready)),and(card_state.is.null,status.eq.analyzing,analysis_started_at.gte.${cutoff})`,
      );
    if (state === "attention")
      q = q.or(
        `card_state.in.(waiting_input,failed),and(card_state.is.null,status.in.(failed,needs_content)),and(card_state.is.null,status.eq.analyzing,analysis_started_at.lt.${cutoff})`,
      );
    const category = p.get("category");
    if (category && category !== "전체") q = q.eq("category", category);
    const source = p.get("source");
    if (source && source !== "all") q = q.eq("source_type", source);
    const search = (p.get("q") || "")
      .replace(/[%_,()."\\]/g, " ")
      .trim()
      .slice(0, 150);
    if (/^(rag|llm|mcp)$/i.test(search))
      // Keep Korean suffixes (RAG는) while excluding fragments such as paragraph.
      q = q.filter(
        "search_text",
        "imatch",
        `(^|[^a-z0-9])${search}([^a-z0-9]|$)`,
      );
    else if (search) q = q.ilike("search_text", `%${search}%`);
    const sort = p.get("sort");
    q = q
      .order(sort === "title" ? "title" : "created_at", {
        ascending: sort === "title" || sort === "old",
      })
      .order("id")
      .range(page * 24, page * 24 + 23);
    const { data, error, count } = await q;
    checkDb(error);
    return NextResponse.json(
      {
        resources: readableValue(
          await withProgress(
            db,
            user.id,
            (data || []) as unknown as Resource[],
          ),
        ),
        total: count,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
const input = z.object({
  title: z.string().trim().max(120).default(""),
  url: z.string().trim().max(2048).default(""),
  text: z.string().trim().max(60000).default(""),
  analyze: z.boolean().default(true),
});
export async function POST(req: NextRequest) {
  try {
    const { db, user } = await authenticate(req);
    const data = input.parse(await body(req));
    if (!data.url && data.text.length < 30)
      throw new AppError(
        "본문을 30자 이상 입력하거나 원문 링크를 추가해 주세요.",
      );
    const url = data.url ? validateUrl(data.url).href : null;
    const fingerprint = createHash("sha256")
      .update(url || data.text.replace(/\s+/g, " "))
      .digest("hex");
    const { data: existing, error: existingError } = await db
      .from("ai_atlas_resources")
      .select("*")
      .eq("user_id", user.id)
      .eq("fingerprint", fingerprint)
      .is("deleted_at", null)
      .maybeSingle();
    checkDb(existingError);
    if (existing) {
      const [resource] = await withProgress(db, user.id, [existing]);
      return NextResponse.json({ resource, duplicate: true });
    }
    const { data: resource, error } = await db
      .from("ai_atlas_resources")
      .insert({
        user_id: user.id,
        title:
          data.title ||
          data.text.split("\n")[0].slice(0, 80) ||
          (url ? new URL(url).hostname : "새 자료"),
        source_url: url,
        source_type: sourceType(url || ""),
        raw_text: data.text,
        fingerprint,
        source_method: data.text ? "pasted" : null,
      })
      .select("*")
      .single();
    if (error?.code === "23505")
      throw new AppError(
        "이미 저장 중인 자료입니다. 잠시 후 자료함을 확인해 주세요.",
        409,
      );
    checkDb(error);
    // Persist first; a queue error must never lose the source or imply success.
    // Scheduling here removes the browser-close gap between save and analysis.
    if (data.analyze && queueLocally()) {
      try {
        ensureAIAllowed(user.email);
        const run = await startCards(user.id, resource.id);
        const queued = {
          queued: true,
          job_id: run.queue_id,
          message: "원문 분석부터 카드뉴스 이미지 완성까지 이어서 처리합니다.",
        };
        return NextResponse.json(
          {
            resource: {
              ...resource,
              progress: {
                phase: "queued",
                label: "제작 대기",
                message: queued.message,
                action: null,
              },
            },
            ...queued,
          },
          { status: 201 },
        );
      } catch {
        return NextResponse.json(
          {
            resource,
            queueError:
              "자료는 저장했지만 정리를 예약하지 못했습니다. 자료 화면의 ‘정리 시작’을 눌러 다시 시도해 주세요.",
          },
          { status: 201 },
        );
      }
    }
    return NextResponse.json({ resource }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
