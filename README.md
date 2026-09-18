# AI Atlas

흩어진 AI 자료를 수집하고 교육용 학습 노트로 정리하는 개인 웹앱입니다. 기존 attendance 앱과 별도의 프로젝트입니다.

## 구현된 기능

- 링크·텍스트 수집, TXT/MD/SRT/VTT 불러오기, 중복 자료 확인
- 7개 분야별 탐색, 제목·본문·태그·메모 검색, 출처 필터, 정렬, 페이지 이동
- 즐겨찾기, 학습 완료, 제목·분류·태그 수정, 메모, 휴지통·복원
- 공개 웹 본문 추출, 공개 YouTube 자막 수집 시도, 수집 실패 시 본문 추가 안내
- 기본 Ollama 로컬 AI의 구조화된 응답으로 학습 목표·요약·상세 설명·개념도·비교표·용어·실습·복습 문제 작성
- 원문 기반 설명과 보충 설명 구분, 주의사항과 출처 유지
- 개념도 PNG 저장, 학습 노트 Markdown 내보내기
- 아이디·비밀번호 로그인, Supabase 계정 연결과 사용자별 RLS 정책, 일일 분석 제한과 중복 실행 방지
- 반응형 화면, 키보드로 조작 가능한 모달·폼, 모션 감소 설정 지원

## 현재 상태

