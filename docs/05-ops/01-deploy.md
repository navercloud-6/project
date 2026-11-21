# 배포 가이드 — 경기 하루이음

[문서 안내](../../README.md#문서-분류-기준) · [로컬 실행·검사](../../README.md#시작하기)

## 환경 변수와 NAVER Cloud 연결

변수 목록·기본값은 [.env.example](../../.env.example)을 따른다. 로컬은 `.env.local`, 운영은 `/etc/siheung-tourpass/app.env`(`0600`)에 두고 재시작하며, 모든 값은 `NEXT_PUBLIC_` 없이 런타임 주입한다(`NAVER_MAP_CLIENT_ID`만 브라우저 SDK에 전달). 키 미설정 동작은 [요구사항](../01-func/01-requirements.md)을 따른다.

- **DB·AI·검색·특보**: Cloud DB(`DATABASE_URL`)는 VPC 사설망을 사용한다. CLOVA Studio·Voice·Papago·NAVER 검색(`NAVER_SEARCH_*`)·공공데이터포털 기상청(`DATA_GO_KR_SERVICE_KEY`)은 서비스별 키를 각각 발급한다.
- **OCR·Maps**: General OCR은 `/general`로 끝나는 `*.apigw.ntruss.com` Invoke URL을 쓰고, Maps는 콘솔에 Web 서비스 URL(`APP_ORIGIN`)을 등록한다.

## 네이버 로그인

[NAVER Developers](https://developers.naver.com/apps/#/register)에 서비스 URL(`APP_ORIGIN`)과 콜백(`<APP_ORIGIN>/api/auth/naver/callback`)을 등록하고 로그인 전용 키를 설정한다(CLOVA Voice 키와 분리). 동일인 식별자만 조회하며 공개 전 검수와 HTTPS·보안 쿠키를 적용한다.

## 서버 구성과 배포

- **시연 서버**: `root@223.130.161.104`(Ubuntu 22.04, `/opt/siheung-tourpass`)에서 앱(`127.0.0.1:3000`) 앞단에 [Apache 설정](../../deploy/apache-http.conf)을 두고 HTTP로 서비스한다.
- **표준 HTTPS**: Docker 설치 후 ACG는 80/443·관리자 SSH만, DB ACG는 앱 서버 5432만 연다. [Caddy](../../deploy/Caddyfile)로 도메인을 연결하고 `DATABASE_URL`, `APP_ORIGIN=https://<도메인>`, `COOKIE_SECURE=true` 설정 후 [Dockerfile](../../Dockerfile)로 기동한다.

```sh
docker build -t siheung-tourpass .
docker run -d --name siheung-tourpass --restart unless-stopped --init \
  -p 127.0.0.1:3000:3000 --env-file /etc/siheung-tourpass/app.env siheung-tourpass
```

## GitHub Actions CD

[cd.yml](../../.github/workflows/cd.yml)이 `main` 푸시·수동 실행 시 SSH 전송·서버 빌드 후 [deploy-container.sh](../../deploy/deploy-container.sh)로 교체한다([CI](../../.github/workflows/ci.yml)). [acg.py](../../deploy/acg.py)가 실행 IP(`/32`) SSH만 임시 허용·삭제한다(강제 종료 시 `tourpass-cd-<실행 번호>` 수동 정리).

| `production` 설정 | 항목 |
| --- | --- |
| Variables | `NCP_SERVER_HOST`, `APP_ORIGIN`, `NCP_VPC_NO`, `NCP_ACG_NO` (선택: `NCP_REGION_CODE`, `NCP_IMAGE_NAME`, `NCP_SERVER_PORT`) |
| Secrets | `NCP_SERVER_USER`, `NCP_SERVER_SSH_KEY`, `NCP_SERVER_KNOWN_HOSTS`, `NCP_ACCESS_KEY_ID`, `NCP_SECRET_KEY` |

## 백업과 복구

- Cloud DB 일일 자동 백업(7일)을 쓰며 수동 백업은 `pg_dump "$DATABASE_URL" > backup.sql`로 추출한다.
- 교체 스크립트는 `DATABASE_URL`과 `/`·`POST /api/session` 실패 시 직전 이미지로 복구한다.

## 운영 모니터링

서버에서 `cd /opt/siheung-tourpass && bash deploy/monitoring/start.sh`로 기동한다(초기 비밀번호 `/etc/siheung-monitoring/grafana-password`). 외부 포트는 열지 않고 SSH 터널로 [Grafana](http://localhost:3001)·[Prometheus](http://localhost:9090)에 접속한다.

```sh
ssh -N -L 3001:127.0.0.1:3001 -L 9090:127.0.0.1:9090 root@223.130.161.104
```

Prometheus `/targets`의 5개 대상 UP과 `probe_success=1`을 확인한다(알림 미구성). 중지는 `docker stop tourpass-prometheus tourpass-grafana tourpass-node-exporter tourpass-blackbox`를 사용한다.
