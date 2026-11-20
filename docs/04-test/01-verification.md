# 테스트 명세 — 경기 하루이음

[문서 안내](../../README.md#문서-분류-기준)

## 검증 전략

[tests/](../../tests/)의 단위·모의 연동, 프로덕션 HTTP, 브라우저 핵심 흐름으로 검증한다. 실행 명령은 [README](../../README.md#테스트), 완료 기준은 [요구사항](../01-func/01-requirements.md#완료-기준)을 따른다.

- **API·외부 연동**: 세션·CSRF·소유권·리비전 충돌·기록/사진/행사 날짜 보호·요청 한도와 NAVER 모의 계약을 검사한다.

## 화면 검증

1365px·390px에서 탐색·경기도 지도·편집·내 여행·도우미·날씨·마이·모달·하단 메뉴의 가로 넘침과 조작을 확인한다. 참고 화면은 [데스크톱](../screenshots/desktop.jpg)·[모바일](../screenshots/mobile.jpg)이다.

## 최신 판정

2026-11-20(Asia/Seoul), macOS(Node.js 24·PostgreSQL 16) 기준 최신 결과다. 운영 Cloud DB 이관·실서버 배포·HTTP·TourAPI 수집·화면·사진·모니터링은 이전 PR 검증 결과이며 이번 실행에서 재검증하지 않은 항목은 별도 표기한다.

| 검사 | 최신 결과 |
| --- | --- |
| 단위·모의 연동 43개 | 임시 PostgreSQL 스키마(`test_*`) 격리 환경에서 모두 통과했고 종료 후 잔여 스키마 0건을 확인했다. |
| 서식·타입·빌드·문서 | `format:check`, `typecheck`, `build`, `check_docs.py`, `git diff --check`를 통과했다. |
| 프로덕션 HTTP (이전 검증) | `tests/http.mjs`, `tests/extensions-http.mjs`, `tests/auth-http.mjs`를 테스트 PostgreSQL 서버에서 통과했다(실제 네이버 로그인 미호출). |
| 배포 스크립트 (이전 검증) | `tests/acg_test.py`, `tests/deploy_test.py`(6개)와 `deploy/deploy-container.sh` 문법 검사를 통과했다. |
| 운영 이관·모니터링 (이전 검증) | NCP Cloud DB for PostgreSQL 17.11 이관(데이터 SHA-256 일치), `223.130.161.104` 외부 응답 200, Prometheus 5개 대상 UP·Blackbox `probe_success=1`을 확인했다. |
| 데이터·화면·사진 (이전 검증) | TourAPI 609곳(시흥 20 + 30개 시·군 589, 사진 456장) 수집, 경계 SHA-256·31개 시·군 정합성, 사진 WebP 약 89% 절감, 390px·1365px 기본 조작을 확인했다. |
| 미확인 | HTTPS, NAVER 실키(Maps·로그인 포함), 호스트 재부팅·DB 백업 복원, GitHub Actions CD의 PostgreSQL 서비스 컨테이너 실실행, 신규 지도·관광지의 자동 실브라우저 전체 흐름은 미확인이다. |

미확인 항목과 후속 조건은 [남은 작업과 리스크](../03-tech/01-architecture.md#남은-작업과-리스크)를 따른다.
