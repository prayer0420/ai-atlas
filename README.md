# AI Atlas

흩어진 AI 자료를 수집하고 교육용 학습 노트로 정리하는 개인 웹앱입니다. 기존 attendance 앱과 별도의 프로젝트입니다.

## 구현된 기능

- 링크·텍스트 수집, TXT/MD/SRT/VTT 불러오기, 중복 자료 확인
- 7개 분야별 탐색, 제목·본문·태그·메모 검색, 출처 필터, 정렬, 페이지 이동
- 즐겨찾기, 학습 완료, 제목·분류·태그 수정, 메모, 휴지통·복원
- 공개 웹 본문 추출, 공개 YouTube 자막 수집 시도, 수집 실패 시 본문 추가 안내
- OpenAI의 구조화된 응답으로 학습 목표·요약·상세 설명·개념도·비교표·용어·실습·복습 문제 작성
- 원문 기반 설명과 보충 설명 구분, 주의사항과 출처 유지
- 개념도 PNG 저장, 학습 노트 Markdown 내보내기
- Supabase 이메일·비밀번호 인증, 사용자별 RLS 정책, 일일 분석 제한과 중복 실행 방지
- 반응형 화면, 키보드로 조작 가능한 모달·폼, 모션 감소 설정 지원

## 현재 상태

2026-09-18: 소스 구현과 로컬 개발 서버 준비 완료. 프로덕션 빌드, 타입 검사, PostgreSQL 기반 RLS·할당량 테스트 통과. 클라우드 테이블 적용, 실제 OpenAI 분석, Vercel 프로덕션 배포는 관리자 연결과 API 키 확인 후 진행해야 합니다. 완료되지 않은 외부 연결을 시연 데이터로 대체해 성공 처리하지 않습니다.

로그인 전 보이는 자료는 **체험용으로 미리 작성한 예시**입니다. 실제 저장된 사용자 자료나 실시간 AI 분석 결과가 아닙니다.

## 실행

Node.js 24 기준입니다.

```powershell
npm install
npm run dev
```

기본 로컬 주소는 `http://127.0.0.1:3210`입니다. 브라우저 → 로컬 Next.js 서버 3210 → Supabase/OpenAI HTTPS 443 방향으로 통신합니다. 로컬 서버는 외부 네트워크에 노출하지 않습니다.

## 환경변수

`.env.example`에 필요한 이름이 있습니다. 실제 값은 Git에서 제외된 `.env.local` 또는 Vercel의 서버 환경변수에만 저장합니다.

| 이름                      | 용도                                                        |
| ------------------------- | ----------------------------------------------------------- |
| SUPABASE_URL              | 기존 프로젝트의 Supabase 주소                               |
| SUPABASE_ANON_KEY         | 브라우저 로그인에 사용되는 공개 키                          |
| SUPABASE_SERVICE_ROLE_KEY | 서버 전용 분석 작업 저장·할당량 관리                        |
| OPENAI_API_KEY            | 서버 전용 AI API 키                                         |
| OPENAI_MODEL              | 기본 `gpt-5-mini`, 구조화된 출력 지원 모델                  |
| ALLOWED_EMAILS            | AI 분석을 허용할 이메일, 쉼표로 구분. 비어 있으면 분석 거부 |
| DAILY_ANALYSIS_LIMIT      | 사용자별 한국 시간 기준 하루 분석 시도 제한, 기본 20회      |

브라우저에 전달되는 값은 Supabase 주소와 공개 키뿐입니다. 서비스 역할 키나 AI 키에는 `NEXT_PUBLIC_` 접두사를 붙이지 마세요.

## Supabase 적용

`supabase/migrations/202609170001_ai_atlas.sql`을 기존 Supabase 프로젝트의 SQL Editor에서 실행합니다. 새 `ai_atlas_resources`, `ai_atlas_analysis_jobs` 테이블과 전용 함수·정책만 추가합니다. 기존 attendance 테이블이나 기존 인증 정책은 수정하지 않습니다. 트랜잭션으로 묶였으며 적용 실패 시 모두 롤백됩니다. 성공 후 반복 적용하지 마세요.

관리 API 토큰이 있는 경우 `.env.local`에 `SUPABASE_ACCESS_TOKEN`을 추가하고 먼저 조회한 다음 적용할 수 있습니다. 서비스 역할 키는 관리 API 토큰으로 쓸 수 없습니다.

```powershell
node --env-file=.env.local scripts/database.mjs
```

```powershell
node --env-file=.env.local scripts/database.mjs --apply
```

인증은 기존 Supabase의 이메일 제공자를 사용합니다. 기존 사용자는 해당 계정으로 로그인할 수 있습니다. 새 사용자는 직접 비밀번호를 정하고 가입합니다. 이메일 확인이 필요한 프로젝트라면 인증 메일을 확인한 뒤 이 사이트로 돌아와 로그인합니다. 기존 프로젝트의 Site URL을 덮어쓰지 마세요. 필요하면 배포된 주소를 허용된 Redirect URL 목록에 추가합니다.

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

- Instagram·Threads는 링크와 본문을 함께 넣어야 합니다. 로그인 제한을 우회하거나 비공개 게시물을 수집하지 않습니다.
- YouTube 자막 자동 수집은 비공식 공개 자막 인터페이스에 의존하며, 영상·지역·서버 IP 등에 따라 실패할 수 있습니다. 실패 시 자막을 직접 붙여넣습니다. 영상 이미지나 오디오 자체를 분석한 것으로 표현하지 않습니다.
- AI 키·사용 가능한 크레딧이 필요합니다. ChatGPT 로그인만으로 API 분석이 되는 것은 아닙니다.
- 분석이 비정상 종료되어 상태가 남으면 6분 뒤 다시 시도할 수 있습니다. 원문과 개인 메모는 보존합니다. 재분석은 이전 노트를 교체합니다.
- 분석 요청이 모델에 전달되기 전에도 수집 실패 등으로 일일 시도 횟수를 사용할 수 있습니다. API 요금과 일일 횟수 제한은 별개입니다.
- 개념도는 모델이 구성한 텍스트를 읽기 쉬운 도표로 렌더링합니다. 외부 이미지 생성 API를 호출하지 않습니다.
- 클라우드 연결 전에는 체험 노트만 볼 수 있습니다. 실제 AI 품질과 저장·로그인 동작은 연결 후 검증해야 합니다.

## 참고한 공식 문서

- [OpenAI 구조화된 출력](https://developers.openai.com/api/docs/guides/structured-outputs)
- [Supabase Data API 접근 보호](https://supabase.com/docs/guides/api/securing-your-api)
- [Supabase 관리 API SQL 실행](https://supabase.com/docs/reference/api/v1-run-a-query)
- [Vercel 환경변수](https://vercel.com/docs/environment-variables)
- [YouTube transcript 라이브러리 원본](https://github.com/Kakulukian/youtube-transcript)
