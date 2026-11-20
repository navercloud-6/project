# 경기 하루이음

## 소개

경기도 31개 시·군의 관광지를 탐색하고 AI 여행 추천·패스 구성·방문 기록을 제공하는 Next.js MVP다. 범위와 정책은 [요구사항](docs/01-func/01-requirements.md), 후속 과제는 [경기도 지도 작업 계획](docs/gyeonggi-city-map-plan.md)을 따른다.

### 주요 화면

[데스크톱 탐색](docs/screenshots/desktop.jpg) · [모바일 여행 확인](docs/screenshots/mobile.jpg) · [데스크톱 도우미](docs/screenshots/assistant-desktop.jpg) · [모바일 도우미](docs/screenshots/assistant-mobile.jpg) · [사진 일기](docs/screenshots/photo-record.jpg).

## 기술 스택

Next.js 16 App Router · React 19 · TypeScript · Zod · Scalar(OpenAPI 3.1) · Sharp · PostgreSQL(`pg`) · NAVER Cloud(CLOVA Studio·Voice·Papago·OCR·Maps·Cloud DB for PostgreSQL). 버전은 [package.json](package.json)에서 관리한다.

## 시작하기

Node.js 24 이상과 PostgreSQL 16 이상이 필요하다.

```sh
npm ci
cp .env.example .env.local
# .env.local의 DATABASE_URL을 실행 중인 PostgreSQL에 맞게 설정한다.
npm run dev
```

[http://localhost:3000](http://localhost:3000)에 접속한다(주소 변경 시 `APP_ORIGIN` 동기화). 테이블은 첫 DB 요청 시 자동 생성되며 키 설정·운영 배포는 [배포 가이드](docs/05-ops/01-deploy.md)를 따른다.

### 관광 데이터 갱신

`.env.local`에 한국관광공사 `TOUR_API_KEY`를 설정한 뒤 `npm run data:tourapi`를 실행하면 경기도 관광지·문화시설을 갱신한다. 수집 기준은 [요구사항](docs/01-func/01-requirements.md#시군별-관광-데이터-확장)을 따르며 이후 일반 실행에는 키가 필요하지 않다.

## 사용 방법

| 하단 탭 | 사용 흐름 |
| --- | --- |
| 경기 둘러보기 | 시·군 지도·장소 찾기·추천받기로 장소를 담아 순서·이름·날짜를 저장한다. |
| 경기 날씨 | 경기도 전체·31개 시·군 현재 날씨·5일 예보를 확인하고 추천 장소를 담는다. |
| 여행 도우미 | 관광 안내를 질문하거나 포스터 인식·직접 입력으로 행사 일정을 저장한다. |
| 내 여행 | 코스 지도, 방문 기록·사진·일기, 대화형 여행 수정·번역을 이용한다. |
| 프로필 | 네이버 로그인·로그아웃, 여행 요약, 브라우저 여행 취향을 관리한다. |

API 문서는 `/api/docs`(또는 `/scalar`), OpenAPI JSON은 `/api/openapi`에서 제공한다([기술 구조](docs/03-tech/01-architecture.md#http-api-계약)). 운영 상태는 [모니터링 가이드](docs/05-ops/01-deploy.md#운영-모니터링)에서 확인한다.

## 테스트

검증 전략과 최신 결과는 [테스트 명세](docs/04-test/01-verification.md)에서 관리한다.

```sh
npm run format:check && npm test && npm run typecheck && npm run build
python3 .github/scripts/check_docs.py
```

서식 수정은 `npm run format`을 사용한다. 단위 검사는 `DATABASE_URL`(또는 `TEST_DATABASE_URL`)의 임시 스키마에서 실행한다. 프로덕션 HTTP 검사는 테스트 DB·AI 키 없는 서버(`PORT=3100`)에서 `node tests/http.mjs`, `TEST_BASE_URL=http://127.0.0.1:3100 node tests/extensions-http.mjs`를 실행하고, 로그인 HTTP 검사는 더미 `NAVER_LOGIN_CLIENT_ID`·`NAVER_LOGIN_CLIENT_SECRET` 서버에서 `node tests/auth-http.mjs`를 실행한다.

## 관련 문서

- [작업 지침](AGENTS.md)은 작업 순서와 문서 관리 규칙을 정의한다.
- [관광 데이터](data/places.json)는 장소·출처·사진 카탈로그를 담는다.
- [경기도 지도 작업 계획](docs/gyeonggi-city-map-plan.md)은 지도 확장 현황과 대기 항목을 관리한다.
- [프로젝트 평가 항목 안내](docs/evaluation.md)는 평가 영역·배점과 근거 문서를 정리한다.

### 문서 분류 기준

<!-- doc-standard:start — doc-standard에서 동기화한다. 이 구간은 직접 고치지 않는다. -->
| 위치 | 담는 내용 |
| --- | --- |
| [`docs/01-func/`](docs/01-func/01-requirements.md) | 범위, 역할별 기능, 업무 정책, 완료 기준 |
| [`docs/02-uxui/`](docs/02-uxui/01-design.md) | 화면 배치·조작·디자인 기준·시각 자산 |
| [`docs/03-tech/`](docs/03-tech/01-architecture.md) | 아키텍처, 소스 구조, 데이터 모델, REST/IPC 계약 |
| [`docs/04-test/`](docs/04-test/01-verification.md) | 검증 방법, 판정 기준, 최신 판정과 증거 |
| [`docs/05-ops/`](docs/05-ops/01-deploy.md) | 배포·인프라 구성·운영 점검·장애 대응 |
| `docs/` 루트·주제 폴더 | 비명세 자료(과제 안내, 보고서, 발표, 협업 규칙, 자료 수집 기록) |
| 코드 저장소 루트 README | 로컬 설치·실행·테스트 명령 |

API 상세 원본은 OpenAPI·라우터·DTO이며 명세에는 원본 위치와 한계만 적는다. 배포 절차는 `05-ops/`(없으면 기술 명세)에 두고 로컬 실행 명령은 README를 링크한다.
<!-- doc-standard:end -->
