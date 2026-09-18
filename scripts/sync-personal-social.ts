import { syncPersonalSocial } from "../lib/personal-social";
import { promises as fs } from "node:fs";
async function main() {
  if (process.argv.includes("--if-due")) {
    const previous = await fs.readFile(".local/personal-social-status.json", "utf8").then(JSON.parse).catch(() => null);
    const day = (value: string | Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date(value));
    if (previous?.status === "completed" && previous.finished_at && day(previous.finished_at) === day(new Date())) { console.log("오늘 개인 소셜 전체 조회를 이미 완료했습니다."); return; }
  }
  const result = await syncPersonalSocial();
  console.log(JSON.stringify(result));
  if (["failed", "partial"].includes(result.status)) process.exitCode = 1;
}
main().catch(() => { console.error("개인 소셜 동기화 실패: 로그인 및 .local 설정을 확인하세요."); process.exitCode = 1; });
