import { inspectSocial } from "../lib/aside-capture";
import { socialUrl } from "../lib/social-capture";
const url = process.argv[2];
if (!url) throw Error("검증할 공개 게시물 URL을 지정하세요. 이 명령은 자료를 저장하지 않습니다.");
const target = socialUrl(url);
inspectSocial(target.platform, 1, target.url).then((r) => console.log(JSON.stringify({
  readable: r.items.length, items: r.items.map((i) => ({ title: i.title, url: i.url, chars: i.text.length, metrics: i.metrics })), failures: r.failures,
}, null, 2))).catch(() => { console.error("브라우저 확인 실패: Aside 실행·로그인 상태를 확인하세요."); process.exitCode = 1; });
