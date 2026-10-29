# README 레퍼런스 분석과 틈길 적용

조사일: 2026-10-29. 프로젝트의 문제 영역이 가까운 개발팀의 실제 GitHub README 세 편과 GitHub 공식 안내를 비교했다. 분석 범위는 README의 구성과 설명 방식이다. 해당 제품의 설치·실행·성능 검증은 수행하지 않았다.

## 조사 대상과 원문

| 자료 | 선택 이유 | 확인한 원문 |
| --- | --- | --- |
| mySociety FixMyStreet | 위치 기반 생활 불편 제보와 처리 주체 연결이라는 문제 영역이 가까움 | [README](https://github.com/mysociety/fixmystreet/blob/master/README.md) |
| Ushahidi Platform | 시민의 정보 수집·처리·지도 시각화, 저장소 역할 구분을 참고할 수 있음 | [README](https://github.com/ushahidi/platform/blob/develop/README.md) |
| StreetComplete | 지도에 익숙하지 않은 사람의 참여 과정을 설명하는 방식이 적합 | [README](https://github.com/streetcomplete/StreetComplete/blob/master/README.md) |
| GitHub 공식 안내 | 저장소 첫 방문자가 알아야 할 정보와 상세 문서 분리 기준 | [About READMEs](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-readmes) |

GitHub 파일 조회에서 확인한 README **파일 blob SHA**는 아래와 같다. 커밋 SHA나 릴리스 버전이 아니며, 위 브랜치 링크는 이후 변경될 수 있다.

- FixMyStreet: ef1c37ea971b5c627152a055cf3327f3d1178320
- Ushahidi: 1ad36c745b0ca5f5608feaff1e9a7f2ead3fb3f4
- StreetComplete: 1cc0dae28dcde019e023f4e6a3b13f6e5a349940

## 사례별 관찰과 적용 판단

### FixMyStreet: 첫 문장에서 실제 동작을 설명한다

README는 이용자가 위치와 문제를 입력하면 어떤 대상으로 제보가 전달되는지 설명하고, 설치·개발 명령·기여·실제 사용 사례로 이어진다. 문제의 추상적 중요성보다 사용자의 행동과 시스템의 결과를 먼저 설명한다. [원문](https://github.com/mysociety/fixmystreet/blob/master/README.md)

틈길에는 첫 부분에 시민 → 운영자 → 관련 상인 → 결과 확인의 흐름을 넣는다. 다만 FixMyStreet의 기관 자동 연결 기능을 틈길의 기능으로 가져올 수는 없다. 틈길의 내부 접수와 별도 공식 경로를 구별한다.

설치 세부 설명을 외부 문서에 연결한 방식은 참고하되, 틈길에서 현재 실행 가능한 명령은 README 안에서 바로 제공한다.

### Ushahidi: 제품과 이 저장소의 범위를 구분한다

본문은 정보 수집·지도 표시라는 제품 소개 다음에, 이 저장소가 REST API 백엔드이며 브라우저 클라이언트는 별도 저장소라는 점을 밝힌다. 빠른 실행 경로와 개발·사용자 문서를 나누고 기여 링크를 제공한다. [원문](https://github.com/ushahidi/platform/blob/develop/README.md)

틈길에도 제품 구상과 현재 들어 있는 파일을 구분하는 표를 둔다. 프런트엔드가 없는 하네스 저장소에서 앱 실행 명령을 안내하지 않는다.

참고한 README의 자동 테스트 안내에는 WIP 표기가 있다. 이를 그대로 모방하지 않고, 틈길에서는 존재하는 검증 명령과 검사 범위를 명시한다. 이 관찰은 README 본문에 관한 것이며 Ushahidi 전체 테스트 구현이 없다는 판정이 아니다.

### StreetComplete: 대상 이용자와 참여 장면을 구체적으로 보여 준다

README는 도메인 지식이 없는 사람도 할 수 있는 참여를 먼저 설명하고, 질문에 답하는 실제 사용 장면·화면 자료·다운로드·기여·라이선스로 이어진다. 개발 외 참여 경로도 구체적으로 제시한다. [원문](https://github.com/streetcomplete/StreetComplete/blob/master/README.md)

틈길에는 시민·상인·운영자의 목표와 하나의 가상 이용 흐름을 넣는다. 화면·문구·운영 흐름 검토도 기여 대상으로 안내한다.

현재 틈길에는 실제 앱·스크린샷·배포 데모가 없다. 다른 프로젝트의 이미지를 빌리거나 예시 이미지를 실제 화면으로 표시하지 않는다. 화면 자료는 실제 구현 후 추가한다. 후원·라이선스·출시 채널 역시 참고 프로젝트의 조건을 가져오지 않는다.

## 공통적으로 채택한 구성

GitHub 공식 안내는 프로젝트의 기능·유용성·시작 방법·도움받을 곳·관리 주체를 README의 주요 정보로 설명하고, 긴 상세 문서는 분리하도록 안내한다. 내부 파일은 상대 링크로 연결하는 방식을 권장한다. [공식 안내](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-readmes)

이를 틈길에 적용한 결과는 다음과 같다. 오른쪽은 사례에서 자동 도출된 정답이 아니라 현재 저장소 상태를 고려한 구성 판단이다.

| 독자의 질문 | README에서 답할 내용 | 상세 기준 문서 |
| --- | --- | --- |
| 무엇을 만드는가? | 프로젝트 소개·배경·대상 이용자 | PRODUCT_SCREENS |
| 사용자는 무엇을 하는가? | 주요 기능·하나의 이용 흐름 | 화면 상세·DATA_ACCESS |
| 지금 사용할 수 있는가? | 작성·검증한 것과 미구현 기능 | PLANS·실제 파일 |
| 어떻게 시작하는가? | 실행 전제와 실제 설치·검증 명령 | package.json·HARNESS |
| 무엇을 선택했는가? | 하네스 기술과 미선정 앱 스택 구분 | ARCHITECTURE·PLANS |
| 코드와 문서는 어디에 있는가? | 주요 폴더·질문별 문서 경로 | AGENTS |
| 무엇을 검증했는가? | 검증 범위와 결과 해석 | HARNESS·평가 사례 |
| 어떻게 참여하는가? | 이슈·변경 제안·PR에 필요한 정보 | AGENTS·ID_POLICY |
| 다음에 무엇을 하는가? | 구현 단계와 남은 결정 | PLANS |
| 누가 관리하고 어떤 조건으로 쓰는가? | 길이음팀과 라이선스 미정 상태 | 저장소의 실제 설정 |

## 기존 README에서 바꾼 점

기존 README는 개발 문서를 찾는 데는 유용했지만, 처음 방문한 사람이 제품을 이해하기에는 소개와 이용 흐름이 짧았다. 반대로 개발자는 모든 문서 링크의 역할을 스스로 해석해야 했다.

개편에서는 다음을 적용했다.

1. 제품의 목적과 실제 이용 흐름을 앞에 두고, 현재 단계는 한 번에 확인할 수 있게 정리한다.
2. 주요 기능을 구현된 것으로 쓰지 않고 설계 범위로 표시한다. 실행 가능한 부분은 별도 시작 안내로 연결한다.
3. 하네스 기술을 앱 스택으로 승격하지 않는다. API 키 없이 실행되는 검사와 실제 AI 평가를 구분한다.
4. 화면·데이터·디자인·기술 결정의 상세 내용을 복사하지 않고 기준 문서로 연결한다.
5. 검증 성공 배지·성과 수치·앱 화면·라이선스 등 없는 증거를 장식으로 추가하지 않는다.
6. 기여자는 명세 ID와 재현 조건을 사용해 논의하게 한다. 실제 사용자 정보는 이슈 자료로 요구하지 않는다.

## 작성 후 점검

[README](../README.md)의 모든 실행 명령을 실제 package.json과 대조하고 로컬 기본 검증을 실행한다. 문서 링크·명세 ID를 검사하며, 로컬 검사와 GitHub CI·앱·실제 모델·현장 효과를 구별한다.

README는 제품의 입구이고 상세 명세를 대체하지 않는다. 앱 구현·배포·기술 선택·라이선스가 바뀌면 현재 상태와 시작 방법을 먼저 갱신한다.
