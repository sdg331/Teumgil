# 틈길 모션 계약

2026-10-29 · 승인된 디자인 방향을 구현하기 위한 시작값이다. 아래 수치는 **틈길의 설계 제안**이며 토스의 측정값·WCAG 필수 시간·검증된 성능 수치가 아니다. 실제 화면에서 거리·빈도·기기 성능을 보고 조정한다. 기능과 상태의 의미는 [제품 명세](../PRODUCT_SCREENS.md), 저장·공개는 [데이터 계약](../DATA_ACCESS.md)이 우선한다.

## 목적과 공통값

모션은 누른 대상, 바뀐 영역, 작업 결과를 이해하게 한다. 입력을 늦추거나 저장·확인 사실을 대신 만들지 않는다. 긴 대기 시간을 장식으로 채우지 않는다.

| 토큰 | 시작값 | 쓰임 |
| --- | --- | --- |
| instant | 0ms | 모션 줄이기, 긴급한 오류·초점 이동 |
| feedback | 150ms | 눌림·체크·작은 색 변화 |
| content | 200ms | 짧은 화면 진입·목록 높이 변화 |
| panel-enter | 300ms | 보조 패널 열기 |
| panel-exit | 200ms | 패널 닫기 |
| enter | cubic-bezier(0, 0, .2, 1) | 감속하며 자리 잡기 |
| exit | cubic-bezier(.4, 0, 1, 1) | 짧게 빠져나가기 |

한 컴포넌트에 필요한 속성만 지정하고 `transition: all`을 쓰지 않는다. 보통 transform·opacity를 사용한다. 최초 콘텐츠를 JS 애니메이션 성공에 의존해 숨기지 않는다. 레이아웃 애니메이션은 해당 묶음에 한정하며 본문 텍스트나 폼 전체가 늘어나 보이지 않게 확인한다.

## 상호작용별 계약

| 이름 | 시작·정상 동작 | 중단·실패·초점 | 모션 줄이기 |
| --- | --- | --- | --- |
| press | 누른 버튼만 최대 scale .98, 해제 시 150ms 복귀. 체크·작은 아이콘에는 과도한 축소 금지 | 키보드에도 같은 기능. pending은 중복 요청을 막되 이유를 보임 | 크기 변화 제거, 색·테두리와 초점 유지 |
| route | 새 주 콘텐츠가 최대 8px 아래에서 200ms 등장. 공통 탭·검색 셸은 유지 | 뒤로가기의 스크롤·입력 복원. 빠른 이동은 취소·최신 화면 우선. 새 페이지 제목으로 초점 안내 | 이동·크기 변화 제거. 즉시 표시 또는 100ms 이내 opacity |
| sheet | 보조 선택 패널 300ms 진입·200ms 퇴장, 배경 opacity 별도 | Esc·닫기, 초점 가두기·복원, 배경 비활성. 드래그만으로 닫게 하지 않음. 긴 폼은 별도 화면 | 즉시 열고 닫아도 초점·닫기·스크롤 잠금 동일 |
| list | 실제 추가·삭제 후 주변 행 위치를 200ms 연결. ID를 key로 사용 | 실패한 추가 입력 유지. 삭제 복구는 실제 복구 가능할 때만. 길게 순차 등장시키지 않음 | 행을 즉시 갱신, 변화 내용은 텍스트·live region |
| check | 선택 즉시 작은 체크 피드백 150ms, 완료 표시. 생성 순서 고정 | 낙관 반영은 서버 응답·요청 버전과 연결. 실패 시 실제값 복구+설명. 연속 변경의 마지막 의도 보존 | 체크·텍스트 상태 즉시 변경. 체크 이동·튀기기 없음 |
| validation | 오류 설명을 해당 입력에 연결. 제출 오류 요약과 첫 오류 초점 | 입력을 지우거나 흔들림·색만으로 설명하지 않음. 시각 효과가 없어도 원인·복구 경로 보임 | 같은 이름표·오류·초점 동작, 이동 효과 없음 |
| draft | 실제 요청 중 처리 안내, 완료 후 검토 영역을 200ms 표시 | 가짜 타이핑·진행률·예상 시간 금지. 취소·재시도에서 원문 보존. 오래된 응답이 새 입력 덮어쓰지 않음 | 본문 즉시 표시, 처리 안내는 정적 텍스트 |
| receipt | 실제 저장된 번호·시각을 받은 뒤 확인 표시를 200ms 등장 | 결과 미확인은 성공 모션 금지. 중복 제출 방지. 새로고침은 조회 | 정적 확인 표시. 상태·번호·다음 행동 그대로 |
| timeline | 저장된 새 기록만 최대 4px·200ms 등장. 과거 이력은 다시 움직이지 않음 | 비공개 원문을 모션용 DOM·페이로드에 넣지 않음. 정정은 새 기록 | 새 기록 즉시 표시, 새 내용 존재를 텍스트로 알림 |
| filter | 선택 표식 150ms. 결과 영역은 고정된 틀로 갱신 | 검색창·초점 유지, 이전 요청 취소/무시. 스켈레톤 크기는 실제 행과 일치. 응답 속이기 위한 최소 대기 금지 | shimmer·펄스 제거, 정적 로딩 안내 |

