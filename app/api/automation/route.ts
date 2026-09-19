import { NextRequest, NextResponse } from "next/server";
import {
  admin,
  authenticate,
  body,
  checkDb,
  errorResponse,
  AppError,
  uuid,
} from "@/lib/server";
import { ensureOwner } from "@/lib/brain-ai";
import { enqueue, localMode } from "@/lib/automation";
import { z } from "zod";
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  try {
    const { db, user } = await authenticate(req);
    ensureOwner(user.email);
    const [worker, jobs, pending, preferences] = await Promise.all([
      db
        .from("ai_atlas_workers")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle(),
      db
        .from("ai_atlas_queue")
        .select("id,kind,status,attempts,error,created_at,finished_at,payload,result")
        .order("created_at", { ascending: false })
        .limit(12),
      db
        .from("ai_atlas_queue")
        .select("id", { count: "exact", head: true })
        .in("status", ["queued", "running"]),
      db
        .from("ai_atlas_preferences")
        .select("local_paused,ai_provider")
        .eq("user_id", user.id)
        .maybeSingle(),
    ]);
    [worker.error, jobs.error, pending.error, preferences.error].forEach(
      checkDb,
    );
    return NextResponse.json(
      {
        mode: localMode() ? "local" : "cloud",
        provider: preferences.data?.ai_provider || "ollama",
        paused: preferences.data?.local_paused || false,
        worker: worker.data,
        online: Boolean(
          worker.data?.engine_ready &&
            Date.parse(worker.data.last_seen) > Date.now() - 120000,
        ),
        jobs: jobs.data,
        pending: pending.count || 0,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
export async function POST(req: NextRequest) {
  try {
    const { db, user } = await authenticate(req);
    ensureOwner(user.email);
    const input = await body(req);
    const provider = z.enum(["ollama", "hermes"]).safeParse(input.provider);
    if (provider.success) {
      checkDb(
        (
          await admin()
            .from("ai_atlas_preferences")
            .upsert({ user_id: user.id, ai_provider: provider.data })
        ).error,
      );
      return NextResponse.json({ ok: true, provider: provider.data });
    }
    if (typeof input.paused === "boolean") {
      checkDb(
        (
          await admin()
            .from("ai_atlas_preferences")
            .upsert({ user_id: user.id, local_paused: input.paused })
        ).error,
      );
      return NextResponse.json({ ok: true });
    }
    const collect = z.enum(["all", "instagram", "threads", "youtube"]).safeParse(input.collect);
    if (collect.success) {
      const result = await enqueue(
        user.id,
        "daily",
        { action: "manual-collect", channel: collect.data },
        `manual:${collect.data}`,
      );
      return NextResponse.json(result, { status: 202 });
    }
    const id = uuid.parse(input.id);
    const job = await db
      .from("ai_atlas_queue")
      .select("*")
      .eq("id", id)
      .eq("status", "failed")
      .maybeSingle();
    checkDb(job.error);
    if (!job.data) throw new AppError("다시 시도할 작업이 없습니다.", 404);
    const result = await enqueue(
      user.id,
      job.data.kind,
      job.data.payload,
      job.data.job_key,
    );
    return NextResponse.json(result, { status: 202 });
  } catch (e) {
    return errorResponse(e);
  }
}
