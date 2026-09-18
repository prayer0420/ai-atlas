import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { captureSchema } from "./inbox";
const exec = promisify(execFile);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const asideBrowser = process.env.ASIDE_BROWSER_PATH || "C:\\Program Files\\Aside\\Application\\Aside.exe";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function runAside(executable: string, args: string[]) {
  try {
    return await exec(executable, args, { timeout: 130_000, maxBuffer: 2_000_000, windowsHide: true });
  } catch {
    const browser = spawn(asideBrowser, [], { detached: true, stdio: "ignore", windowsHide: true });
    browser.unref();
    let lastError: unknown;
    for (let attempt = 0; attempt < 6; attempt++) {
      await wait(3_000);
      try {
        return await exec(executable, args, { timeout: 130_000, maxBuffer: 2_000_000, windowsHide: true });
      } catch (error) { lastError = error; }
    }
    throw lastError;
  }
}

/** Uses Aside's documented YouTube REPL skill, without calling a paid LLM. */
export async function collectAside(videoId?: string) {
  if (videoId && !/^[\w-]{11}$/.test(videoId)) throw new Error("Invalid YouTube ID");
  const directory = process.env.ATLAS_INBOX_PATH;
  if (!directory) throw new Error("ATLAS_INBOX_PATH is required");
  const runtime = JSON.parse(await fs.readFile(path.join(projectRoot, ".local/hermes-runtime.json"), "utf8"));
  if (typeof runtime.aside !== "string") throw new Error("Aside CLI not configured");
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
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
for (const meta of candidates.slice(0,reference ? 1 : 10)) {
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
  if (!result.items?.length) return { saved: 0, found: result.found, failures: result.failures, reason: "기간 내 본문을 읽을 수 있는 영상 없음" };
  const bundle = captureSchema.parse({ items: result.items });
  await fs.mkdir(directory, { recursive: true });
  const name = `aside-${videoId || date}-${Date.now()}.json`;
  const temp = path.join(directory, name + ".tmp");
  await fs.writeFile(temp, JSON.stringify(bundle, null, 2), { flag: "wx" });
  await fs.rename(temp, path.join(directory, name));
  return { saved: bundle.items.length, file: name, items: bundle.items.map((i) => ({ title: i.title, url: i.url, metrics: i.metrics })), failures: result.failures };
}
