import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomUUID } from "node:crypto";
import { providerEnvironment } from "./provider-env";

/** One interactive REPL keeps owned listing tabs alive across pagination steps. */
export class AsideSession {
  private child: ChildProcessWithoutNullStreams;
  private buffer = "";
  private pending?: { marker?: string; resolve: (value: unknown) => void; reject: (e: Error) => void; timer: NodeJS.Timeout };
  private ready: Promise<unknown>;
  constructor(executable: string) {
    this.child = spawn(executable, ["repl", "--account", "u0", "--host", "local"], { windowsHide: true, env: providerEnvironment(process.env) });
    this.ready = this.wait();
    this.child.stdout.on("data", (chunk) => { this.buffer += String(chunk).replace(/\x1b\[[0-9;]*m/g, ""); this.flush(); });
    this.child.stderr.on("data", () => {});
    this.child.on("error", () => this.fail());
    this.child.on("exit", () => this.fail());
  }
  private fail() { if (this.pending) { clearTimeout(this.pending.timer); this.pending.reject(Error("Aside session disconnected")); this.pending = undefined; } }
  private wait(marker?: string) {
    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => { this.fail(); this.child.kill(); }, 135_000);
      this.pending = { marker, resolve, reject, timer };
    });
  }
  private flush() {
    const p = this.pending;
    if (!p || !/repl\s*>\s*$/.test(this.buffer)) return;
    if (p.marker) {
      const line = this.buffer.split(/\r?\n/).find((line) => line.includes(p.marker!));
      if (!line) { clearTimeout(p.timer); this.pending = undefined; p.reject(Error("Aside command returned no result")); return; }
      try {
        const result = JSON.parse(line.slice(line.indexOf(p.marker) + p.marker.length));
        clearTimeout(p.timer); this.pending = undefined; this.buffer = "";
        if (result.ok) p.resolve(result.value); else p.reject(Error("Aside browser action failed"));
      } catch { this.fail(); }
    } else { clearTimeout(p.timer); this.pending = undefined; this.buffer = ""; p.resolve(null); }
  }
  async run<T>(body: string): Promise<T> {
    await this.ready;
    if (this.pending) throw Error("Aside commands must be sequential");
    const marker = "ATLAS_" + randomUUID().replaceAll("-", "") + "=";
    const result = this.wait(marker);
    const command = `await (async()=>{try{const value=await(async()=>{${body}\n})();console.log(${JSON.stringify(marker)}+JSON.stringify({ok:true,value}));}catch{console.log(${JSON.stringify(marker)}+JSON.stringify({ok:false}));}})();`;
    this.child.stdin.write(command.replaceAll("\n", " ") + "\n");
    return result as Promise<T>;
  }
  close() { this.child.stdin.write("exit\n"); this.child.stdin.end(); }
}
