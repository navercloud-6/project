# 경기 하루이음

## 소개

경기도 관광지(시흥권 시연 데이터 기반)를 탐색하고 AI 여행 추천·패스 구성·방문 기록을 제공하는 Next.js MVP다. 범위와 정책은 [요구사항](docs/01-func/01-requirements.md)을 따른다.

탐색 화면 상단에서 경기도 시·군을 선택하면 오른쪽에 등록 관광지가 표시된다. 현재 시흥 20곳을 제공하며 다른 시·군은 준비 중으로 안내한다. 이후 목표와 남은 작업은 [경기도 지도 작업 계획](docs/gyeonggi-city-map-plan.md)에서 구분한다.

### 주요 화면

로컬 시연 화면: [데스크톱 탐색](docs/screenshots/desktop.jpg) · [모바일 여행 확인](docs/screenshots/mobile.jpg) · [데스크톱 도우미](docs/screenshots/assistant-desktop.jpg) · [모바일 도우미](docs/screenshots/assistant-mobile.jpg) · [사진 일기](docs/screenshots/photo-record.jpg).

## 기술 스택

Next.js 16 App Router · React 19 · TypeScript · Zod · Scalar(OpenAPI 3.1) · Sharp · Node.js 24 내장 SQLite · NAVER Cloud(CLOVA Studio·Voice·Papago·OCR·Maps). 버전은 [package.json](package.json)과 [잠금 파일](package-lock.json)에서 관리한다.

## 시작하기

Node.js 24 이상에서 실행한다(`node:sqlite` 실험적 API 경고는 정상이다).

```sh
npm ci
cp .env.example .env.local
npm run dev
```

[로컬 서버](http://localhost:3000)에 접속한다. 다른 주소·포트를 쓰면 `APP_ORIGIN`도 맞춘다. DB는 첫 API 요청 시 `.runtime/tourpass.sqlite`에 생성된다. 키 설정과 운영 배포는 [배포 가이드](docs/05-ops/01-deploy.md)를 따른다.

## 사용 방법

| 하단 탭 | 사용 흐름 |
| --- | --- |
| 경기 둘러보기 | 장소 찾기 또는 추천받기 → 여행에 담기 → 담은 여행에서 순서·이름·날짜를 정해 저장한다. |
| 내 여행 | 코스 지도를 확인하고 방문 기록·사진·일기, 여행 수정·번역을 이용한다. |
| 여행 도우미 | 관광 안내와 행사 등록 중 작업을 선택한다. 포스터를 읽거나 직접 입력해 저장하면 내 여행으로 이동한다. |
| 경기 날씨 | 권역별 현재 날씨·5일 예보를 확인하고 추천 장소를 담는다. |
| 마이 | 네이버 로그인·로그아웃, 여행 요약과 브라우저 여행 취향을 관리한다. |

API 문서는 실행 서버의 `/api/docs` 또는 `/scalar`, JSON 명세는 `/api/openapi`에서 제공한다. 계약과 보안 경계는 [기술 구조](docs/03-tech/01-architecture.md#http-api-계약)를 따른다.

서버 자원과 앱 응답 상태는 [Prometheus·Grafana 운영 모니터링](docs/05-ops/01-deploy.md#운영-모니터링)에서 확인한다.

## 테스트

[검증 범위와 최신 판정](docs/04-test/01-verification.md)은 별도로 관리한다.

```sh
npm run format:check
npm test
npm run typecheck
npm run build
```

서식 수정은 `npm run format`, 로컬 프로덕션 실행은 빌드 후 `npm start`를 사용한다. HTTP 검사는 별도 DB와 AI 키 없는 서버에서 실행한다.

```sh
APP_ORIGIN=http://127.0.0.1:3100 DATABASE_PATH=.runtime/smoke.sqlite CLOVA_STUDIO_API_KEY= npm run start -- --port 3100
# 별도 터미널에서 실행
node tests/http.mjs
TEST_BASE_URL=http://127.0.0.1:3100 node tests/extensions-http.mjs
```

로그인 HTTP 검사는 별도 DB 서버에 `NAVER_LOGIN_CLIENT_ID`·`NAVER_LOGIN_CLIENT_SECRET`을 더미 값으로 설정한 뒤 `node tests/auth-http.mjs`로 실행한다. 실제 네이버 요청 없이 리다이렉트·취소·state·로그아웃을 확인한다.

문서 링크·분류 검사는 `python3 .github/scripts/check_docs.py`로 실행한다.

## 관련 문서

- [작업 지침](AGENTS.md)은 작업 순서와 문서 관리 규칙을 정의한다.
- [관광 데이터](data/places.json)는 장소·출처·사진 정보를 담는다.
- [경기도 지도 작업 계획](docs/gyeonggi-city-map-plan.md)은 `frontend` 브랜치의 구현 순서·검증 계획·미확정 항목을 관리한다.
- [프로젝트 평가 항목 안내](docs/evaluation.md)는 평가 영역별 배점과 세부 기준, 관련 명세 위치를 정리한다.

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
