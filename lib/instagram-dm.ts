import { promises as fs } from "node:fs";
import { createHash } from "node:crypto";
import { AsideSession } from "./aside-session";
import { socialUrl } from "./social-capture";

const hash = (text: string) => createHash("sha256").update(text).digest("hex");
type Checkpoint = { latest: string; links: string[]; recent?: string[] };
type DmState = { version: 1; enabled_at: string; initialized: boolean; chats: Record<string, Checkpoint> };
export function messageFingerprint(block: string) {
  return hash(block.replace(/\s*\[ref=[^\]]+\]/g, "").replace(/\s*\[focused\]/g, ""));
}
export function newMessageIndexes(signatures: string[], latest?: string, previousWindow?: string[]) {
  if (!latest) return { indexes: [] as number[], baseline: true, anchorFound: true };
  if (previousWindow?.length && previousWindow.every((value, i) => value === signatures[i]))
    return { indexes: signatures.map((_, i) => i).filter((i) => i >= previousWindow.length), baseline: false, anchorFound: true };
  const index = signatures.lastIndexOf(latest);
  return { indexes: signatures.map((_, i) => i).filter((i) => i > index), baseline: false, anchorFound: index >= 0 };
}
const helpers = `
globalThis.atlasDmBlock=(tree,pattern)=>{const lines=tree.split('\\n');const start=lines.findIndex(line=>pattern.test(line));if(start<0)return '';const indent=lines[start].search(/\\S/);let end=start+1;while(end<lines.length&&lines[end].search(/\\S/)>indent)end++;return lines.slice(start,end).join('\\n');};
globalThis.atlasDmGroups=(tree)=>{const scope=atlasDmBlock(tree,/- generic .*\\[scrollable\\]/);const lines=scope.split('\\n'),groups=[];for(let i=1;i<lines.length;i++){if(!/- group:/.test(lines[i]))continue;const indent=lines[i].search(/\\S/);let end=i+1;while(end<lines.length&&lines[end].search(/\\S/)>indent)end++;const block=lines.slice(i,end).join('\\n');if(/- article /.test(block))groups.push(block);i=end-1;}return groups;};
globalThis.atlasDmSeen=new Set();return true;`;

