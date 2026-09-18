# Atlas reading room

2026-09-18: 자료 수집 대시보드를 개인 서재에 가까운 화면으로 개편했습니다.

- 따뜻한 배경, 녹색 강조, 낮은 채도와 얇은 구분선, serif 로고.
- 저장된 자료를 직접 넘기는 표지 영역. 자동 재생 없이 실제 자료만 표시하며 체험 자료·분석 전 원문을 구분합니다.
- 가로 분야 탐색, Ctrl/Cmd+K 검색, 기존 카드/목록 전환.
- 포인터 반응과 짧은 진입 모션. prefers-reduced-motion에서는 제거합니다.
- 모바일에서는 표지와 메뉴를 세로로 배치합니다.

참고한 공개 프로젝트:

- AFFiNE / BlockSuite design: https://github.com/toeverything/design — 자료 중심 탐색 구성 참고.
- Radix Primitives: https://github.com/radix-ui/primitives — 접근 가능한 컨트롤과 키보드 조작 원칙 참고.

위 프로젝트의 소스나 브랜드 자산을 복제하지 않았습니다. 현재 Next.js/React, Lucide 구성 위에서 자체 TSX·CSS로 구현했으며 새로운 유료 서비스나 런타임 의존성을 추가하지 않았습니다. 내보내는 학습 카드 이미지의 크기와 포맷은 유지합니다.
