import { collectAside } from "../lib/aside-capture";
const input = process.argv[2];
collectAside(input?.startsWith("https://") ? undefined : input, input?.startsWith("https://") ? input : undefined).then((result) => console.log(JSON.stringify(result)))
  .catch(() => { console.error("Aside 수집 실패: Aside 앱의 로그인·실행 상태를 확인하세요. 기존 자료는 보존했습니다."); process.exitCode = 1; });
