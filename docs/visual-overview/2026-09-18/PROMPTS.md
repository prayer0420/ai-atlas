# AI Atlas 큰그림 제작 기록

방식: 내장 image_gen · 신규 생성 3장 + 수정 3장. 최종 PNG 3장만 배포용 묶음에 포함.

## 1장 최초 프롬프트

```text
Use case: infographic-diagram. Create ONE polished, highly legible Korean educational infographic, part of a coordinated 3-page explanatory series about the REAL existing AI Atlas service. Landscape 16:10 canvas, high resolution about 2560x1600. Crisp Korean sans-serif typography, warm ivory background, dark navy text, teal/blue/lilac accents, amber only for pending/conditional items. Professional editorial information design, not a sales advertisement. Generous whitespace, bold clear headings, simple meaningful flat/isometric line illustrations, strong contrast, large text. All Korean text below must be faithfully rendered with correct spelling. No invented claims, additional features, fictional metrics, screenshots, passwords or API keys. This is an explanatory diagram, not a screenshot of the actual site. Keep all text inside comfortable margins and readable at normal viewing size. Footer small but readable: "AI Atlas · 2026.09.18 확인 기준".
Page 01 / 03. Main title exactly "전체 구조: 자료가 지식이 되는 길". Subtitle exactly "흩어진 AI 정보를 모아, 쉽게 읽고 오래 활용하는 나만의 Second Brain".

Main architecture: five numbered stages along the reading flow, with a separate local-AI engine below the central database. Make arrows technically accurate and uncluttered.
1. A collection input panel with browser/video/text icons:
"1  모으기"
"공식 뉴스 · 연구 · 공개 피드"
"YouTube 공개 자막"
"Instagram·Threads 링크 + 본문"
"텍스트 · 메모 · 자막 파일"
2. A cloud web-service panel, connected FROM input:
"2  웹 서비스"
"Vercel + Next.js"
"홈페이지 · API · 매일 수집"
3. A central database cylinder and queue tray, connected to web service:
"3  개인 지식 저장소"
"Supabase"
"로그인 · 원문 · 작업 대기열"
"학습 노트 · 카드 · Wiki · 이력"
4. Readable learning-output panel connected FROM database:
"4  읽고 학습하기"
"핵심 카드 · 개념도"
"상세 설명 · 비교표 · 퀴즈"
"출처가 연결된 LLM Wiki"
5. Folder/connected-notebook panel, fed by a separate lower arrow FROM local worker:
"5  나의 지식 보관함"
"Obsidian"
"Markdown · 카드 이미지"
"Canvas · 백링크 · 개인 메모"

Below the database, a prominent illustrated laptop engine panel:
"내 PC의 무료 AI"
"Ollama + Qwen3.5:4b"
"분석 · 분류 · 카드뉴스 · Wiki 작성"
Connect database TO laptop with arrow label "작업 가져오기".
Connect laptop BACK TO database with arrow label "결과 저장".
Connect laptop TO Obsidian with arrow label "자동 저장".
Do NOT draw browser directly calling the PC AI port.
At bottom left a small amber dashed branch pointing into collection inbox:
"Aside 연결 준비"
"루틴 지시문 + JSON 수집함"
"실제 계정 루틴은 아직 미연결"
Bottom strip with two distinct clear facts:
"웹 수집은 PC 없이 실행"
"AI 분석·Obsidian 저장은 PC 로그인 중 실행"

```

## 1장 최종 보정 프롬프트

```text
Edit this infographic, preserving all essential Korean text and all five numbered architecture panels. Critical correction: use a COMPLETELY OPAQUE, solid warm ivory PAPER BACKGROUND (#fffaf0) across the entire rectangular canvas. No alpha, no transparency, no black gaps, no cutout treatment. Restore strong navy, perfectly legible title and footer lettering on that opaque paper. Remove the little mountain and all stray slogan text at the top right. Remove the arrow from panel 4 to panel 5: Obsidian must receive the existing "자동 저장" arrow from the PC worker, not from the reading panel. Keep the two oppositely directed arrows between Supabase and the PC labeled 작업 가져오기 and 결과 저장. Remove the ambiguous extra arrow from Aside directly into the AI laptop; keep Aside as an amber pending input connected only toward the input collection. Change the footnote to exactly "AI Atlas · 2026.09.18 확인 기준". Everything must remain on a solid opaque cream poster, absolutely no transparent pixels. No extra decorative text.
```