로딩을 무한 반복하는 장식으로 표현하지 않는다. 회전 표시가 있다면 정적 처리 안내를 함께 제공하고, 모션 줄이기에서는 회전을 제거한다. 요청 실패·연결 복구·재시도는 애니메이션 종료 시점에 종속시키지 않는다.

## 화면 연결

| 화면 | 주요 모션 | 확인할 장면 |
| --- | --- | --- |
| [S01](../screens/DISCOVERY.md) | route, press | 검색 진입·장보기 이어보기 |
| [S02](../screens/DISCOVERY.md) | filter, sheet | 빠른 검색 변경·점포 선택·패널 닫기 |
| [S03](../screens/DISCOVERY.md) | press, list | 담기·중복·실패 후 재시도 |
| [S04](../screens/SHOPPING.md) | check, list, validation | 연속 체크·이름 수정·삭제 실패 |
| [S05](../screens/OPINION_SUBMISSION.md) | validation, sheet | 키보드·위치 선택·사진 실패 |
| [S06](../screens/OPINION_SUBMISSION.md) | draft, validation | AI 실패·직접 작성·느린 응답 중 편집 |
| [S07](../screens/OPINION_SUBMISSION.md) | receipt | 실제 저장·결과 미확인·새로고침 |
| [S08](../screens/OPINION_OPERATIONS.md) | filter, route | 목록에서 상세 왕복·로그인 만료 |
| [S09](../screens/OPINION_OPERATIONS.md) | timeline, validation | 추가 응답·새 시민용 게시 |
| [S10](../screens/OPINION_OPERATIONS.md) | filter, route | 담당 시장·상태 필터·목록 오류 |
| [S11](../screens/OPINION_OPERATIONS.md) | sheet, timeline, validation | 전달 미리보기·동시 수정·정정·재개 |
| [S12](../screens/OPINION_OPERATIONS.md) | filter, route | 새 전달과 답변 여부 |
| [S13](../screens/OPINION_OPERATIONS.md) | validation, press | 대안 없음·저장 실패·답변 정정 |

## 구현과 검증

CSS로 충분한 눌림·초점은 CSS로 구현한다. React 목록·패널에 Motion이 필요하면 현재 호환 버전을 확인해 설치하고 공통 토큰·동작 줄이기 처리를 한 곳에 둔다. [Motion layout](https://motion.dev/docs/react-layout-animations)의 `layout`·`layoutId`, [useReducedMotion](https://motion.dev/docs/react-use-reduced-motion), [접근성 안내](https://motion.dev/docs/react-accessibility)를 필요한 부분만 참고한다. 전체 서버 화면을 모션 때문에 클라이언트 컴포넌트로 바꾸지 않는다.

동작 줄이기는 프로젝트 필수 기준이다. [WCAG 2.3.3 설명](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html)은 AAA 항목이며 모든 150ms·200ms 값을 규정하지 않는다. 프로젝트 터치 목표 44px도 모든 상황의 WCAG AA 최소값으로 설명하지 않는다.

구현 뒤 다음 근거를 남긴다. 이는 아직 실행된 제품 검사 목록이 아니다.

1. 장보기 체크·패널·제출 결과·새 이력을 일반 설정과 `reducedMotion: reduce`에서 각각 관찰한다. 단순 화면 캡처에 더해 프레임·브라우저 trace로 시작·중간·끝과 중단을 확인한다.
2. 키보드로 열기·이동·제출·Esc·초점 복원을 수행한다. 브라우저 자동 접근성 검사와 수동 초점·200% 확대 검사를 함께 사용한다.
3. 느린 응답·실패·연속 클릭·응답 순서 역전에서 저장과 화면이 일치하는지 확인한다. 요청 성공 이전의 성공 표시, 이중 제출, 오래된 응답의 덮어쓰기를 검사한다.
4. 성능 목표는 LCP 2.5초 이하·INP 200ms 이하·CLS .1 이하를 참고하되 실제 측정 환경·값과 구분한다. [Web Vitals 기준](https://web.dev/articles/vitals)은 현장 분포의 기준이므로 로컬 Lighthouse만으로 현장 통과를 선언하지 않는다. 저성능 프로필의 긴 작업·프레임 저하는 별도로 기록한다.
5. 모션 효과를 꺼도 모든 정보·권한·행동이 유지되는지 확인한다. 실패한 항목은 수정하거나 정확한 원인·영향을 남기며, 기능을 숨겨 통과시키지 않는다.
