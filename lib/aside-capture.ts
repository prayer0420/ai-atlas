import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { providerEnvironment } from "./provider-env";
import { captureSchema } from "./inbox";
import { parseSocialPage, socialBrowserCode, socialUrl, type SocialPage, type SocialPlatform } from "./social-capture";
const exec = promisify(execFile);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const asideBrowser = process.env.ASIDE_BROWSER_PATH || "C:\\Program Files\\Aside\\Application\\Aside.exe";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function runAside(executable: string, args: string[]) {
  try {
    return await exec(executable, args, { timeout: 130_000, maxBuffer: 2_000_000, windowsHide: true, env: providerEnvironment(process.env) });
  } catch (initialError) {
    // A timeout or script failure is not a reason to repeat collection six times.
    if (!/Aside isn.t running|daemon auth challenge|ECONNREFUSED/i.test(String((initialError as { stderr?: string }).stderr || initialError))) throw initialError;
    const browser = spawn(asideBrowser, [], { detached: true, stdio: "ignore", windowsHide: true, env: providerEnvironment(process.env) });
    browser.unref();
    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      await wait(3_000);
      try {
        return await exec(executable, args, { timeout: 130_000, maxBuffer: 2_000_000, windowsHide: true, env: providerEnvironment(process.env) });
      } catch (error) { lastError = error; }
    }
    throw lastError;
  }
}

/** Uses Aside's documented YouTube REPL skill, without calling a paid LLM. */
async function gatherYoutube(videoId?: string, limit = 4) {
  if (videoId && !/^[\w-]{11}$/.test(videoId)) throw new Error("Invalid YouTube ID");
  const directory = process.env.ATLAS_INBOX_PATH;
  if (!directory) throw new Error("ATLAS_INBOX_PATH is required");
  const runtime = JSON.parse(await fs.readFile(path.join(projectRoot, ".local/hermes-runtime.json"), "utf8"));
  if (typeof runtime.aside !== "string") throw new Error("Aside CLI not configured");
  const code = `
const reference = ${JSON.stringify(videoId || null)};
const observed = new Date().toISOString();
const month = new Date().toLocaleDateString('ko-KR',{year:'numeric',month:'long'});
const found = reference ? [{videoId:reference}] : await youtube.search('AI 활용 자동화 팁 '+month,{limit:20,lang:'ko',region:'KR'});
const candidates = [];
const failures = [];
for (const row of found) {
  try {
    const meta = await youtube.getMetadata(row.videoId);
    const age = Date.now()-Date.parse(meta.publishDate || '');
    if (!reference && (!Number.isFinite(age) || age < 0 || age > 21*86400000)) continue;
    candidates.push(meta);
  } catch { failures.push({videoId:row.videoId,stage:'metadata'}); }
}
candidates.sort((a,b)=>(b.viewCount||0)-(a.viewCount||0));
const items = [];
for (const meta of candidates.slice(0,reference ? 1 : ${limit})) {
  let transcript = '';
  try { transcript = await youtube.getTranscript(meta.videoId); }
  catch { failures.push({videoId:meta.videoId,stage:'transcript'}); }
  const evidence = transcript || meta.description || '';
  if (!evidence.trim()) continue;
  items.push({title:meta.title.slice(0,120),url:'https://www.youtube.com/watch?v='+meta.videoId,
    text:('수집 도구: Aside YouTube 스킬\\n수집 범위: '+(transcript?'자동/제공 자막':'영상 설명글만; 음성/장면 미분석')+'\\n게시일: '+(meta.publishDate||'미확인')+'\\n관측일: '+observed+'\\n'+(reference?'사용자 관심 주제의 참고 자료. 최신 뉴스 순위가 아님.':'최근 21일 검색 후보 중 관측 조회수 순. 전체 플랫폼 인기 순위가 아님.')+'\\n\\n'+evidence).slice(0,60000),
    observed_at:observed,metrics:typeof meta.viewCount==='number'?{views:meta.viewCount}:{}});
}
console.log('ATLAS_CAPTURE_RESULT='+JSON.stringify({items,failures,found:found.length}));`;
  const output = await runAside(runtime.aside, ["repl", "--account", "u0", "--host", "local", code]);
  const resultLine = output.stdout.split(/\r?\n/).find((line) => line.startsWith("ATLAS_CAPTURE_RESULT="));
  if (!resultLine) throw new Error("Aside 결과를 확인하지 못했습니다. 앱의 로그인·실행 상태를 확인하세요.");
  const result = JSON.parse(resultLine.slice("ATLAS_CAPTURE_RESULT=".length));
  return result as { items: CaptureItem[]; failures: unknown[] };
}