## 2장 최초 프롬프트

```text
Use case: infographic-diagram. Create ONE polished, highly legible Korean educational infographic, part of a coordinated 3-page explanatory series about the REAL existing AI Atlas service. Landscape 16:10 canvas, high resolution about 2560x1600. Crisp Korean sans-serif typography, warm ivory background, dark navy text, teal/blue/lilac accents, amber only for pending/conditional items. Professional editorial information design, not a sales advertisement. Generous whitespace, bold clear headings, simple meaningful flat/isometric line illustrations, strong contrast, large text. All Korean text below must be faithfully rendered with correct spelling. No invented claims, additional features, fictional metrics, screenshots, passwords or API keys. This is an explanatory diagram, not a screenshot of the actual site. Keep all text inside comfortable margins and readable at normal viewing size. Footer small but readable: "AI Atlas · 2026.09.18 확인 기준".
Page 02 / 03. Main title exactly "사용 흐름: 핵심은 짧게, 지식은 깊게". Subtitle "먼저 이해하고 → 필요할 때 깊이 읽고 → 내 지식으로 남깁니다".

Compose a visually compelling four-stage left-to-right learning journey with large numbered cards; show illustrated generic interface cards rather than realistic screenshots. Use sample UI tiles with only the exact labels requested. A clear downward depth cue flows from core summaries into detailed Wiki, avoiding a wall of paragraphs.
Stage1:
"1  담기"
"링크·본문·파일 저장"
"중복 확인 · 분야별 분류"
Mini chips "YouTube" "웹 글" "텍스트".
Stage2, dominant and visually appealing, illustration of a card carousel and simple concept flow graphic:
"2  빠르게 이해"
"핵심만 보기"
"핵심 3가지 + 개념도"
"오늘의 AI 카드뉴스"
"이미지와 짧은 문장으로 먼저 파악"
Three miniature content cards labeled only "질문", "핵심 원리", "활용 예시"; small subsequent quiz card labeled "복습 질문".
Stage3:
"3  깊이 학습"
"상세 설명 · 비교표 · 용어"
"실습 · 복사용 프롬프트 · 퀴즈"
"연결된 Wiki에서 개념 확장"
"원문·출처·이전 버전 확인"
Illustrate linked knowledge notes with central "LLM Wiki" node.
Stage4:
"4  내 지식으로"
"즐겨찾기 · 메모 · 학습 완료"
"검색 · 분야·출처 필터"
"Obsidian에서 생각 연결"
"Markdown·이미지로 내보내기"
Illustrate notebook and checkmark.

Bottom horizontal principle band with three concise columns:
Column1 heading "읽기 쉽게", body "큰 글씨 · 충분한 버튼 크기\n키보드 포커스 · 그림의 텍스트 설명"
Column2 heading "근거를 함께", body "원문 기반과 보충 설명 구분\nAI 초안 표시 · 검토 완료 보호"
Column3 heading "내 기록을 보존", body "원문·버전 이력 유지\n직접 수정한 Obsidian 파일 보호"
Make line breaks real, do not literally print backslash-n. No unsupported accuracy claims. Do not imply an external model is retrained on the notes.

```

## 2장 최종 보정 프롬프트

```text
Edit this infographic, preserving the four numbered learning stages and all main Korean text. Critical correction: fill the ENTIRE rectangular canvas with a COMPLETELY OPAQUE solid warm ivory paper background (#fffaf0), no transparency, no black gaps, no cutout effect. Title and bottom text must be dark navy and clearly readable. Remove all tiny decorative taglines near the logo and upper right; keep only AI Atlas and 02 / 03. In stage 1 replace the red PDF document label with "TXT" because PDF import is not supported. Replace the small category list that incorrectly says AI/기술/경제/사회/기타 with just three example categories "AI 기초", "프롬프트", "생산성". Do not invent category labels. Retain exact bottom principle text: "읽기 쉽게" / "큰 글씨 · 충분한 버튼 크기" / "키보드 포커스 · 그림의 텍스트 설명"; "근거를 함께" / "원문 기반과 보충 설명 구분" / "AI 초안 표시 · 검토 완료 보호"; "내 기록을 보존" / "원문·버전 이력 유지" / "직접 수정한 Obsidian 파일 보호". All must have a clean opaque background without mottling. Footer exactly "AI Atlas · 2026.09.18 확인 기준".
```