2026-09-18: [프로덕션 서비스](https://ai-atlas-two.vercel.app). Supabase 전용 테이블·접근 정책, 일일 자료 수집·카드뉴스·LLM Wiki·Obsidian 연결. Gateway 결제 설정 의존성을 제거하고 기본 실행 경로를 무료 로컬 AI로 변경했습니다. 상세 구성·도구 비교·운영 범위는 [무료 자동화 운영 안내](./docs/AUTOMATION.md)를 확인하세요.

- Vercel 프로젝트: `ai-atlas` / `prayer-s-projects12`
- Supabase: `DC_proj`의 `ai_atlas_*` 전용 테이블
- 자동 배포 브랜치: `codex/initial-build`
- 소스: [GitHub 저장소](https://github.com/prayer0420/ai-atlas)
- 일반 사용법: [사용 안내](./USER_GUIDE.md)

로그인 전 보이는 자료는 **체험용으로 미리 작성한 예시**입니다. 실제 저장된 사용자 자료나 실시간 AI 분석 결과가 아닙니다.

## 실행

Node.js 24 기준입니다.

```powershell
npm install
npm run dev
```

기본 로컬 주소는 `http://127.0.0.1:3210`입니다. 브라우저 → Next.js → Supabase HTTPS 443, PC 작업기 → Supabase HTTPS 443 및 Ollama localhost 11434 방향으로 통신합니다. 로컬 서버는 외부 네트워크에 노출하지 않습니다.

## 환경변수

`.env.example`에 필요한 이름이 있습니다. 실제 값은 Git에서 제외된 `.env.local` 또는 Vercel의 서버 환경변수에만 저장합니다.

| 이름                      | 용도                                                         |
| ------------------------- | ------------------------------------------------------------ |
| SUPABASE_URL              | 기존 프로젝트의 Supabase 주소                                |
| SUPABASE_ANON_KEY         | 브라우저 로그인에 사용되는 공개 키                           |
| SUPABASE_SERVICE_ROLE_KEY | 서버 전용 분석 작업 저장·할당량 관리                         |
| OPENAI_API_KEY            | 선택: 직접 OpenAI 연결에 쓰는 서버 전용 API 키               |
| AI_GATEWAY_API_KEY        | 선택: Vercel AI Gateway 키. Vercel 배포에서는 OIDC 사용 가능 |
| OPENAI_MODEL              | 기본 `gpt-5-mini`, 구조화된 출력 지원 모델                   |
| ALLOWED_EMAILS            | AI 분석을 허용할 이메일, 쉼표로 구분. 비어 있으면 분석 거부  |
| DAILY_ANALYSIS_LIMIT      | 사용자별 한국 시간 기준 하루 분석 시도 제한, 기본 20회       |

브라우저에 전달되는 값은 Supabase 주소와 공개 키뿐입니다. 서비스 역할 키나 AI 키에는 `NEXT_PUBLIC_` 접두사를 붙이지 마세요.

기본 `AI_PROVIDER=local`에서는 외부 AI API를 호출하지 않습니다. `AI_PROVIDER=cloud`를 명시적으로 설정할 때만 OpenAI 키 → AI Gateway 키 → Vercel OIDC 순서로 연결합니다. 클라우드 모델에는 별도 크레딧이 필요하며 무료 한도가 자동 보장되지 않습니다. 로컬 모드에서 유료 모드로 자동 전환하거나 크레딧을 구매하지 않습니다. 로컬 작업기는 `.local/worker.env`의 `OLLAMA_MODEL`, `ATLAS_VAULT_PATH`, `ATLAS_INBOX_PATH`를 사용합니다.

## Supabase 적용

`supabase/migrations/202609170001_ai_atlas.sql`을 기존 Supabase 프로젝트의 SQL Editor에서 실행합니다. 새 `ai_atlas_resources`, `ai_atlas_analysis_jobs` 테이블과 전용 함수·정책만 추가합니다. 기존 attendance 테이블이나 기존 인증 정책은 수정하지 않습니다. 트랜잭션으로 묶였으며 적용 실패 시 모두 롤백됩니다. 성공 후 반복 적용하지 마세요.

관리 API 토큰이 있는 경우 `.env.local`에 `SUPABASE_ACCESS_TOKEN`을 추가하고 먼저 조회한 다음 적용할 수 있습니다. 서비스 역할 키는 관리 API 토큰으로 쓸 수 없습니다.

```powershell
node --env-file=.env.local scripts/database.mjs
```

```powershell
node --env-file=.env.local scripts/database.mjs --apply
```

인증은 기존 Supabase의 이메일 제공자를 사용합니다. 기본은 이메일 링크 로그인입니다. 비밀번호 로그인·가입도 선택할 수 있습니다. 배포 주소 `https://ai-atlas-two.vercel.app`을 허용된 Redirect URL에 추가했습니다. 기존 Site URL은 유지합니다. 기본 Supabase 메일 발송에는 수신자·횟수 제한이 있을 수 있으며, 다른 사용자를 초대하려면 SMTP와 AI 허용 계정 설정을 별도로 준비해야 합니다.

## Vercel 배포

새 프로젝트로 이 저장소를 가져옵니다. Framework는 Next.js, Root Directory는 저장소 루트, Build Command는 `npm run build`입니다. 기존 attendance Vercel 프로젝트에 덮어쓰지 않습니다. 위 서버 환경변수를 등록하고 배포합니다. `vercel.json`은 서울 리전과 AI 분석 함수의 최대 300초 실행 시간을 지정합니다. 실제 허용 시간은 계정 플랜과 Vercel 설정을 확인해야 합니다.

Vercel 로그인 또는 토큰이 준비된 환경에서는 공식 CLI로 `vercel --prod`를 사용할 수 있습니다. 토큰을 명령어에 직접 적거나 소스에 커밋하지 마세요.

## 검증

```powershell
npm test
```

PostgreSQL 엔진(PGlite)에서 실제 SQL을 실행해 다른 사용자 자료 조회·수정 차단, 중복 확인, 휴지통 복원, 익명 접근 차단, 분석 권한·할당량·동시 실행 제어를 확인합니다. Supabase 호스팅 환경에서 검증한 것으로 간주하지 않습니다.

```powershell
npm run build
```

```powershell
node --env-file=.env.local scripts/check.mjs
```

마지막 명령은 실행 중인 서버에 대해 HTTP 응답, 로그인 없는 CRUD·분석 차단, 서버 키 미노출을 확인합니다. 배포 후 `CHECK_URL`을 실제 주소로 지정하면 같은 검사를 할 수 있습니다.

## 운영상의 경계

- Instagram·Threads는 Aside 브라우저 수집을 지원합니다. 공개 검색에서 게시물을 찾고 실제 표시되는 본문을 읽습니다. Aside에서 최초 로그인하면 이후 같은 프로필의 로그인 세션을 재사용합니다. 로그인 만료·인증 요구 시 해당 항목을 건너뛰고 원인을 기록합니다. 직접 링크와 본문을 넣는 방법도 유지합니다.
- YouTube 자막 자동 수집은 비공식 공개 자막 인터페이스에 의존하며, 영상·지역·서버 IP 등에 따라 실패할 수 있습니다. 실패 시 자막을 직접 붙여넣습니다. 영상 이미지나 오디오 자체를 분석한 것으로 표현하지 않습니다.
- 기본 로컬 AI는 유료 API 키가 필요하지 않습니다. 선택적 클라우드 모드에만 OpenAI 또는 AI Gateway 연결과 사용 가능한 크레딧이 필요합니다.
- 분석 요청은 대기열에 보관됩니다. PC에서 중단된 작업은 복구·재시도하며 홈페이지 자동화 패널에서 진행 상황을 확인합니다. 원문과 개인 메모는 보존하고 재분석은 이전 노트를 교체합니다.
- 분석 요청이 모델에 전달되기 전에도 수집 실패 등으로 일일 시도 횟수를 사용할 수 있습니다. API 요금과 일일 횟수 제한은 별개입니다.
- 개념도는 모델이 구성한 텍스트를 읽기 쉬운 도표로 렌더링합니다. 외부 이미지 생성 API를 호출하지 않습니다.
- 로그인 전에는 체험 노트, 로그인 후에는 실제로 저장한 본인 자료를 표시합니다. 시작 예제 1개는 기능 검증용으로 직접 작성한 원문임을 표시했습니다.

## 참고한 공식 문서

- [OpenAI 구조화된 출력](https://developers.openai.com/api/docs/guides/structured-outputs)
- [Supabase Data API 접근 보호](https://supabase.com/docs/guides/api/securing-your-api)
- [Supabase 관리 API SQL 실행](https://supabase.com/docs/reference/api/v1-run-a-query)
- [Vercel 환경변수](https://vercel.com/docs/environment-variables)
- [Vercel AI Gateway OIDC 인증](https://vercel.com/docs/ai-gateway/authentication-and-byok/oidc)
- [Vercel AI Gateway Responses API](https://vercel.com/docs/ai-gateway/sdks-and-apis/openresponses)
- [YouTube transcript 라이브러리 원본](https://github.com/Kakulukian/youtube-transcript)

## 매일 수집 · 카드뉴스 · LLM Wiki · Obsidian

- `오늘의 AI`: OpenAI·Google AI·Hugging Face·arXiv·Two Minute Papers·GeekNews의 공개 피드를 수집합니다. 원문 날짜, 출처, 실제 공개 조회수와 선정 이유를 표시합니다. 이전 날짜에 소개한 항목은 다음 카드에서 제외합니다.
- Vercel Cron: 매일 한국 시간 **09시대 수집**, **11시대 Wiki 정리 요청**. Hobby에서는 해당 시간대 안에서 실행되므로 정확한 분을 보장하지 않습니다. 수집·예약은 PC 없이 실행되지만 AI 생성과 Obsidian 저장에는 로그인된 PC가 필요합니다. `CRON_SECRET` 서버 환경변수가 필수이며 익명 호출은 차단합니다.
- 한 번에 1~5개 주제, 주제별 3~6장의 카드와 복습 질문을 만듭니다. 카드 PNG는 1080×1350입니다. AI가 불가능하면 명확히 표시된 원문 미리보기를 저장합니다.
- Aside 예약 수집은 Instagram 최대 3건·Threads 최대 3건·YouTube 최대 4건을 대상으로 합니다. 읽기 실패·중복은 제외하고, 재실행을 포함해 하루 합계 최대 10건을 저장합니다. 이 제한은 Aside 경로에 적용되며 Vercel RSS 수집은 별도입니다. 검색 후보와 피드 안에서 선정하며 플랫폼 전체 인기 순위는 아닙니다. 이미지·동영상 자체는 자동 분석하지 않습니다.
- 홈페이지의 `자동화 상태`에서 전체·Instagram DM·YouTube·Threads 리포스트 수집을 즉시 시작할 수 있습니다. 직접 실행은 신규 항목만 저장하며 YouTube는 한 번에 최대 4건을 확인합니다. 진행 상태, 새로 저장한 제목과 원문 링크, 이미 확인해 건너뛴 수를 같은 화면에서 확인할 수 있습니다.
- Wiki는 저장 자료를 개념·도구·가이드로 연결하고, 출처 UUID와 버전 이력을 보존합니다. 검토 완료 문서는 자동 갱신하지 않습니다. 질문 답변도 출처가 있는 문서로 저장합니다. 일일 작업 시도는 10회, 같은 작업 재시도는 하루 3회입니다.
- Obsidian에는 Windows 작업기가 Markdown·카드 SVG·Canvas를 자동 저장합니다. ZIP 또는 Chrome/Edge의 폴더 연결로 수동 내보내기도 가능합니다. 웹→로컬 단방향이며, 사용자가 Obsidian에서 수정한 파일은 건너뛰고 파일을 삭제하지 않습니다.
- 개인 보관함: `C:\Users\c\OneDrive\문서\AI Atlas Second Brain`. Obsidian에서 이 폴더를 보관함으로 열면 됩니다. 기존 보관함 설정이나 개인 메모는 덮어쓰지 않습니다.
- 마이그레이션 `20260917154144_atlas_daily_wiki.sql`은 운영 Supabase에 적용됐습니다. 여섯 신규 테이블은 RLS를 사용하고, 클라이언트에는 본인 데이터 조회만 허용합니다.
- 실제 로컬 모델 호출로 3개 주제의 카드 12장, Wiki 4개, 상세 학습 노트를 저장했습니다. 원문 보존·이미지 내보내기·개인별 접근 제한·자동 실행을 확인했습니다. 생성된 문서는 검토 전 AI 초안으로 표시하며 출처의 주장과 독립적으로 검증한 사실을 구분합니다.

설계 참고: [LLM Wiki 원본 아이디어](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f), [Obsidian 도움말](https://help.obsidian.md/), [Vercel Cron 실행 시간](https://vercel.com/docs/cron-jobs/usage-and-pricing).
