# 테스트 명세 — 경기 하루이음

[문서 안내](../../README.md#문서-분류-기준)

## 검증 전략

[tests/](../../tests/)의 단위·모의 연동, 프로덕션 HTTP, 브라우저 흐름으로 검증한다([실행 명령](../../README.md#테스트), [완료 기준](../01-func/01-requirements.md#완료-기준)).

- **API·연동**: 세션·CSRF·소유권·리비전 충돌·보호 정책·한도·캐시 병합과 NAVER·기상청 모의 계약을 검사한다.
- **추천·날씨 HTTP**: 실제 카탈로그 기준 추천 상한(3곳)·지역 불일치 `400`, 31개 시·군 좌표·예보·캐시·시연 구분·도시 전환 숨김을 확인한다.

## 화면 검증

1365px·390px에서 전체 탭·모달·하단 메뉴의 가로 넘침과 조작을 확인한다([데스크톱](../screenshots/desktop.jpg)·[모바일](../screenshots/mobile.jpg)).

## 최신 판정

2026-11-21(Asia/Seoul) 기준 최신 결과다(CI 이력은 [GitHub Actions](https://github.com/navercloud-6/project/pull/19/checks) 참조).

| 검사 | 최신 결과 |
| --- | --- |
| 정적·빌드·문서 | 로컬에서 `format:check`, `typecheck`, `build`, `check_docs.py`를 통과했다. |
| 단위·모의 연동 | 로컬 PostgreSQL 임시 스키마에서 `npm test` 114개가 통과했다(경계·AI·날씨·통합 안내·맛집·특보·캐시 병합·만료 정리). |
| 라벨 데이터 | 609곳(CLOVA 568 + 수동 보정 41)의 스키마·검색 회귀·재라벨링 보정 유지 검사를 통과했다. |
| 프로덕션 HTTP | AI 키 없는 로컬 서버에서 `http.mjs`, `extensions-http.mjs`, `city-weather-http.mjs`를 통과했다(이전 병합 기준). |
| 실키·실데이터 | CLOVA 추천(Reranker·HCX-005), 수원 맛집 5곳, 통합 안내(HCX·nara/Papago·clara), 수원·시흥·가평 실날씨를 확인했다. |
| 브라우저·배포 | 1365px·390px AI 검색·상세창 넘침 없음(이전 병합 기준), 배포 Python 6개·셸 문법·NCP DB 이관·모니터링을 확인했다. |
| 미확인 | 최신 `main` 통합 화면 브라우저 재검증, HTTPS, Maps·로그인·OCR·이미지 실키, 반복 질의 품질·지연·과금, 재부팅·DB 복구, CD PostgreSQL 실실행은 미확인이다. |

후속 조건은 [남은 작업과 리스크](../03-tech/01-architecture.md#남은-작업과-리스크)를 따른다.