type CaptureItem = { title: string; url: string; text: string; observed_at?: string; metrics?: { views?: number; likes?: number; comments?: number } };
type CaptureState = { date: string; count: number; urls: string[] };
export type CaptureChannel = "all" | "instagram" | "threads" | "youtube";
export function capturePlan(channel: CaptureChannel, budget: number) {
  const safe = Math.max(0, Math.min(10, Math.trunc(budget)));
  return {
    social: channel === "all" ? (["instagram", "threads"] as SocialPlatform[]) : channel === "instagram" || channel === "threads" ? [channel] : [],
    socialLimit: Math.min(3, safe),
    youtubeLimit: channel === "all" || channel === "youtube" ? Math.min(4, safe) : 0,
  };
}

/** Reuses Aside u0 browser login. No password, cookies or tokens leave the browser. */
export async function inspectSocial(platform: SocialPlatform, limit = 3, url?: string) {
  const runtime = JSON.parse(await fs.readFile(path.join(projectRoot, ".local/hermes-runtime.json"), "utf8"));
  const output = await runAside(runtime.aside, ["repl", "--account", "u0", "--host", "local", socialBrowserCode(platform, limit, url)]);
  const line = output.stdout.split(/\r?\n/).find((value) => value.startsWith("ATLAS_SOCIAL_RESULT="));
  if (!line) throw Error("소셜 페이지 결과를 읽지 못했습니다. Aside 로그인과 연결을 확인하세요.");
  const result = JSON.parse(line.slice("ATLAS_SOCIAL_RESULT=".length)) as { pages: SocialPage[]; failures: unknown[] };
  const items: CaptureItem[] = [];
  for (const page of result.pages) {
    try {
      const parsed = parseSocialPage(page);
      if (parsed.item) items.push(parsed.item);
      else result.failures.push({ platform, url: parsed.url, stage: parsed.status });
    } catch { result.failures.push({ platform, stage: "unsupported_page" }); }
  }
  return { items, failures: result.failures };
}

