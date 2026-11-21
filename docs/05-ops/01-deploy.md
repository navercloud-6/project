# 배포 가이드 — 경기 하루이음

[문서 안내](../../README.md#문서-분류-기준) · [로컬 실행·검사](../../README.md#시작하기)

## 환경 변수와 NAVER Cloud 연결

변수명·기본값은 [.env.example](../../.env.example)을 따른다. 로컬은 `.env.local`, 운영은 `/etc/siheung-tourpass/app.env`(권한 `0600`)에 두고 재시작한다. 모든 설정은 `NEXT_PUBLIC_` 없이 런타임 주입하며 비밀 키는 서버 전용이다(`NAVER_MAP_CLIENT_ID`만 브라우저 SDK 로드에 전달).

| 서비스 | 필요한 인증 정보 |
| --- | --- |
| Cloud DB for PostgreSQL | VPC 사설 도메인·포트·계정·DB명(`DATABASE_URL`) |
| CLOVA Studio | API 키 및 추천·Function Calling·Vision 모델명 |
| CLOVA Voice | Voice 활성화 앱 ID·Secret |
| Papago | 별도 Translation 앱 ID·Secret |
| 검색(지역·블로그) | NAVER API HUB 검색 앱 ID·Secret(`NAVER_SEARCH_ID`·`NAVER_SEARCH_SECRET`, 맛집) |
| 공공데이터포털 | 기상청 기상특보·지진정보 조회서비스 활용신청한 일반 인증키(`DATA_GO_KR_SERVICE_KEY`, 무료, 개발계정 일 10,000건) |
| General OCR | `/general`로 끝나는 HTTPS Invoke URL(`*.apigw.ntruss.com`)·Secret |
| Maps (Web Dynamic Map) | `NAVER_MAP_CLIENT_ID` 및 콘솔 Web 서비스 URL(`APP_ORIGIN`) 등록 |

키 미설정 동작과 사용 한도는 [요구사항](../01-func/01-requirements.md)을 따른다.

## 네이버 로그인

[NAVER Developers](https://developers.naver.com/apps/#/register)에 서비스 URL(`APP_ORIGIN`)과 Callback URL(`<APP_ORIGIN>/api/auth/naver/callback`)을 등록하고 로그인 전용 키를 설정한다(CLOVA Voice 키와 분리). 동일인 식별자만 사용하므로 추가 프로필 항목은 요청하지 않는다. 외부 공개 전 네이버 검수를 완료하고 운영은 HTTPS·보안 쿠키를 적용한다.

## 서버 구성과 배포

- **현재 시연 서버**: `root@223.130.161.104`(Ubuntu 22.04)에서 앱(`127.0.0.1:3000`) 앞단에 [Apache HTTP 설정](../../deploy/apache-http.conf)을 두고 `http://223.130.161.104`로 서비스한다. 소스는 `/opt/siheung-tourpass`에 둔다.
- **표준 HTTPS 배포**: Ubuntu LTS에 Docker를 설치하고 ACG는 80/443·관리자 SSH만 개방한다. 같은 VPC의 Cloud DB for PostgreSQL ACG는 앱 서버의 5432 포트만 허용한다. 도메인을 [Caddy](../../deploy/Caddyfile)로 연결하고 운영 환경 파일에 `DATABASE_URL`, `APP_ORIGIN=https://<도메인>`, `COOKIE_SECURE=true`를 설정해 [Dockerfile](../../Dockerfile)로 기동한다.

```sh
docker build -t siheung-tourpass .
docker run -d --name siheung-tourpass --restart unless-stopped --init \
  -p 127.0.0.1:3000:3000 --env-file /etc/siheung-tourpass/app.env siheung-tourpass
```

## GitHub Actions CD

[cd.yml](../../.github/workflows/cd.yml)은 `main` 푸시·수동 실행 시 소스를 SSH로 전송해 서버에서 빌드하고 [deploy-container.sh](../../deploy/deploy-container.sh)로 교체한다([CI](../../.github/workflows/ci.yml)). [acg.py](../../deploy/acg.py)는 실행 IP(`/32`)의 SSH만 임시 허용하고 종료 시 삭제한다(강제 종료 시 `tourpass-cd-<실행 번호>` 규칙 수동 정리).

| GitHub `production` 설정 | 항목 |
| --- | --- |
| Variables | `NCP_SERVER_HOST`, `APP_ORIGIN`, `NCP_VPC_NO`, `NCP_ACG_NO` (선택: `NCP_REGION_CODE`, `NCP_IMAGE_NAME`, `NCP_SERVER_PORT`) |
| Secrets | `NCP_SERVER_USER`, `NCP_SERVER_SSH_KEY`, `NCP_SERVER_KNOWN_HOSTS`, `NCP_ACCESS_KEY_ID`, `NCP_SECRET_KEY` |

## 백업과 복구

- Cloud DB for PostgreSQL의 일일 자동 백업(7일 보관)을 사용하며 수동 백업은 `pg_dump "$DATABASE_URL" > backup.sql`로 추출한다.
- 교체 스크립트는 `DATABASE_URL`과 `/`·`POST /api/session` 응답을 검사하고 실패 시 직전 이미지로 복구한다.

## 운영 모니터링

서버에서 `cd /opt/siheung-tourpass && bash deploy/monitoring/start.sh`로 모니터링 컨테이너를 실행한다. 초기 Grafana 비밀번호는 `/etc/siheung-monitoring/grafana-password`에서 확인한다. 외부 포트는 열지 않고 SSH 터널로 [Grafana](http://localhost:3001)·[Prometheus](http://localhost:9090)에 접속한다.

```sh
ssh -N -L 3001:127.0.0.1:3001 -L 9090:127.0.0.1:9090 root@223.130.161.104
```

Prometheus `/targets`에서 5개 대상 UP과 앱·Apache `probe_success=1`을 확인한다. 로컬 경로만 검사하며 알림 전송은 미구성이다. 중지는 `docker stop tourpass-prometheus tourpass-grafana tourpass-node-exporter tourpass-blackbox`를 사용한다.
