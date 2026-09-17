// Creates an application-to-application scheduler token in ignored files only.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { randomBytes } from "node:crypto";
const path = ".env.local";
let env = readFileSync(path, "utf8");
const existing = env.match(/^CRON_SECRET=(.+)$/m)?.[1];
const token = existing || randomBytes(32).toString("hex");
if (!existing)
  writeFileSync(path, env.trimEnd() + "\nCRON_SECRET=" + token + "\n");
mkdirSync(".local", { recursive: true });
writeFileSync(".local/cron.env", "CRON_SECRET=" + token + "\n");
console.log("Prepared scheduler environment file; values not displayed.");
