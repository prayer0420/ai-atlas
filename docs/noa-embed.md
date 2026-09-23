# NOA 안에서 AI Atlas 열기

NOA의 주소는 `http://127.0.0.1:4190` 또는 `http://localhost:4190`이다. 전용 `/embed` 페이지에서 기존 Workspace를 그대로 사용하며 로그인, 소유자 검사, API, 자료 접근 정책은 같은 코드를 사용한다.

기존 모든 페이지의 `X-Frame-Options: DENY`는 유지한다. `/embed`에만 CSP `frame-ancestors`로 위 두 주소를 정확히 허용한다. 임의 도메인, 다른 포트, 와일드카드는 허용하지 않는다. 최신 브라우저는 이 CSP 정책을 적용하며, 이를 지원하지 않는 오래된 브라우저는 기존 DENY에 따라 삽입을 거부한다.

공식 기준: [CSP frame-ancestors](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/frame-ancestors), [CSP와 X-Frame-Options의 관계](https://w3c.github.io/webappsec-csp/#frame-ancestors-and-frame-options).

이 페이지는 인증 우회나 로그인 공유 기능이 아니다. 사용자 브라우저의 로그인 상태를 그대로 사용하며, 세션이 없으면 기존 로그인 화면을 사용한다. NOA의 전용 화면 링크는 기존 주소를 유지하고 iframe 주소만 `/embed`로 연결한다.

검증: `tests/embed-headers.test.ts`에서 경로·정확한 허용 주소·기존 헤더 보존을 확인한다. 배포 전 전체 `npm run build`, 배포 후 `scripts/check.mjs`의 익명 API·비밀번호 설정 거부와 서버 비밀값 미노출 검사를 수행한다. 실제 NOA 프레임 표시 결과는 통합 검증 기록에 남긴다.
