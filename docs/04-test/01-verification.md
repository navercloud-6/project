# 테스트 명세 — 경기 하루이음

[문서 안내](../../README.md#문서-분류-기준)

## 검증 전략

[tests/](../../tests/)의 단위·모의 연동, 프로덕션 HTTP, 브라우저 핵심 흐름으로 검증한다. 실행 명령은 [README](../../README.md#테스트), 완료 기준은 [요구사항](../01-func/01-requirements.md#완료-기준)을 따른다.

- **API·외부 연동**: 세션·CSRF·소유권·리비전 충돌·기록/사진/행사 날짜 보호·요청 한도와 NAVER 모의 계약을 검사한다.
- **날씨**: 31개 시·군 좌표·5일 예보·같은 도시 추천, 지도 캐시·동시 요청·오류·시연 구분과 도시 전환 시 이전 자료 숨김·선택 콜백을 검사한다.

## 화면 검증

1365px·390px에서 탐색·경기도 지도·편집·내 여행·도우미·날씨·프로필·모달·하단 메뉴의 가로 넘침과 조작을 확인한다. 참고 화면은 [데스크톱](../screenshots/desktop.jpg)·[모바일](../screenshots/mobile.jpg)이다.

## 최신 판정

2026-11-21(Asia/Seoul), Windows 11(Node.js 26·PostgreSQL 17)에서 `main`(지도 날씨 PR #12 포함)과 옷차림 기능을 통합한 뒤 확인한 최신 결과다. 이전 PR에서 수행한 운영·DB·화면 검증은 이번 실행에서 재검증하지 않았다.

| 검사 | 최신 결과 |
| --- | --- |
| 단위·모의 연동 65개 | 로컬 PostgreSQL 17의 임시 스키마(`test_*`) 격리 환경에서 모두 통과했다. 옷차림 검사 7개는 8개 구간의 경계 양쪽, 준비물 기준(강수 60%·풍속 8m/s·체감 0°C·최저 -5°C·일교차 8°C·28°C 맑음)의 등호 양쪽, 해안 시·군 문장, 같은 입력의 같은 결과, 전체 지역 데모 응답을 확인한다. |
| 서식·타입·빌드·문서 | `format:check`, `typecheck`, `build`, `git diff --check`를 통과했다. `check_docs.py`는 Windows 경로 구분자 제약으로 로컬에서 판정하지 않았고, PR CI(Linux)의 문서 검사로 확인한다. |
| 날씨 프로덕션 HTTP | `tests/city-weather-http.mjs`로 수원·시흥·가평의 현재 날씨와 5일 예보가 실제 `live` 응답임을 확인했다(PR #12 작성 시). 기본 도시·10분 캐시·잘못된 ID·메타데이터·OpenAPI 검사도 통과했다. |
| 옷차림 실데이터 | 실제 Open-Meteo 응답으로 수원·시흥·가평(최고 0.4~1.7°C, 최저 -7.6~-5.6°C)의 옷차림·준비물 문장을 확인했다. 영상 이상 기온·비·눈의 실데이터는 미확인이며 모의 입력으로만 검사했다. |
| 프로덕션 HTTP (이전 검증) | `tests/http.mjs`, `tests/extensions-http.mjs`, `tests/auth-http.mjs`를 테스트 PostgreSQL 서버에서 통과했다(실제 네이버 로그인 미호출). |
| 배포 스크립트 (이전 검증) | `tests/acg_test.py`, `tests/deploy_test.py`(6개)와 `deploy/deploy-container.sh` 문법 검사를 통과했다. |
| 운영 이관·모니터링 (이전 검증) | NCP Cloud DB for PostgreSQL 17.11 이관(데이터 SHA-256 일치), `223.130.161.104` 외부 응답 200, Prometheus 5개 대상 UP·Blackbox `probe_success=1`을 확인했다. |
| 데이터·화면·사진 (이전 검증) | TourAPI 609곳(시흥 20 + 30개 시·군 589, 사진 456장) 수집, 경계 SHA-256·31개 시·군 정합성, 사진 WebP 약 89% 절감, 390px·1365px 기본 조작을 확인했다. |
| 미확인 | 통합 화면의 실제 브라우저 조작은 사용자 확인 대기다. HTTPS, NAVER 실키(Maps·로그인 포함), 호스트 재부팅·DB 백업 복원, GitHub Actions CD의 PostgreSQL 서비스 컨테이너 실실행은 미확인이다. |

미확인 항목과 후속 조건은 [남은 작업과 리스크](../03-tech/01-architecture.md#남은-작업과-리스크)를 따른다.
