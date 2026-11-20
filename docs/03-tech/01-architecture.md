# 기술 구조 — 경기 하루이음

[문서 안내](../../README.md#문서-분류-기준)

## 아키텍처와 경계

Next.js App Router(Node.js) 프로세스가 화면과 Route Handler API를 제공하며, 영속 데이터는 외부 PostgreSQL(운영은 NAVER Cloud Platform Cloud DB for PostgreSQL)에 저장한다. 별도 Spring 백엔드는 없다. [기술 스택](../../README.md#기술-스택)과 [업무 정책](../01-func/01-requirements.md)을 따른다.

헥사고날·클린 아키텍처로 구성한다. 도메인은 업무 모델·검증·편집 규칙을 소유하고 애플리케이션은 포트로 저장소·AI·날씨를 호출한다. 외부 구현은 안쪽 계층에 주입하며 도메인과 유스케이스는 Next.js·PostgreSQL·환경 변수·네트워크에 의존하지 않는다. AI 포트는 추천·안내·편집·일기·포스터의 타입이 정해진 입력과 결과를 주고받는다. 공급자별 프롬프트·도구 호출·이미지 인코딩·모델 선택·응답 파싱은 어댑터가 맡으며, 유스케이스는 지역·출처·소유권 등 업무 정책을 검사한다. 날씨 도메인은 포트에서 얻은 기준 시간을 인자로 받아 같은 입력에 같은 결과를 반환한다. 브라우저는 내부 `/api/*`만 호출하고 외부 인증 키는 서버에만 둔다.

## 소스 구조

| 경로 | 책임 |
| --- | --- |
| [app/](../../app/) · [components/](../../components/) | 화면과 HTTP 입력 어댑터를 제공한다. 라우트는 요청 검증·세션·응답 변환을 맡는다. |
| [lib/domain/](../../lib/domain/) | 카탈로그·계약·업무 규칙을 제공한다. |
| [lib/application/](../../lib/application/) | 유스케이스와 외부 의존성의 포트를 정의한다. |
| [lib/adapters/](../../lib/adapters/) | PostgreSQL·NAVER·Open-Meteo·이미지·Next.js HTTP·브라우저 요청을 구현한다. |
| [lib/server.ts](../../lib/server.ts) | 구체 어댑터를 유스케이스에 연결하는 조립 지점이다. |
| [data/places.json](../../data/places.json) · [public/places/](../../public/places/) | 관광 자료·사진을 보관한다. |
| [deploy/](../../deploy/) · [.github/workflows/](../../.github/workflows/) | 배포·자동 검사를 구성한다. |
| [tests/](../../tests/) | 의존성 경계·포트 대역 단위 검사·모의 연동·HTTP 검사를 제공한다. |

도메인을 중심에 두고 애플리케이션·어댑터 순서로 바깥 계층을 구성한다. 소스 의존성은 안쪽으로 향하며, 조립 지점이 포트에 구체 구현을 주입한다. 도메인 계약 검증에는 Zod를 사용하고 카탈로그는 번들에 포함된 정적 JSON을 읽는다. PostgreSQL 트랜잭션과 행 잠금(`FOR UPDATE`) 안에서 유스케이스가 소유권·리비전·보호 정책을 검사한 뒤 저장해 원자성을 유지한다. 실행 결과는 [최신 판정](../04-test/01-verification.md#최신-판정)에서 관리한다.

화면 리팩터링은 탭 전환 후에도 유지해야 하는 상태를 메인 화면에 두고 장소 탐색·추천·여행 구성의 표시를 분리한다. 탐색·날씨는 같은 장소 카드를 사용하며, 브라우저 취향 저장은 별도 어댑터가 입력 검증과 저장소 접근을 맡는다. 업무 정책과 HTTP 계약은 유지한다.

## 경기도 지역 선택 지도

[PlaceMap](../../components/place-map.tsx)은 관광지 위치와 여행 동선을 네이버 지도로 표시하고, 키 미설정·오류 시 내장 SVG 개략 지도로 폴백한다. SVG 폴백은 시흥만 표시할 때 기존 개략 지도를, 다른 시·군을 포함하면 경기도 경계와 GPS 투영 좌표를 사용한다. [경기도 지도와 도시 관광지 패널](../../components/gyeonggi-city-explorer.tsx)은 [지도 요구사항](../01-func/01-requirements.md#경기도-지역-선택-지도)에 따른 별도 탐색 컴포넌트다. 남은 작업은 [작업 계획](../gyeonggi-city-map-plan.md)에서 관리한다.

- 경계 데이터는 SGIS 행정동 경계를 보정한 [vuski/admdongkor의 2026-10-01 자료](https://github.com/vuski/admdongkor/tree/3bc00489b76696db864bdbea4b19985cdfa8b403/ver20261001)를 사용한다. 원본은 EPSG:4326이며, [데이터 라이선스](https://github.com/vuski/admdongkor/blob/master/LICENSE-DATA)에 따라 SGIS·가공자·CC BY 4.0 표기를 보존한다. 원본 파일은 개발용 임시 경로에 두고 화면용 경계와 출처 정보만 저장소에 포함한다.
- 가공 단계에서 경기도만 추출하고 일반구를 상위 시로 병합한다. 공통 경계, 섬·분리된 영역과 서울 등 비대상 지역의 공백을 보존하면서 표시 크기에 맞게 단순화한다. 자료 기준일이 현재 행정구역 현황과 다르면 차이를 검토한 뒤 채택한다.
- 경계 경로와 시·군 이름·안정적인 식별자·라벨 위치는 컴포넌트와 분리한 지역 데이터로 관리한다. SVG 경로와 대체 지역 목록은 같은 식별자와 선택 콜백을 사용한다. 이름 문자열을 기존 관광지 ID로 사용하지 않는다.
- [데이터 생성 스크립트](../../scripts/build_gyeonggi_map.py)는 검토한 원본의 SHA-256을 검사하고 31개 시·군을 병합한 뒤 공유 경계를 단순화해 [SVG 데이터](../../data/gyeonggi-map.json)를 생성한다. Shapely는 개발용 생성 단계에서만 사용하며 앱 런타임에는 필요하지 않다. [데이터 라이선스](../../data/gyeonggi-map.LICENSE.txt)를 함께 보관한다.
- 선택 상태는 [Tourpass](../../components/tourpass.tsx)가 소유하는 `selectedCityId`로 관리하고 지도는 값과 변경 콜백을 받는다. 기존 `region`은 시흥 내부 권역 필터이므로 시·군 이름으로 덮어쓰거나 기존 API에 그대로 전송하지 않는다.
- 지도와 오른쪽 관광지 목록은 탐색 화면 상단의 독립 컴포넌트로 조립한다. 관광 카탈로그에 시·군 식별자 `cityId`를 두고 오른쪽 목록은 이를 기준으로 필터링한다. 기존 장소 ID·여행 저장·상세 보기·담기 동작은 재사용한다.
- 첫 구현은 브라우저에서 정적 경계 자료와 카탈로그를 표시하며 지도 API 키와 새 서버 API를 요구하지 않는다. AI 추천·날씨 연계는 별도 유스케이스·계약 변경으로 진행한다.
- 지도 상단 날씨는 아이콘 종류·기온·예시/실시간 구분을 입력으로 받고 기본값은 맑음·10°C 예시다. [날씨 아이콘](../../components/weather-symbol.tsx)은 기존 날씨 화면과 공유하는 SVG 컴포넌트로 분리한다. 이 표시를 위해 새 API를 호출하지 않으며 기존 시흥 날씨 조회 동작은 유지한다.

## 네이버 지도

[PlaceMap](../../components/place-map.tsx)은 관광지 탐색의 지도 보기와 내 여행의 코스 지도에서 NAVER Cloud Platform Maps(Web Dynamic Map v3)를 사용한다. 상단 [경기도 지역 선택 지도](#경기도-지역-선택-지도)의 정적 SVG 경계 지도는 유지한다.

- [네이버 지도 어댑터](../../lib/adapters/naver-map.ts)는 `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=...` 스크립트를 브라우저에서 한 번만 로드하고 `window.navermap_authFailure` 인증 실패 콜백을 감지한다.
- `NAVER_MAP_CLIENT_ID`는 [서버 조립 지점](../../lib/server.ts)을 통해 `force-dynamic` 홈 페이지가 런타임에 읽어 클라이언트로 전달한다. `NEXT_PUBLIC_` 빌드 시 인라인을 사용하지 않으므로 Docker 단일 이미지에서 환경 파일만으로 전환할 수 있다. Client ID는 Web 서비스 URL 허용 목록으로 보호되는 공개 식별자이며 Secret 키는 사용하지 않는다.
- 키가 없거나 스크립트 로드·인증에 실패하면 내장 SVG 개략 지도로 자동 폴백하고 사유를 캡션에 안내한다.
- 내 여행의 접이식 코스 지도(`<details>`)는 패널이 열린 시점에 네이버 지도를 초기화하고 크기 변화를 감지해 뷰포트를 재계산한다.

## 관광 데이터 수집

한국관광공사 [국문 관광정보 서비스](https://www.data.go.kr/data/15101578/openapi.do)의 `KorService2` 지역 목록과 공통 상세를 개발용 수집 명령에서 조회한다. 법정동 코드·주소로 지도 시·군을 확인하고 콘텐츠 ID를 안정적인 장소 ID로 사용한다. 재실행은 시흥 원본을 유지하고 수집분을 교체하며, 원본 응답 캐시는 Git에서 제외한다. 실패 시 이전 카탈로그를 유지한다.

수집 결과는 기존 관광 카탈로그와 같은 데이터·출처·사진 계약으로 저장해 서버 검증과 상세·담기에서 함께 사용한다. GPS 좌표는 지도 생성 시 보존한 투영 정보로 변환한다. 외부 사진은 공공누리 제1유형과 한국관광공사 이미지 호스트만 허용한다. 인증키는 수집 명령의 환경 변수로만 읽고 앱 실행 시에는 필요하지 않다. 실행 방법은 [README](../../README.md#관광-데이터-갱신)를 따른다.

관광지 증가에 따라 AI 후보는 지역 필터를 먼저 적용하고 키워드·만족도 순으로 최대 40곳만 전달한다. 동점은 시·군별 순서를 교차해 분산하고 반환 ID는 실제 전달 후보에서 검증한다. 시흥권 날씨 추천은 기존 시흥 자료로 제한한다.

## 네이버 로그인

서버의 OAuth Authorization Code 흐름으로 네이버 동일인 식별자를 확인한다. 로그인 전용 환경 변수는 CLOVA Voice 인증 정보와 분리한다. 세션·계정 연결·일회용 state는 PostgreSQL에 저장하고 계정 소유권 조회는 기존 여행 API에 공통 적용한다. 익명 자료 이전과 세션 교체는 한 트랜잭션에서 수행한다. 콜백은 고정 APP_ORIGIN을 사용하고 변경 요청은 기존 Origin 검사를 적용한다. 개인정보·보관 정책은 [요구사항](../01-func/01-requirements.md#세션개인정보사용-제한), 앱 등록은 [배포 가이드](../05-ops/01-deploy.md#네이버-로그인)를 따른다.

## 관광 사진 제공

공개 관광 사진은 Next.js Image로 표시 크기에 맞게 축소하고 WebP로 협상·캐시한다. 첫 화면 배너는 미리 불러오고 목록·썸네일은 지연 로딩한다. 소유자 전용 방문 사진은 세션 확인이 필요한 기존 API로 제공한다.

## HTTP API 계약

상세 경로·필드·오류는 [OpenAPI 원본](../../lib/adapters/openapi.ts), [공통 스키마](../../lib/domain/contracts.ts), [도우미 스키마](../../lib/domain/assistant.ts)에서 관리하며 [실행 서버 문서](../../README.md#사용-방법)로 조회한다.

- 도메인 오류는 의미를 가진 코드로 전달하고 HTTP 어댑터가 상태 코드로 변환한다. 음성 유스케이스는 바이트를 반환하고 라우트가 오디오 응답을 만든다.
- [HTTP 경계](../../lib/adapters/http.ts)는 세션, 변경 요청의 `Origin` 일치, JSON 타입·본문 상한과 `{error: string}` 오류를 처리한다. 개인 응답은 캐시하지 않는다.
- [이미지 처리](../../lib/adapters/images.ts)는 타입·용량·픽셀 수를 검증하고 재인코딩한다. 개인정보 전송과 사용 한도는 [요구사항](../01-func/01-requirements.md#세션개인정보사용-제한)을 따른다.
- [NAVER 연동](../../lib/adapters/naver.ts)은 HTTPS·30초 제한·리다이렉트 차단·캐시 금지를 적용한다. CLOVA 상태·응답 종료·필터·스키마를 검사하며 OCR URL은 `https://*.apigw.ntruss.com`만 허용한다.

## 데이터 저장과 동시성

[DB 구현](../../lib/adapters/postgres.ts)은 `pg` 커넥션 풀로 PostgreSQL에 연결하며 연결 문자열은 [.env.example](../../.env.example)의 `DATABASE_URL`을 따른다. 첫 DB 요청 시 자문 잠금(`pg_advisory_xact_lock`) 안에서 6개 테이블(`sessions`, `journeys`, `limits`, `photos`, `account_sessions`, `oauth_states`)과 인덱스를 멱등하게 초기화한다. 세션 해시·만료(`BIGINT`), 여행 `JSONB`·리비전·삽입 순번(`BIGSERIAL`), 시간별 한도, 소유자 전용 사진 `BYTEA`를 저장한다.

기록 저장·여행 편집·사진 업로드는 `AsyncLocalStorage`로 단일 커넥션에 바인딩된 트랜잭션에서 `SELECT ... FOR UPDATE` 행 잠금으로 소유권·장소·리비전을 확인하고 새 UUID 리비전을 발급해 동시 덮어쓰기를 막는다. 사진은 `(journey, place)` 고유 제약으로 여행·장소별 하나만 유지하며, 한도는 단일 `INSERT ... ON CONFLICT DO UPDATE RETURNING`으로 원자적으로 증가한다.

## 운영 모니터링

앱과 별도 Docker 컨테이너로 Prometheus·Grafana·Node Exporter·Blackbox Exporter를 실행한다. 서버 자원과 로컬 앱·Apache의 HTTP 성공 여부·응답 시간을 수집하며 업무 데이터·쿠키는 수집하지 않는다. Linux 호스트 네트워크에서 모든 모니터링 포트는 루프백에만 바인딩한다. Prometheus는 15일·블록 저장량 2GB를 기준으로 보관하며 Grafana 데이터와 함께 전용 볼륨에 저장한다. 앱 내부 요청별 통계·외부 장애 통보는 이번 구성에 포함하지 않는다. 설정·접속·검증 방법은 [배포 가이드](../05-ops/01-deploy.md#운영-모니터링)를 따른다.

## 남은 작업과 리스크

| 항목 | 대기 이유 | 재개 조건·작업 |
| --- | --- | --- |
| NAVER 실키 검증 | 키가 없어 모의 계약만 검증했다. | 키 주입 후 권한·품질·지연·과금 한도를 실측한다. |
| HTTPS | Apache를 통한 HTTP 공개 접속을 확인했다. CD는 SSH 서버 빌드 방식으로 구성하며 실배포 검증 결과는 [최신 판정](../04-test/01-verification.md#최신-판정)에 기록한다. 도메인은 없다. | [배포 가이드](../05-ops/01-deploy.md)에 따라 도메인 확보 후 HTTPS를 적용한다. CD는 배포 중 SSH 접근만 임시 허용하고 해당 규칙을 삭제한다. |
| 관광 자료·사진 | 검토 전 스냅샷이다. | 외부 배포 전 공식 운영 정보와 사진 라이선스를 재검토한다. |
| 상용·수평 확장 | DB는 PostgreSQL로 분리했으나 사진은 DB `BYTEA`에 저장하고 앱은 단일 서버로 운영한다. | 전환 시 Object Storage·계정 삭제·보존 정책·다중 앱 인스턴스 로드밸런싱을 도입한다. |
