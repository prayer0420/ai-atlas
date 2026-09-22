/** Outbound-only worker. Start with node --env-file=.env.local --import tsx scripts/local-worker.ts --watch */
import { promises as fs } from "node:fs";
import path from "node:path";
import { admin, checkDb, AppError } from "../lib/server";
import { ensureOwner, aiProblem } from "../lib/brain-ai";
import { providerReady, selectedModel } from "../lib/local-ai";
import { enqueue } from "../lib/automation";
import { runDaily } from "../lib/daily";
import { compileWiki } from "../lib/wiki";
import { analyzeResource } from "../lib/analyze-resource";
import { buildVault, type VaultInput } from "../lib/vault";
import { syncLocalVault } from "../lib/vault-sync";
import { kstDate } from "../lib/feeds";
import { importInbox } from "../lib/inbox";
import { collectAside, type CaptureChannel } from "../lib/aside-capture";
import { syncPersonalSocial } from "../lib/personal-social";
import { executeCardRun } from "../lib/card-pipeline";
import { startCards } from "../lib/card-service";

process.env.AI_PROVIDER = "local";
process.env.LOCAL_AI_RUNTIME = "1";
const db = admin();
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
let ownerId = "",
  busy = false,
  engineReady = false,
  lastSync = 0;
let analysisClaimId: string | null = null;
let taskClaimId: string | null = null;
let current: {
  id: string;
  lease_token: string;
  user_id: string;
  kind: string;
  payload: Record<string, unknown>;
  attempts: number;
} | null = null;
const log = (message: string) =>
  console.log(new Date().toISOString() + " " + message);
