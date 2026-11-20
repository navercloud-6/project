# 테스트 명세 — 경기 하루이음

[문서 안내](../../README.md#문서-분류-기준)

## 검증 전략

[tests/](../../tests/)의 단위·모의 연동 검사와 프로덕션 HTTP 검사, 브라우저 핵심 흐름으로 검증한다. 실행·DB 분리는 [README](../../README.md#테스트), 완료 기준은 [요구사항](../01-func/01-requirements.md#완료-기준)을 따른다.

## 화면 검증

1365px·390px에서 탐색·지도·편집·내 여행·도우미·날씨·마이·모달·하단 메뉴의 가로 넘침과 조작을 확인한다.

## API·외부 연동 검증

세션·CSRF·입력 검증·소유권·리비전 충돌·기록/사진 보호·행사 날짜 보호·요청 한도를 검사한다. NAVER 연동은 요청 계약과 성공·오류·거부·키 미설정 응답을 모의 검증한다.

## 최신 판정

2026-11-20(Asia/Seoul), macOS의 Node.js 24·PostgreSQL 16에서 PostgreSQL 전환 PR #8을 네이버 지도 PR #5·TourAPI 관광지 확장 PR #6과 통합한 뒤 단위(43개)·서식·타입·프로덕션 빌드·문서 검사를 통과했다. 운영 NAVER Cloud Platform Cloud DB for PostgreSQL 17.11(`tourpass-pg`) 이관·실서버 배포, HTTP 기본/확장/로그인과 배포 스크립트 결과는 PR #8 작성 시 확인한 결과다. TourAPI 실제 수집·HTTP는 PR #6 작성 시 확인한 결과이며, 그 밖의 화면·사진·모니터링 결과는 이전 검증으로 이번에 재실행하지 않았다.

| 검사 | 결과·범위 |
| --- | --- |
| 단위·모의 연동 43개 | 임시 PostgreSQL 스키마(`test_*`) 격리 환경에서 모두 통과했고 종료 후 임시 스키마 잔여 0건을 확인했다. 헥사고날 경계 검사에서 `app/`·도메인·유스케이스의 `pg`·`adapters/postgres` 비의존, 비동기 저장소 포트, PostgreSQL 트랜잭션 커밋/롤백, 기존 세션 테이블 유지와 계정 이전, 요청 한도를 확인했다. 지도 검사 3개는 `NAVER_MAP_CLIENT_ID` 정규화·SDK URL·외부 검색 URL, 키 유무에 따른 네이버 지도/SVG 폴백 전환, SDK 중복 로드 방지·인증 실패 전파를 확인한다. 관광 데이터 검사는 수집 자료의 코드·주소·좌표 일치, 사진 유형·호스트 제한, 신규 장소 저장·혼합 도시 코스 투영, AI 후보 상한을 확인한다. |
| 서식·타입·빌드 | `npm run format:check`, `npm run typecheck`, `npm run build`를 통과했다. |
| 프로덕션 HTTP 기본·확장 | 로컬 PostgreSQL(`tourpass_test`)에 연결한 프로덕션 서버(`127.0.0.1:3100`)에서 `tests/http.mjs`·`tests/extensions-http.mjs`를 모두 통과했다(PR #8 작성 시). 세션·CSRF·소유권·추천·날씨·OpenAPI·Scalar, 여행 편집·충돌·사진·기록 보호·키 미설정·행사 저장을 확인했다. |
| 네이버 로그인 HTTP | 로컬 PostgreSQL에 연결한 프로덕션 서버(`127.0.0.1:3102`, 더미 로그인 키)에서 `tests/auth-http.mjs`를 통과했다. 인증 URL·쿠키·Origin 차단·콜백 실패/취소·state 재사용 차단·로그아웃 후 이전 쿠키의 401을 확인했다. 네이버 실제 로그인은 호출하지 않았다. |
| 배포 스크립트 | Python 모의 검사 6개(`tests/acg_test.py`, `tests/deploy_test.py`)와 `deploy/deploy-container.sh` Bash 문법 검사를 통과했다. |
| 운영 Cloud DB 전환·이관 | NCP Cloud DB for PostgreSQL 17.11(`147050143`, Stand Alone, VPC 사설 도메인 전용, ACG `421497`에서 앱 서버 ACG `413093`의 5432 포트만 허용, 일일 자동 백업 7일)을 생성했다. 기존 SQLite 컨테이너 중지 후 스냅샷에서 `sessions` 21건·`journeys` 5건·`limits` 7건·`photos` 0건을 이관하고 `journeys` SHA-256 일치를 확인했다. |
| 운영 서버·외부 공개 | `223.130.161.104`에서 새 Docker 이미지(`siheung-tourpass:pg-migration`)로 교체했고 외부 `GET /`, `GET /api/session`, `POST /api/session`, `GET /api/journeys`가 모두 200을 반환하며 PostgreSQL에 새 세션이 저장됨을 확인했다. Prometheus Blackbox `probe_success`가 앱·Apache 모두 1임을 확인했다. |
| 문서·패치 | `python3 .github/scripts/check_docs.py`와 `git diff --check`를 통과했다. |
| TourAPI 실제 수집·HTTP | 기존 시흥 20곳을 유지하고 다른 30개 시·군의 589곳을 추가해 총 609곳을 저장했다. 신규 사진 456장은 공공누리 제1유형이다. 일시 호출 실패 뒤 캐시를 재사용해 완료했으며 수집 실패 시 기존 카탈로그가 유지됐다. 별도 임시 DB의 수원·가평 여행 저장·조회·방문 기록, 수원 지역 데모 추천, 공식 사진의 128px 최적화 응답 200과 페이지·Git 대상 파일에 인증키가 없는 것을 확인했다. |
| 지도 날씨 표시 | 정적 렌더에서 기본 해 아이콘·10°C·예시 안내, 아이콘 아래 기온과 지도 아래 북쪽 표시의 순서, 6종 아이콘 렌더를 확인했다. 실제 날씨 API는 지도 표시와 연결하지 않았다. |
| 경기도 경계 데이터 | 고정한 원본 SHA-256, 31개 시·군 병합과 공유 경계 정합성을 생성 단계에서 확인했다. 브라우저는 생성된 정적 SVG 데이터를 사용한다. |
| 경기도 화면·조작 | 사용자가 기본 화면의 정상 동작을 확인했다. 자동 브라우저의 로컬 접속은 시간 초과였으며 새 레이아웃의 1365px·390px, 키보드·초점·상세·담기·탭 복귀는 자동 실화면으로 확인하지 못했다. |
| 관광 사진 | 공개 사진 18장의 640px WebP 응답이 모두 200이고 합산 용량이 7,617,584바이트에서 860,696바이트로 약 89% 줄어든 것을 이전 검증에서 확인했다. |
| 화면·조작 | 390px·1365px 핵심 조작·가로 넘침·브라우저 경고 없음은 이전 검증에서 확인했다. |
| 운영 모니터링 | 2026-11-17 Prometheus·Grafana·Node Exporter·Blackbox Exporter 설치와 5개 대상 UP·대시보드 6개 패널을 확인했다. 호스트 재부팅·장기 보관·알림 전송은 검증하지 않았다. |
| 미확인 | HTTPS·NAVER 실키(Maps 포함)·호스트 재부팅·PostgreSQL 장애 복구(자동 백업 복원)·GitHub Actions CD의 PostgreSQL 서비스 컨테이너 실실행을 확인하지 않았다. 네이버 로그인 실계정·검수·운영 배포와 전환 후 실브라우저 전체 화면 흐름은 별도 확인이 필요하다. 실제 `NAVER_MAP_CLIENT_ID`를 주입한 네이버 지도 타일·마커·폴리라인과 신규 관광지의 데스크톱·모바일 실화면은 확인하지 않았다. |

화면 참고 자료는 [데스크톱 탐색](../screenshots/desktop.jpg)과 [모바일 여행 확인](../screenshots/mobile.jpg)이다. 실키·배포 등 미확인 항목은 [남은 작업과 리스크](../03-tech/01-architecture.md#남은-작업과-리스크)를 따른다.
