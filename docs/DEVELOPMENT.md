# 틈길 개발 안내

S01–S13과 가입·로그인, 계정별 저장·역할별 처리를 구현했다. 제품 요구사항은 [제품 명세](PRODUCT_SCREENS.md), 정책 결정은 [PLANS](PLANS.md), 실행 검증은 [인수 기록](MVP_VERIFICATION.md), 실제 패키지와 명령은 [package.json](../package.json)을 기준으로 한다.

## 환경과 실행

Node.js 24에서 [README의 실행 순서](../README.md#getting-started)를 따른다. `setup:local`은 `.env.local`을 새로 만들 때만 임의의 비밀키를 생성한다. 기존 설정이나 계정을 초기화하지 않는다. `.env.local`과 `.harness/`의 DB·결과는 Git에 포함하지 않는다.

| 설정 | 역할 |
| --- | --- |
| `DATABASE_URL` | 로컬은 `pglite://.harness/app-db`, 서버 DB는 `postgresql://` 연결 문자열 |
| `BETTER_AUTH_URL` | 인증 요청을 허용할 앱의 원점. 로컬 기본값은 `http://localhost:3000` |
| `BETTER_AUTH_SECRET` | 32자 이상의 임의 비밀키. 서버 재시작 때 유지 |

로컬 PGlite는 **서버 프로세스가 파일에 저장**하며 브라우저 저장소를 사용하지 않는다. 한 개발 서버 안에서 계정을 구분하고 재시작 후 유지한다. 하나의 데이터 디렉터리를 여러 서버 프로세스가 동시에 열지 않는다. 배포 환경에서는 공유 PostgreSQL을 사용하며 production 설정은 PGlite 또는 HTTP 인증 원점을 거부한다.

`.env.local`의 연결·원점 설정을 바꾸면 서버를 재시작한다. 다른 기기에서 개발 서버에 접속할 때는 그 기기가 실제 접속하는 호스트로 인증 원점을 맞춘다. 프록시·HTTPS·클라이언트 IP 신뢰 설정은 선택한 호스팅 환경에 맞춰 확인한다.

## DB 변경

스키마는 [schema.ts](../src/server/schema.ts), 변경 이력은 [drizzle](../drizzle/)에 있다. 요청 처리 중 스키마를 자동 생성하지 않는다.

```sh
npm run db:generate
npm run db:migrate
```

`db:generate`는 스키마 변경에 대한 SQL을 생성한다. 생성된 SQL과 메타데이터를 함께 검토·커밋한다. `db:migrate`는 미적용 변경을 적용하고 적용 기록을 남긴다. 배포 전에도 같은 마이그레이션을 별도로 실행한다.

`npm run db:seed`는 개발용 가상 시장 2개·점포 3개를 추가한다. 반복 실행해 중복을 만들거나 기존 정보를 덮어쓰지 않는다. production에서는 실행을 거부한다. 마이그레이션은 PostgreSQL 전용 연결의 advisory lock으로 중복 실행을 직렬화한다.

### 이 작업 공간의 PostgreSQL

2026-10-29 로컬 검증용 PostgreSQL 17.11을 별도로 준비했다. Windows의 한글 설치 경로에서 `initdb`가 UTF-8 오류를 반환해 설치와 클러스터는 `%LOCALAPPDATA%/Teumgil/`의 ASCII 경로에 뒀다. [EDB 공식 배포](https://www.enterprisedb.com/download-postgresql-binaries)의 ZIP과 [공식 SHA-256](https://get.enterprisedb.com/postgresql/postgresql-17.11-5-windows-x64-binaries.zip.sha256)을 대조했다.

```sh
npm run db:local:start
npm run db:local:status
npm run dev
# 개발 서버를 종료한 뒤
npm run db:local:stop
```

앱은 `teumgil_mvp`, 서버 검사는 `teumgil_test` DB를 사용한다. 서버는 loopback 55432만 수신한다. 설치 경로·임의 비밀번호는 `.harness/postgres-runtime.json`, 앱 연결은 `.env.local`에 있다. 이전 설정은 `.harness/env-before-postgres.local`, 기존 PGlite 자료는 `.harness/app-db`에 보존했다. 이 설치 관리 명령은 해당 로컬 레지스트리가 있는 환경에서만 동작한다. 다른 개발자는 PostgreSQL을 직접 준비해 `DATABASE_URL`을 지정하거나 기본 PGlite를 사용한다.

### 가상 계정과 역할 관리

```sh
npm run demo:init
npm run demo:reset
npm run admin -- grant --email operator@example.invalid --role operator --markets sample-haetsal --actor local-admin --reason "가상 시장 담당자 배정"
npm run admin -- grant --email merchant@example.invalid --role merchant --stores sample-pureun --actor local-admin --reason "가상 점포 연결 확인"
npm run admin -- revoke --email merchant@example.invalid --actor local-admin --reason "시연 권한 회수"
```

`demo:init`은 시민·운영자·상인의 독립 계정과 장바구니, 접수 사례, 협의·답변·게시·후속 계획 사례를 만든다. 비밀번호는 `.harness/demo-accounts.json`에만 저장한다. 재실행은 기존 자료를 덮지 않는다. `demo:reset`은 이 레지스트리에 등록된 가상 계정의 예제 자료만 초기화하며, 실제 시장 의견이나 다른 계정의 연결 기록이 있으면 거부한다. production에서는 두 시연 명령을 거부한다.

권한 관리 대상은 먼저 가입해야 한다. `grant`는 역할과 담당 범위를 교체하고 `revoke`는 citizen으로 돌려 담당 범위를 지운다. 변경은 감사 기록과 같은 트랜잭션에 저장하고 기존 세션을 폐기한다. 관리 명령은 DB 관리 권한을 가진 운영자의 로컬 도구이며 공개 웹 API가 아니다. PGlite에서는 앱과 관리 명령이 같은 파일 DB를 동시에 열지 않도록 앱을 먼저 종료한다.

## API

일반 조회 결과와 인증 응답은 `Cache-Control: no-store`를 사용한다. 본인 조회는 요청의 사용자 ID·역할을 믿지 않고 DB 세션에서 계정을 확인한다.

| 메서드·경로 | 동작 | 조건·주요 응답 |
| --- | --- | --- |
| `GET /api/health` | DB 연결 확인 | 정상 200, 연결·설정 실패 503 |
| `GET /api/markets?q=` | 시장 이름 검색 | 익명 가능. 공백 제거 후 최대 100자, 최대 50건 |
| `GET /api/markets/{marketId}/stores?q=` | 해당 시장의 점포명·평소 품목 검색 | 없는 시장 404, 결과 없음은 빈 배열 |
| `GET /api/stores/{storeId}?marketId=` | 점포 상세 | 시장 맥락이 주어졌으나 불일치하면 404 |
| `GET /api/me` | 로그인한 본인 계정 | 미인증·변조·만료·로그아웃된 세션 401 |
| `GET, POST /api/cart` | 계정별 목록·중복 방지 추가 | 이름 NFKC·공백 정규화 |
| `PATCH, DELETE /api/cart/{id}` | 이름·체크·삭제 | 본인 항목과 version 검사 |
| `GET, PUT /api/draft` | 계정별 초안·복구 | 제출 후에도 version 증가 유지, 오래된 탭 덮어쓰기 방지 |
| `GET, POST /api/attachments` | 미제출 사진 복구·업로드 | multipart file + requestId, 실제 디코딩·EXIF 제거 |
| `GET, DELETE /api/attachments/{id}` | 비공개 사진·미제출 사진 삭제 | 작성자 또는 담당 운영자 조회, 상인 접근 거부 |
| `GET, POST /api/opinions` | 본인 목록·최종 제출 | idempotencyKey·원문/제출 내용·선택 draftVersion |
| `GET /api/opinions/{id}` | 시민 본인 상세 | 공개 허용 필드만 반환 |
| `POST /api/opinions/{id}/responses` | 추가 질문에 답변 | 같은 요청 재시도 허용, 자동 상태 변경 없음 |
| `GET /api/operator/opinions` | 담당 시장의 접수함 | 시장·상태·검색 필터 |
| `GET /api/operator/opinions/{id}` | 담당 운영자 상세 | 원문·사진·내부 이력·전달·답변 |
| `POST /api/operator/opinions/{id}/actions` | 확인·질문·전달·게시·정정·상태·후속 | version/requestId, 상태·이력 원자 저장 |
| `GET /api/merchant/transmissions[/{id}]` | 연결된 점포에 실제 전달된 요약 | 시민 원문·사진·내부 메모 제외 |
| `POST /api/merchant/transmissions/{id}/replies` | 입장·대안 또는 대안 없음 | version/requestId, 별도 운영자 게시 전 시민 비공개 |
| `POST /api/auth/sign-up/email` | 이름·이메일·비밀번호로 가입 | 비밀번호 12–128자. 초기 역할은 citizen |
| `POST /api/auth/sign-in/email` | 로그인과 세션 쿠키 발급 | 잘못된 인증 정보 401 |
| `POST /api/auth/sign-out` | 현재 세션 폐기 | 허용 원점에서 호출 |

인증의 나머지 기본 경로는 Better Auth가 처리한다. 역할 필드는 서버 소유이며 가입·수정 입력으로 상인·운영자 권한을 얻을 수 없다. 인증 요청에는 라이브러리의 CSRF·원점 검사와 DB 기반 요청 제한을 적용한다. 세션 쿠키는 HttpOnly이며 production에서는 Secure를 사용한다.

현재 이메일 발송·소유 확인·비밀번호 재설정은 연결하지 않았다. `emailVerified: false`를 반환하며 계정을 실제 시민·점포 관계 확인으로 설명하지 않는다. 외부 AI 생성 요청은 명시적으로 503을 반환하고 화면에서는 직접 작성으로 진행한다.

정확한 요청·반환 타입은 [HTTP 계약](../src/lib/contracts.ts)에 있다. 쓰기는 허용 Origin을 요구한다. 렌더링 당시 계정 ID를 `X-Teumgil-Account`로 보내 다른 탭에서 계정이 바뀐 뒤 이전 입력을 다른 계정에 저장하는 상황을 거부한다. 이 헤더는 추가 충돌 방지이며 실제 인증은 DB 세션으로 한다.

상태 변경과 처리 이력은 같은 트랜잭션에 저장한다. 최종 의견·운영자 작업·상인 답변·사진 업로드는 같은 요청 키로 재시도할 수 있다. 버전 충돌은 409이며 최신 내용을 읽고 재검토해야 한다. 결과 미확인을 성공으로 추정하지 않는다. 상세 조회는 동일 스냅샷에서 관련 데이터를 읽는다. 사진은 원본당 2MiB·최대 3개, 1,600만 픽셀·한 변 8,000px 상한과 처리 시간 제한을 검사해 최대 2,048px WebP로 변환하고 DB에 비공개로 저장한다.

### PowerShell에서 가입과 본인 조회

서버 실행 후 별도 터미널에서 가상 계정으로 확인할 수 있다.

```powershell
$body = @{ name = '개발용 시민'; email = 'citizen@example.invalid'; password = 'Local-example-password-42!' } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri 'http://localhost:3000/api/auth/sign-up/email' -ContentType 'application/json' -Body ([Text.Encoding]::UTF8.GetBytes($body)) -SessionVariable teumgilSession
Invoke-RestMethod -Uri 'http://localhost:3000/api/me' -WebSession $teumgilSession
```

점포 응답의 `isSample`은 가상 여부다. `usualItems`는 평소 품목이며 `checkedAt`, `inventory`, `price`가 null이면 확인 자료가 없다는 뜻이다. 가상 예제에 실제 주소·가격·확인 날짜를 채우지 않는다.

## 테스트와 CI

시연 CLI를 연속 실행해 로그인 요청 제한에 도달하면 서버가 안내한 시간만큼 기다린 뒤 최대 두 번 재시도한다. 등록된 세 계정의 로그인 확인이 끝난 뒤 가상 자료를 초기화하며, 실제 인증 제한은 유지한다.

`npm run verify`는 문서·ID·타입·린트·테스트·가상 기준 출력을 검사하고 `npm run build`는 Next.js 배포 빌드를 확인한다. 서비스 테스트는 실제 인증 라이브러리·DB를 사용한다. 계정 분리·세션·검색뿐 아니라 의견 공개 범위, 저장 실패 롤백, 동시 변경, 사진 검증과 권한 회수를 검사한다.

기본 테스트 DB는 메모리 PGlite다. 별도로 준비한 테스트 전용 PostgreSQL을 검증하려면 `TEUMGIL_TEST_DATABASE_URL`을 지정하고 `node --test tests/app/*.test.ts`를 실행한다. 이 테스트는 마이그레이션·가상 자료·테스트 계정을 실제로 저장한다. 운영 DB와 분리된 DB를 사용한다.

[CI](../.github/workflows/verify.yml)는 Ubuntu·Windows 기본 검증·빌드와 별도 PostgreSQL 검사를 구성한다. 이 작업에서 GitHub 원격 CI를 실행한 것은 아니다. 로컬의 실제 실행 결과와 한계는 [인수 기록](MVP_VERIFICATION.md)에 둔다.

브라우저 검사는 개발 서버와 `demo:init`을 준비한 뒤 `npm run test:e2e`로 실행한다. Playwright Chromium이 없으면 `npx playwright install chromium`을 먼저 실행한다. 실행기는 실행별 `.harness/playwright/runs/`에 결과를 남기며 최근 경로를 `last-run.json`에 기록한다. Windows에서 활성 trace의 파일 잠금을 피하기 위해 OS 임시 폴더에 먼저 기록하고, 종료 후 결과를 복사한 뒤 해당 임시 폴더를 제거한다. 스크린샷·trace에는 가상 계정 세션과 작성 내용이 포함될 수 있어 공개하거나 커밋하지 않는다. HTML 보고서는 `npm run test:e2e:report`로 연다. 같은 시연 계정을 쓰는 전체 여정은 동시에 실행하지 않는다.

## 구현 근거

- [Next.js 설치와 런타임](https://nextjs.org/docs/app/getting-started/installation)
- [Better Auth의 Next.js 통합](https://better-auth.com/docs/integrations/next), [서버 소유 추가 필드](https://better-auth.com/docs/concepts/database), [요청 제한](https://better-auth.com/docs/concepts/rate-limit)
- [Drizzle PostgreSQL](https://orm.drizzle.team/docs/get-started-postgresql), [PGlite 연결](https://orm.drizzle.team/docs/connect-pglite), [PGlite 파일 유지](https://pglite.dev/docs/)
