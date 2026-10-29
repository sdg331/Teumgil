# 틈길 · TEUMGIL

**전통시장 장보기와 시민·상인의 소통을 연결하는 웹앱**

2026 로컬솔루션데이 · 길이음팀

틈길은 시장의 점포와 취급 품목을 찾고 장보기를 준비하는 서비스입니다. 통행 불편이 생기면 의견을 남기고, 운영자의 확인과 상인 협의, 이후의 처리 기록을 살펴볼 수 있습니다.

> **가상 자료로 체험하는 서비스 MVP입니다.** 시민·운영자·상인의 13개 화면과 가입·로그인을 서버 저장으로 연결했습니다. 실제 지도·AI·메일은 연결하지 않았으며 점포 목록과 직접 작성으로 이용합니다.

[현재 상태](#status) · [로컬 실행](#getting-started) · [개발 문서](#documentation)

<a id="overview"></a>
<a id="experience"></a>
## 이용 흐름

- **시장 탐색** — 시장과 점포를 검색하고 평소 취급 품목을 확인합니다.
- **장보기** — 살 재료를 직접 적고 체크하거나 관련 점포를 찾습니다.
- **의견 전달** — 위치와 상황을 작성하고 정리된 초안을 검토한 뒤 제출합니다.
- **확인과 협의** — 운영자와 관련 상인이 내용을 확인하고 답변·결과·후속 확인을 기록합니다.

의견 작성은 선택 사항입니다. 틈길 내부 접수와 공식 민원은 별개이며, 장바구니는 살 재료를 정리하는 목록입니다. 기능별 동작은 [제품·화면 명세](docs/PRODUCT_SCREENS.md)에서 관리합니다.

<a id="status"></a>
## 현재 개발 상태

- [x] 제품·화면·데이터 명세와 명세 ID 관리
- [x] Next.js·TypeScript 서버 기반, PostgreSQL 스키마·마이그레이션
- [x] 이메일·비밀번호 가입·로그인, DB 세션, 본인 계정 조회 API
- [x] 시장·점포·평소 취급 품목 검색 API와 개발용 가상 자료
- [x] 시장 탐색과 계정별 공통 장바구니, 체크·수정·삭제
- [x] 원문·검토·접수·내 의견, 서버 초안 복구와 선택 사진
- [x] 운영자의 확인·질문·전달·시민용 게시·정정·후속 확인
- [x] 상인 전달 목록·답변, 역할 부여·회수 관리 명령과 감사 기록
- [ ] 실제 지도·AI 연동과 배포

실행 버전은 [package.json](package.json), 채택 근거와 남은 결정은 [결정 기록](docs/PLANS.md)에 있습니다. 상인은 운영자가 선택해 보낸 요약만 보고, 시민은 운영자가 별도로 게시한 결과를 확인합니다. 사진과 상인 답변 원문은 공개 게시판에 노출하지 않습니다.

<a id="getting-started"></a>
## 로컬 실행

**Node.js 24와 npm**이 필요합니다. 저장소 루트에서 실행합니다.

```sh
npm ci --ignore-scripts
npm run setup:local
npm run db:migrate
npm run db:seed
npm run demo:init
npm run dev
```

`setup:local`은 임의의 인증 비밀키를 담은 `.env.local`을 만들고, 기존 파일이 있으면 유지합니다. 로컬 개발에서는 서버 파일에 저장하는 PGlite를 사용합니다. 배포 환경은 공유 PostgreSQL과 HTTPS를 사용하도록 구성했습니다.

[틈길 열기](http://localhost:3000)에서 시작합니다. `demo:init`은 세 역할의 가상 계정과 연결된 예시를 준비합니다. 임의로 만든 비밀번호는 Git에서 제외된 `.harness/demo-accounts.json`에 저장됩니다. 서로 다른 브라우저 프로필로 로그인하면 같은 의견을 역할별로 확인할 수 있습니다.

이미 이 작업 공간에 준비된 PostgreSQL을 다시 켤 때는 `npm run db:local:start`를 먼저 실행합니다. 새 환경의 PostgreSQL 연결과 역할 관리·초기화 방법은 [개발 안내](docs/DEVELOPMENT.md), 발표 순서는 [시연 시나리오](docs/DEMO_SCENARIO.md)를 따릅니다. PGlite에서는 개발 서버를 끈 뒤 DB·시연 관리 명령을 실행합니다.

<a id="validation"></a>
## 검증

```sh
npm run verify
npm run build
npm run test:e2e
```

`verify`는 문서·명세 ID, 타입·린트, 실제 인증·DB를 사용하는 도메인 테스트, 의견 초안의 가상 기준 출력을 검사합니다. `test:e2e`는 개발 서버와 가상 계정이 준비된 상태에서 실행하며, 최초 한 번 `npx playwright install chromium`이 필요합니다. 브라우저 결과와 trace는 `.harness/`에만 저장합니다.

검증 범위와 화면별 근거는 [MVP 인수 기록](docs/MVP_VERIFICATION.md)에 정리합니다. PostgreSQL 검사 방법은 [개발 안내](docs/DEVELOPMENT.md), 의견 초안 평가 규격은 [하네스](docs/HARNESS.md)에 있습니다. 가상 기준 출력 검사는 실제 AI 성능이나 현장 효과의 검증이 아닙니다.

<a id="documentation"></a>
<a id="contributing"></a>
## 개발 문서

| 찾는 내용 | 문서 |
| --- | --- |
| 실행 환경·DB·API 사용법 | [개발 안내](docs/DEVELOPMENT.md) |
| 제품 목표·화면별 동작 | [제품·화면 명세](docs/PRODUCT_SCREENS.md) |
| 기술 선택·구현 상태 | [아키텍처](docs/ARCHITECTURE.md) · [결정 기록](docs/PLANS.md) |
| 데이터·역할·공개 범위 | [데이터 계약](docs/DATA_ACCESS.md) |
| 화면의 시각·말투 | [구현된 디자인](docs/design/IMPLEMENTED_SYSTEM.md) · [화면별 레퍼런스](docs/design/SCREEN_REFERENCES.md) · [모션](docs/design/MOTION_SPEC.md) · [UX 문구](docs/UX_COPY.md) |
| Astra에 구현 요청 | [실행 프롬프트](docs/prompts/ASTRA_BUILD.md) · [승인된 MVP 범위](docs/design/IMPLEMENTATION_SCOPE.md) |
| 개발 작업·검증·ID 변경 | [AGENTS.md](AGENTS.md) · [하네스](docs/HARNESS.md) · [ID 관리](docs/ID_POLICY.md) |

기획 배경은 [원문 참고본](docs/TEUMGIL_Project_Spec.md), 발표 흐름은 [시연 시나리오](docs/DEMO_SCENARIO.md)에서 확인합니다. 변경 시에는 관련 화면 ID와 확인한 동작·검증 결과를 남기고 가상 자료로 재현합니다.

<a id="roadmap"></a>
## 실제 운영 전에 남은 일

1. 운영 주체와 실제 시장·상인 관계를 확인하고 자료 사용 권한을 정합니다.
2. 개인정보 동의·보관 기간·삭제·문의 정책을 정하고 실제 수집 전 검증합니다.
3. 지도·AI·메일 제공자를 선택하고 이메일 확인·재설정과 외부 전송을 검증합니다.
4. HTTPS 배포, 백업·복구, 실제 모바일 기기와 다중 기기 접속을 검증합니다.

<a id="team"></a>
## 팀과 라이선스

길이음팀 · 2026 로컬솔루션데이 · [sdg331/Teumgil](https://github.com/sdg331/Teumgil)

프로젝트 라이선스는 아직 정하지 않았습니다. 자체 호스팅한 Pretendard는 [SIL OFL](public/fonts/OFL.txt)을 따릅니다. README 구성의 참고 사례와 적용 판단은 [레퍼런스 분석](docs/README_REFERENCE_REVIEW.md)에 기록했습니다.