async function heartbeat(extra: Record<string, unknown> = {}) {
  if (!ownerId) return;
  checkDb(
    (
      await db.from("ai_atlas_workers").upsert({
        user_id: ownerId,
        model: selectedModel(),
        last_seen: new Date().toISOString(),
        engine_ready: engineReady,
        busy,
        ...extra,
      })
    ).error,
  );
  if (current) {
    const lease = await db
      .from("ai_atlas_queue")
      .update({ lease_until: new Date(Date.now() + 30 * 60_000).toISOString() })
      .eq("id", current.id)
      .eq("lease_token", current.lease_token)
      .eq("status", "running")
      .select("id");
    checkDb(lease.error);
    if (!lease.data?.length) throw new Error("Worker lease lost");
    // Keep the existing domain-level claims alive during CPU inference.
    if (taskClaimId)
      await db
        .from("ai_atlas_tasks")
        .update({ started_at: new Date().toISOString() })
        .eq("id", taskClaimId)
        .eq("user_id", ownerId)
        .eq("status", "running");
    // Never renew a previous attempt before the new attempt owns its claim.
    // Doing so makes every retry fail with ALREADY_RUNNING indefinitely.
    if (current.kind === "analyze" && analysisClaimId)
      await db
        .from("ai_atlas_resources")
        .update({ analysis_started_at: new Date().toISOString() })
        .eq("id", current.payload.resourceId)
        .eq("user_id", ownerId)
        .eq("analysis_job_id", analysisClaimId)
        .eq("status", "analyzing");
  }
}
async function sync() {
  const directory = process.env.ATLAS_VAULT_PATH;
  if (!directory) return;
  const read = async (table: string, active = false) => {
    const rows = [];
    for (let offset = 0; ; offset += 200) {
      let q = db
        .from(table)
        .select("*")
        .eq("user_id", ownerId)
        .order("id")
        .range(offset, offset + 199);
      if (active) q = q.is("deleted_at", null);
      const r = await q;
      checkDb(r.error);
      rows.push(...(r.data || []));
      if ((r.data?.length || 0) < 200) break;
    }
    return rows;
  };
  const [resources, pages, issues, items, tasks] = await Promise.all([
    read("ai_atlas_resources", true),
    read("ai_atlas_wiki_pages"),
    read("ai_atlas_issues"),
    read("ai_atlas_feed_items"),
    read("ai_atlas_tasks"),
  ]);
  const result = await syncLocalVault(
    directory,
    buildVault({ resources, pages, issues, items, tasks } as VaultInput),
  );
  await heartbeat({
    vault_synced_at: new Date().toISOString(),
    vault_conflicts: result.conflicts,
  });
  lastSync = Date.now();
  log(
    `Obsidian: ${result.written} files saved, ${result.conflicts} user edits preserved`,
  );
}
async function catchUp() {
  const prefs = await db
    .from("ai_atlas_preferences")
    .select("daily_enabled,auto_wiki")
    .eq("user_id", ownerId)
    .maybeSingle();
  checkDb(prefs.error);
  if (!prefs.data?.daily_enabled) return;
  const date = kstDate();
  // One automatic attempt chain per day; failed jobs require the visible retry button.
  const prior = await db
    .from("ai_atlas_queue")
    .select("id")
    .eq("user_id", ownerId)
    .eq("kind", "daily")
    .eq("job_key", date)
    .limit(1);
  checkDb(prior.error);
  if (!prior.data?.length) await enqueue(ownerId, "daily", {}, date);
}
async function tick() {
  const control = await db
    .from("ai_atlas_preferences")
    .select("local_paused,ai_provider")
    .eq("user_id", ownerId)
    .maybeSingle();
  checkDb(control.error);
  process.env.ATLAS_AI_PROVIDER =
    control.data?.ai_provider === "hermes" ? "hermes" : "ollama";
  engineReady = await providerReady();
  await heartbeat();
  if (control.data?.local_paused) return;
  if (process.env.ATLAS_INBOX_PATH) {
    const imported = await importInbox(ownerId, process.env.ATLAS_INBOX_PATH);
    if (imported.imported || imported.errors)
      log(
        `Inbox: ${imported.imported} new sources, ${imported.errors} files need review`,
      );
  }
  if (!engineReady) return;
  await catchUp();
  const next = await db.rpc("ai_atlas_take_job", { p_user_id: ownerId });
  checkDb(next.error);
  current = next.data?.[0] || null;
  analysisClaimId = null;
  taskClaimId = null;
  if (!current) {
    if (Date.now() - lastSync > 15 * 60_000) await sync();
    return;
  }
  busy = true;
  await heartbeat({ last_error: null });
  log("Starting " + current.kind);
  try {
    let result: unknown;
    if (current.kind === "analyze" && current.payload.goal === "cards")
      result = await executeCardRun(current, (id) => {
        analysisClaimId = id;
      });
    else if (current.kind === "analyze")
      result = await analyzeResource(
        ownerId,
        String(current.payload.resourceId),
        current.payload.manual === true,
        (id) => {
          analysisClaimId = id;
        },
      );
    else if (
      current.kind === "daily" &&
      current.payload.action === "manual-collect"
    ) {
      const channel = (
        ["all", "instagram", "threads", "youtube"] as const
      ).includes(current.payload.channel as CaptureChannel)
        ? (current.payload.channel as CaptureChannel)
        : "all";
      const personal =
        channel === "youtube"
          ? null
          : await syncPersonalSocial(channel === "all" ? "all" : channel);
      const youtube =
        channel === "instagram" || channel === "threads"
          ? null
          : await collectAside(undefined, undefined, "youtube", true);
      const imported = process.env.ATLAS_INBOX_PATH
        ? await importInbox(ownerId, process.env.ATLAS_INBOX_PATH, true)
        : { imported: 0, errors: 0 };
      result = {
        mode: "manual",
        channel,
        saved: (personal?.saved || 0) + (youtube?.saved || 0),
        imported: imported.imported,
        import_errors: imported.errors,
        scanned: personal?.scanned || 0,
        excluded: personal?.excluded || 0,
        unchanged: personal?.unchanged || 0,
        items: [
          ...(personal?.items || []),
          ...(youtube && "items" in youtube ? youtube.items : []),
        ],
        failures: [
          ...(personal && ["failed", "locked"].includes(personal.status)
            ? [
                {
                  platform: "personal-social",
                  stage:
                    personal.status === "locked"
                      ? "collection_locked"
                      : "collection_failed",
                },
              ]
            : []),
          ...(youtube?.failures || []),
        ],
        checked_at: new Date().toISOString(),
      };
    } else if (current.kind === "daily") {
      const daily = await runDaily(ownerId, (id) => {
        taskClaimId = id;
      });
      if (daily.issue?.mode !== "ai")
        throw new AppError(
          daily.issue?.warning || "카드뉴스 AI 정리를 완료하지 못했습니다.",
          502,
        );
      result = { issue_id: daily.issue.id };
    } else
      result = await compileWiki(
        ownerId,
        typeof current.payload.question === "string"
          ? current.payload.question
          : undefined,
        typeof current.payload.sourceId === "string"
          ? current.payload.sourceId
          : undefined,
        (id) => {
          taskClaimId = id;
        },
      );
    checkDb(
      (
        await db
          .from("ai_atlas_queue")
          .update({
            status: "completed",
            finished_at: new Date().toISOString(),
            result:
              current.kind === "analyze"
                ? {
                    resourceId: current.payload.resourceId,
                    ...(current.payload.goal === "cards"
                      ? (result as Record<string, unknown>)
                      : {}),
                  }
                : result,
            error: null,
          })
          .eq("id", current.id)
          .eq("lease_token", current.lease_token)
      ).error,
    );
    log("Completed " + current.kind);
    if (current.kind === "analyze" && current.payload.goal !== "cards")
      await startCards(ownerId, String(current.payload.resourceId));
    if (
      current.kind === "wiki" &&
      result &&
      typeof result === "object" &&
      "remaining" in result &&
      Number(result.remaining) > 0 &&
      "written" in result &&
      Number(result.written) > 0
    )
      await enqueue(ownerId, "wiki");
    if (
      (current.kind === "daily" &&
        current.payload.action !== "manual-collect") ||
      (current.kind === "analyze" &&
        (current.payload.goal !== "cards" ||
          (result as { state?: string })?.state === "completed"))
    ) {
      const prefs = await db
        .from("ai_atlas_preferences")
        .select("auto_wiki")
        .eq("user_id", ownerId)
        .maybeSingle();
      if (prefs.data?.auto_wiki) await enqueue(ownerId, "wiki");
    }
    current = null;
    analysisClaimId = null;
    taskClaimId = null;
    busy = false;
    await sync();
  } catch (e) {
    const message = aiProblem(e);
    if (current) {
      const retry =
        current.attempts < 3 && (!(e instanceof AppError) || e.status !== 422);
      checkDb(
        (
          await db
            .from("ai_atlas_queue")
            .update({
              status: retry ? "queued" : "failed",
              error: message,
              available_at: new Date(Date.now() + 5 * 60_000).toISOString(),
              finished_at: retry ? null : new Date().toISOString(),
            })
            .eq("id", current.id)
            .eq("lease_token", current.lease_token)
        ).error,
      );
    }
    current = null;
    analysisClaimId = null;
    taskClaimId = null;
    busy = false;
    await heartbeat({ last_error: message });
    log(message);
  }
}
async function main() {
  const lockPath = path.resolve(".local/worker.lock");
  await fs.mkdir(path.dirname(lockPath), { recursive: true });
  try {
    const lock = JSON.parse(await fs.readFile(lockPath, "utf8"));
    try {
      process.kill(lock.pid, 0);
      log("Another AI Atlas worker is already running.");
      return;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ESRCH") throw e;
    }
    await fs.unlink(lockPath);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  }
  await fs.writeFile(lockPath, JSON.stringify({ pid: process.pid }), {
    flag: "wx",
  });
  const users = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (users.error) throw new Error("Owner lookup failed");
  const owner = users.data.users.find((u) => {
    try {
      ensureOwner(u.email);
      return true;
    } catch {
      return false;
    }
  });
  if (!owner) throw new Error("Allowed owner not found");
  ownerId = owner.id;
  const timer = setInterval(() => {
    void heartbeat().catch(() => log("Heartbeat temporarily unavailable"));
  }, 30000);
  timer.unref();
  do {
    try {
      await tick();
    } catch (e) {
      log(
        e instanceof AppError
          ? e.message
          : "연결을 확인하지 못했습니다. 다음 주기에 재시도합니다.",
      );
    }
    if (!process.argv.includes("--watch")) break;
    await pause(5000);
  } while (true);
  await fs.unlink(lockPath);
}
main().catch(() => {
  log("Worker could not start. Check the private environment configuration.");
  process.exitCode = 1;
});