/** One lock and one daily budget shared by all three Aside collection channels. */
export async function collectAside(
  videoId?: string,
  socialPostUrl?: string,
  channel: CaptureChannel = "all",
  manual = false,
) {
  if (videoId && socialPostUrl) throw Error("영상 ID 또는 소셜 게시물 주소 중 하나만 지정하세요.");
  if (videoId && !/^[\w-]{11}$/.test(videoId)) throw Error("Invalid YouTube ID");
  const direct = socialPostUrl ? socialUrl(socialPostUrl) : null;
  if (direct && channel !== "all" && channel !== direct.platform) throw Error("요청 플랫폼과 게시물 주소가 다릅니다.");
  if (videoId && channel !== "all" && channel !== "youtube") throw Error("YouTube 영상과 요청 플랫폼이 다릅니다.");
  const directory = process.env.ATLAS_INBOX_PATH;
  if (!directory) throw Error("ATLAS_INBOX_PATH is required");
  await fs.mkdir(directory, { recursive: true });
  const lockPath = path.join(directory, ".aside-collection.lock");
  let lock;
  try { lock = await fs.open(lockPath, "wx"); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "EEXIST") return { saved: 0, failures: [{ stage: "collection_locked" }], reason: "다른 수집이 실행 중이거나 이전 실행의 잠금 확인이 필요합니다." }; throw error; }
  try {
    const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
    const statePath = path.join(directory, ".aside-state.json");
    let state: CaptureState = { date, count: 0, urls: [] };
    try { state = JSON.parse(await fs.readFile(statePath, "utf8")); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw Error("수집 기록을 읽지 못해 중복 수집을 중단했습니다."); }
    if (state.date !== date) state = { date, count: 0, urls: state.urls };
    // Reconcile current-day captures, including captures made before this upgrade.
    const seen = new Set(state.urls);
    const today = new Set<string>();
    for (const folder of [directory, path.join(directory, "processed")]) {
      const entries = await fs.readdir(folder).catch((error: NodeJS.ErrnoException) => { if (error.code === "ENOENT") return []; throw error; });
      for (const name of entries.filter((name) => /^aside-.*\.json$/.test(name))) {
        const file = path.join(folder, name);
        if ((await fs.stat(file)).size > 1_000_000) continue;
        const bundle = captureSchema.parse(JSON.parse(await fs.readFile(file, "utf8")));
        for (const item of bundle.items) {
          seen.add(item.url);
          if (item.observed_at && Number.isFinite(Date.parse(item.observed_at)) && new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date(item.observed_at)) === date) today.add(item.url);
        }
      }
    }
    state.count = Math.max(state.count, today.size);
    const remaining = manual ? 10 : Math.max(0, 10 - state.count);
    if (!remaining) return { saved: 0, remaining: 0, failures: [], reason: "오늘 Aside 자동 수집 한도 10건에 도달했습니다." };
    const gathered: CaptureItem[] = [];
    const failures: unknown[] = [];
    const plan = capturePlan(direct ? direct.platform : videoId ? "youtube" : channel, remaining);
    if (!videoId && plan.social.length) {
      const platforms: SocialPlatform[] = direct ? [direct.platform] : plan.social;
      for (const platform of platforms) {
        const slots = Math.min(direct ? 1 : 3, remaining - gathered.length);
        if (slots <= 0) break;
        try {
          const result = await inspectSocial(platform, slots, direct?.url);
          failures.push(...result.failures);
          for (const item of result.items) if (!seen.has(item.url)) { seen.add(item.url); gathered.push(item); }
        } catch { failures.push({ platform, stage: "browser_unavailable" }); }
      }
    }
    if (!direct && plan.youtubeLimit && gathered.length < remaining) {
      try {
        const result = await gatherYoutube(videoId, Math.min(videoId ? 1 : plan.youtubeLimit, remaining - gathered.length));
        failures.push(...result.failures);
        for (const item of result.items) if (!seen.has(item.url)) { seen.add(item.url); gathered.push(item); }
      } catch { failures.push({ platform: "youtube", stage: "collection_failed" }); }
    }
    const saved = gathered.slice(0, remaining);
    if (saved.length) {
      const bundle = captureSchema.parse({ items: saved });
      const name = `${manual ? "manual-" : ""}aside-${date}-${Date.now()}.json`;
      const temp = path.join(directory, name + ".tmp");
      await fs.writeFile(temp, JSON.stringify(bundle, null, 2), { flag: "wx" });
      await fs.rename(temp, path.join(directory, name));
      if (!manual) state.count += bundle.items.length;
    }
    state.urls = [...seen].slice(-5000);
    await fs.writeFile(statePath + ".tmp", JSON.stringify(state));
    await fs.rename(statePath + ".tmp", statePath);
    const result = { mode: manual ? "manual" : "automatic", channel, saved: saved.length, remaining: manual ? null : Math.max(0, 10 - state.count), items: saved.map(({ title, url, metrics }) => ({ title, url, metrics })), failures, checked_at: new Date().toISOString() };
    await fs.writeFile(path.join(projectRoot, ".local/social-capture-status.json"), JSON.stringify(result, null, 2));
    return result;
  } finally { await lock.close(); await fs.unlink(lockPath); }
}
