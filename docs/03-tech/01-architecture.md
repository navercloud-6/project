# 기술 구조 — 경기 하루이음

[문서 안내](../../README.md#문서-분류-기준)

## 아키텍처와 경계

Next.js App Router(Node.js)가 화면과 Route Handler API를 제공하고, 영속 데이터는 외부 PostgreSQL(운영은 NCP Cloud DB for PostgreSQL)에 저장한다. [기술 스택](../../README.md#기술-스택)과 [요구사항](../01-func/01-requirements.md)을 따른다.

헥사고날 아키텍처를 적용한다. 도메인이 모델·검증·편집 규칙을 소유하고 애플리케이션이 포트로 저장소·AI·날씨를 호출한다. 안쪽 계층은 Next.js·PostgreSQL·환경 변수·네트워크에 의존하지 않으며, 브라우저는 내부 `/api/*`만 호출하고 비밀 키는 서버에만 둔다.

## 소스 구조

| 경로 | 책임 |
| --- | --- |
| [app/](../../app/) · [components/](../../components/) | 화면과 HTTP Route Handler를 제공한다. |
| [lib/domain/](../../lib/domain/) | 카탈로그·Zod 계약·업무 규칙을 제공한다. |
| [lib/application/](../../lib/application/) | 유스케이스와 외부 포트를 정의한다. |
| [lib/adapters/](../../lib/adapters/) | PostgreSQL·NAVER·Open-Meteo·이미지·HTTP·브라우저 어댑터를 구현한다. |
| [lib/server.ts](../../lib/server.ts) | 어댑터를 유스케이스에 주입하는 조립 지점이다. |
| [data/](../../data/) · [public/places/](../../public/places/) | 정적 관광·지도 데이터와 사진을 보관한다. |
| [deploy/](../../deploy/) · [.github/workflows/](../../.github/workflows/) | 배포·모니터링·CI/CD를 구성한다. |
| [tests/](../../tests/) | 경계·단위·모의 연동·HTTP 검사를 제공한다. |

날씨 옷차림은 [outfit.ts](../../lib/domain/outfit.ts)의 순수 함수가 구간표·준비물 기준을 소유하고, [weather.ts](../../lib/domain/weather.ts)의 `buildWeatherOutfit`이 실시간·데모 응답에 같은 규칙으로 `outfit`을 붙인다.

탭 전환 뒤 유지할 상태는 [Tourpass](../../components/tourpass.tsx)가 소유하고, 탐색·날씨는 같은 장소 카드를 재사용하며 브라우저 취향은 [preferences.ts](../../lib/adapters/preferences.ts)가 검증·저장한다.

## 경기도 지역 선택 지도

[GyeonggiCityExplorer](../../components/gyeonggi-city-explorer.tsx)는 [지도 요구사항](../01-func/01-requirements.md#경기도-지역-선택-지도)을 구현하는 정적 SVG 탐색 컴포넌트다.

- [build_gyeonggi_map.py](../../scripts/build_gyeonggi_map.py)가 SGIS 기반 [vuski/admdongkor(2026-10-01)](https://github.com/vuski/admdongkor/tree/3bc00489b76696db864bdbea4b19985cdfa8b403/ver20261001) 원본의 SHA-256을 검증하고 경기도 31개 시·군 병합·단순화를 거쳐 [gyeonggi-map.json](../../data/gyeonggi-map.json)과 [라이선스](../../data/gyeonggi-map.LICENSE.txt)를 생성한다.
- 선택 상태는 `Tourpass`의 `selectedCityId`가 소유하며 기존 시흥 권역 필터(`region`)와 분리한다. 오른쪽 목록은 카탈로그의 `cityId`로 필터링하고, 지도 상단 날씨는 [WeatherSymbol](../../components/weather-symbol.tsx)을 공유한다.

## 네이버 지도와 관광 데이터

- [PlaceMap](../../components/place-map.tsx)은 [naver-map.ts](../../lib/adapters/naver-map.ts)로 Web Dynamic Map v3 SDK를 1회 로드하고 `navermap_authFailure`를 감지한다. `NAVER_MAP_CLIENT_ID`는 `force-dynamic` 홈에서 런타임 주입하며, 미설정·실패 시 경기도 투영 SVG로 폴백한다.
- [import-tourapi.ts](../../scripts/import-tourapi.ts)는 한국관광공사 `KorService2`를 수집해 시흥 20곳을 유지하고 타 시·군 관광지를 갱신한다. 공공누리 제1유형·`tong.visitkorea.or.kr` 사진만 허용하며, AI 추천 후보는 지역 필터 후 최대 40곳만 전달한다. 공개 사진은 Next.js Image로 WebP 최적화·지연 로딩한다.

## HTTP API 계약

상세 경로·스키마는 [OpenAPI 원본](../../lib/adapters/openapi.ts), [contracts.ts](../../lib/domain/contracts.ts), [assistant.ts](../../lib/domain/assistant.ts)에서 관리하며 실행 서버 `/api/docs`로 조회한다.

- [http.ts](../../lib/adapters/http.ts)는 세션, 변경 요청의 `Origin` 일치, JSON 본문 상한과 `{error}` 응답을 처리하고 도메인 오류 코드를 HTTP 상태로 변환한다.
- [images.ts](../../lib/adapters/images.ts)는 2MB·픽셀 수·형식을 검증해 JPEG로 재인코딩한다. [naver.ts](../../lib/adapters/naver.ts)는 HTTPS·30초 제한·리다이렉트 차단·응답 스키마 검사를 적용하며 OCR은 `https://*.apigw.ntruss.com`만 허용한다.
- [naver-login.ts](../../lib/adapters/naver-login.ts)는 Authorization Code 흐름으로 동일인 식별자만 조회한다(CLOVA Voice 키와 분리, 고정 `APP_ORIGIN` 콜백). 개인정보 정책은 [요구사항](../01-func/01-requirements.md#세션개인정보사용-제한), 앱 등록은 [배포 가이드](../05-ops/01-deploy.md#네이버-로그인)를 따른다.

## 데이터 저장과 동시성

[postgres.ts](../../lib/adapters/postgres.ts)는 `pg` 풀(`DATABASE_URL`)을 사용하고 첫 요청 시 `pg_advisory_xact_lock` 안에서 6개 테이블(`sessions`, `journeys`, `limits`, `photos`, `account_sessions`, `oauth_states`)을 멱등 초기화한다.

기록·편집·사진·로그인 이전은 `AsyncLocalStorage` 트랜잭션과 `FOR UPDATE` 행 잠금으로 소유권·리비전·보호 정책을 검사하고 새 UUID 리비전을 발급한다. 사진은 `(journey, place)` 고유 제약을 두고, 요청 한도는 `INSERT ... ON CONFLICT DO UPDATE RETURNING`으로 원자 증가한다.

## 운영 모니터링

별도 Docker 컨테이너(Prometheus·Grafana·Node Exporter·Blackbox Exporter)가 호스트 자원과 로컬 앱·Apache HTTP 응답을 수집하며 모든 포트는 루프백에만 바인딩한다. 설정·접속은 [배포 가이드](../05-ops/01-deploy.md#운영-모니터링)를 따른다.

## 남은 작업과 리스크

| 항목 | 대기 이유 | 재개 조건·작업 |
| --- | --- | --- |
| NAVER 실키 검증 | 실키가 없어 모의 계약만 검증했다. | 키 주입 후 권한·품질·지연·과금을 실측한다. |
| HTTPS | 도메인 없이 HTTP 공개 접속만 확인했다. | 도메인 확보 후 [배포 가이드](../05-ops/01-deploy.md)에 따라 HTTPS를 적용한다. |
| 관광 자료·사진 | 검토 전(`DRAFT`) 스냅샷이다. | 외부 배포 전 운영 정보와 사진 라이선스를 재검토한다. |
| 상용·수평 확장 | 사진은 DB `BYTEA`에 저장하고 단일 서버로 운영한다. | 전환 시 Object Storage·계정 삭제·다중 인스턴스 로드밸런싱을 도입한다. |