/** Only hashes and public post URLs are checkpointed. Never stores conversation text. */
export async function* scanInstagramDm(session: AsideSession, file: string, owner: string) {
  let state: DmState = { version: 1, enabled_at: new Date().toISOString(), initialized: false, chats: {} };
  try { state = JSON.parse(await fs.readFile(file, "utf8")); } catch (e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e; }
  if (state.version !== 1 || !state.chats) throw Error("Invalid DM checkpoint");
  await session.run(helpers);
  let stable = 0, count = 0, partial = false;
  while (true) {
    const next = await session.run<{ selected?: boolean; key?: string; blocked?: string; loading?: boolean }>(`
      const s=await snapshot(atlasPersonalPage);const nav=atlasDmBlock(s.tree,/- navigation "(?:대화 리스트|Chats)"/);
      if(!nav)return {blocked:/비밀번호|Password/.test(s.tree)?'login_required':'dm_list_unreadable'};
      if(!nav.includes(${JSON.stringify(JSON.stringify(owner))})&&!/읽어들이는 중|Loading/.test(nav))return {blocked:'dm_account_mismatch'};
      const rows=[...nav.matchAll(/- button \\[ref=([^\\]]+)\\]:\\n\\s+- image "user-profile-picture"\\n\\s+- text: "([^\\n]*)"/g)];
      for(const row of rows){const name=row[2].replace(/^활동 중 /,'').split('님')[0];if(atlasDmSeen.has(name))continue;atlasDmSeen.add(name);await atlasPersonalPage.locator(row[1]).click();const current=await snapshot(atlasPersonalPage);return {selected:true,key:name};}
      if(rows.length){const last=rows.at(-1)[1];await atlasPersonalPage.locator(last).scrollIntoViewIfNeeded();await atlasPersonalPage.locator(last).hover();await atlasPersonalPage.mouse.wheel(0,1600);}
      return {selected:false,loading:/읽어들이는 중|Loading/.test(nav)};`);
    if (next.blocked) { yield { rows: [] as string[], status: next.blocked, count }; partial = true; break; }
    if (!next.selected) {
      stable++;
      if (stable >= 3 && !next.loading) break;
      if (stable >= 6) { partial = true; yield { rows: [] as string[], status: "dm_list_loading_stalled", count }; break; }
      await new Promise((r) => setTimeout(r, 1000)); continue;
    }
    stable = 0; count++;
    const key = hash(next.key!);
    const previous = state.chats[key] || (state.initialized ? { latest: "empty", links: [] } : undefined);
    let view = await session.run<{ groups: string[]; top: boolean }>(`const s=await snapshot(atlasPersonalPage);return {groups:atlasDmGroups(s.tree),top:s.tree.includes('- link "프로필 보기"')};`);
    if (!view.groups.length) {
      await new Promise((r) => setTimeout(r, 1000));
      view = await session.run(`const s=await snapshot(atlasPersonalPage);return {groups:atlasDmGroups(s.tree),top:s.tree.includes('- link "프로필 보기"')};`);
    }
    let signatures = view.groups.map(messageFingerprint);
    let stalled = 0;
    while (previous && previous.latest !== "empty" && !signatures.includes(previous.latest) && !view.top && stalled < 3) {
      const before = signatures.join();
      view = await session.run(`let s=await snapshot(atlasPersonalPage);const group=atlasDmGroups(s.tree)[0];const ref=group?.match(/- article [^\\n]*?\\[ref=([^\\]]+)\\]/);if(ref){await atlasPersonalPage.locator(ref[1]).scrollIntoViewIfNeeded();await atlasPersonalPage.locator(ref[1]).hover();await atlasPersonalPage.mouse.wheel(0,-1600);}s=await snapshot(atlasPersonalPage);return {groups:atlasDmGroups(s.tree),top:s.tree.includes('- link "프로필 보기"')};`);
      signatures = view.groups.map(messageFingerprint);
      stalled = before === signatures.join() ? stalled + 1 : 0;
      if (stalled) await new Promise((r) => setTimeout(r, 1000));
    }
    // First run (and first encounter with a conversation) establishes a baseline, never backfills it.
    if (!previous) {
      state.chats[key] = { latest: signatures.at(-1) || "empty", recent: signatures.slice(-200), links: [] };
      yield { rows: [] as string[], status: "baseline", count };
    } else {
      const delta = newMessageIndexes(signatures, previous.latest, previous.recent);
      const links = new Set(previous.links);
      if (previous.latest === "empty" || delta.anchorFound) {
        const indexes = previous.latest === "empty" ? signatures.map((_, i) => i) : delta.indexes;
        // Resolve one message at a time against fresh snapshot refs; never click arbitrary message buttons.
        let unreadable = false;
        for (const index of indexes) {
          const result = await session.run<{ urls: string[]; unreadable?: boolean }>(`
            let s=await snapshot(atlasPersonalPage);const groups=atlasDmGroups(s.tree);const group=groups[${index}];if(!group)return {urls:[],unreadable:true};
            const urls=[];for(const ref of [...group.matchAll(/- link[^\\n]*?\\[ref=([^\\]]+)\\]/g)]){const href=await atlasPersonalPage.locator(ref[1]).getAttribute('href');if(href)urls.push(new URL(href,'https://www.instagram.com').href);}
            const share=group.match(/- article "(?:클립|게시물|Reel|Post)"[^\\n]*:\\n\\s+- button \\[ref=([^\\]]+)\\]/);
            if(share){await atlasPersonalPage.locator(share[1]).click();s=await snapshot(atlasPersonalPage);if(/- dialog\\s*$/.test(s.tree)){await sleep(1200);s=await snapshot(atlasPersonalPage);}const dialog=atlasDmBlock(s.tree,/- dialog/);for(const ref of [...dialog.matchAll(/- link[^\\n]*?\\[ref=([^\\]]+)\\]/g)]){const href=await atlasPersonalPage.locator(ref[1]).getAttribute('href');if(href)urls.push(new URL(href,'https://www.instagram.com').href);}const close=s.tree.match(/- button \\[ref=([^\\]]+)\\][^\\n]*:\\n\\s+- img "(?:닫기|Close)"/);if(close){await atlasPersonalPage.locator(close[1]).click();await snapshot(atlasPersonalPage);}else return {urls,unreadable:true};}
            return {urls};`);
          for (const url of result.urls) { try { links.add(socialUrl(url).url); } catch {} }
          if (result.unreadable) { partial = true; unreadable = true; }
        }
        state.chats[key] = { latest: unreadable ? previous.latest : signatures.at(-1) || previous.latest, recent: unreadable ? previous.recent : signatures.slice(-200), links: [...links] };
        yield { rows: [...links], status: indexes.length ? "updated" : "unchanged", count };
      } else {
        // Never silently import the entire history when the last-read boundary is missing.
        partial = true;
        yield { rows: [...links], status: "dm_checkpoint_not_visible", count };
      }
    }
    await fs.writeFile(file + ".tmp", JSON.stringify(state)); await fs.rename(file + ".tmp", file);
  }
  if (!partial) state.initialized = true;
  await fs.writeFile(file + ".tmp", JSON.stringify(state)); await fs.rename(file + ".tmp", file);
  yield { rows: [] as string[], status: partial ? "incomplete_dm_scan" : "end_observed", count };
}