## 3장 최초 프롬프트

```text
Use case: infographic-diagram. Create ONE polished, highly legible Korean educational infographic, part of a coordinated 3-page explanatory series about the REAL existing AI Atlas service. Landscape 16:10 canvas, high resolution about 2560x1600. Crisp Korean sans-serif typography, warm ivory background, dark navy text, teal/blue/lilac accents, amber only for pending/conditional items. Professional editorial information design, not a sales advertisement. Generous whitespace, bold clear headings, simple meaningful flat/isometric line illustrations, strong contrast, large text. All Korean text below must be faithfully rendered with correct spelling. No invented claims, additional features, fictional metrics, screenshots, passwords or API keys. This is an explanatory diagram, not a screenshot of the actual site. Keep all text inside comfortable margins and readable at normal viewing size. Footer small but readable: "AI Atlas · 2026.09.18 확인 기준".
Page 03 / 03. Main title exactly "운영 현황: 자동화는 어디까지 됐을까?". Subtitle "작동하는 흐름, 확인한 결과, 남은 연결을 구분했습니다".

Use a balanced two-column layout: left 55% automation timeline, right 45% concrete verification/status dashboard. Large number tiles and small meaningful icons, no unlabelled arrows.

LEFT heading "매일 돌아가는 흐름"
Vertical connected steps:
"09시대 · 공개 자료 수집"
"공식 피드 → 중복 제거 → 원문 저장"
"11시대 · Wiki 정리 요청"
"요청을 DB 대기열에 보관"
"PC 로그인 중 · 무료 AI 처리"
"카드뉴스·학습 노트 생성 → Wiki 정리"
"작업 완료 후 · Obsidian 저장"
"Markdown + 카드 이미지 자동 갱신"
Small clock note exactly "한국 시간 기준 · 정확한 실행 분은 보장하지 않음"
Below this a small control row:
"상태 확인" "일시 중지" "실패 재시도" "완료 자동 갱신"
Small protective band:
"중복 작업 방지 · 사용자별 접근 제한"
"없는 출처 인용은 저장 차단 · 원문과 개인 편집 보존"

RIGHT heading "실제로 확인한 결과"
Four large statistic tiles:
"12장" / "카드 이미지"
"4개" / "Wiki 문서"
"14개" / "테스트 통과"
"완료" / "빌드·배포"
Under tiles:
"상세 학습 노트 생성 확인"
"로그인·개인 자료 접근 제한 확인"
"Obsidian 이미지 저장·ZIP 내보내기 확인"

At right lower section two amber/grey outlined cards, visually distinct from completed stats:
"조건과 한계"
"PC가 꺼지면 AI 작업은 대기"
"로컬 AI API 사용료 없음"
"PC 자원과 서버·DB 요금제 한도는 별도"
"AI 초안은 원문과 함께 검토"
Then:
"아직 연결·검증하지 않은 것"
"Aside 실제 계정 루틴"
"모든 기종의 설치·공유 동작"
"브라우저 화면의 시각적 검사"

No claim that entire service is forever free, no claim that social networks are fully scraped or that Aside is running. No extra future roadmap items. Keep exact quantities as verified snapshot, not live unbounded count.

```

## 3장 최종 보정 프롬프트

```text
Edit this infographic with ONE specific correction: restore a COMPLETELY OPAQUE solid warm ivory paper background (#fffaf0) over the entire rectangular canvas, no transparent pixels, no black gaps, no cutout treatment. Make the main heading, subtitle, small timing note and footer clean dark navy readable text without distressed or patchy edges. Remove the tiny extra decorative taglines near the top corners, preserving only AI Atlas and 03 / 03. Preserve EVERY main label and quantity in the two-column infographic exactly, especially 12장, 4개, 14개, 완료, 09시대, 11시대, Aside actual routine not connected and the unverified items. No extra features, no new counts, no other changes. Footer exactly "AI Atlas · 2026.09.18 확인 기준".
```

