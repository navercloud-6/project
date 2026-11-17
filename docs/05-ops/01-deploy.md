# 배포 가이드 — 시흥 하루이음

[문서 안내](../../README.md#문서-분류-기준) · [로컬 실행·검사](../../README.md#시작하기)

## 환경 변수와 NAVER Cloud 연결

설정 이름·기본값은 [.env.example](../../.env.example)을 원본으로 사용한다. 로컬은 `.env.local`, 운영은 `/etc/siheung-tourpass/app.env`(권한 `0600`)에 저장하고 재시작한다. 키는 서버 전용이며 `NEXT_PUBLIC_`을 붙이지 않는다.

| 서비스 | 준비할 인증 정보 |
| --- | --- |
| CLOVA Studio | API 키와 추천·Function Calling·Vision 지원 모델을 설정한다. |
| CLOVA Voice | Voice를 활성화한 AI·NAVER API 앱 ID·Secret을 설정한다. |
| Papago | 별도 Translation 앱 ID·Secret을 설정한다. |
| General OCR | `/general`로 끝나는 HTTPS API Gateway Invoke URL(`*.apigw.ntruss.com`)·Secret을 설정한다. |

키 없는 동작·전송 범위·과금 남용 한도는 [요구사항](../01-func/01-requirements.md)을 따른다. 실제 호출은 과금될 수 있다.

## 네이버 로그인

[NAVER Developers](https://developers.naver.com/apps/#/register)에 네이버 로그인 애플리케이션을 등록한다. 서비스 URL을 `APP_ORIGIN`으로, Callback URL을 `<APP_ORIGIN>/api/auth/naver/callback`으로 정확히 등록한다. 로컬 주소·포트도 일치해야 한다. 로그인 전용 Client ID·Secret을 [.env.example](../../.env.example)의 로그인 항목에 설정하고 재시작한다. 기존 CLOVA Voice 키는 재사용하지 않는다.

[공식 OAuth 명세](https://developers.naver.com/docs/login/api/api.md)와 [프로필 명세](https://developers.naver.com/docs/login/profile/profile.md)를 따른다. 동일인 식별자만 사용하므로 이름·이메일 등 선택 제공 항목은 요청하지 않는다. 개발 상태에서는 앱에 등록한 테스트 계정으로 확인하고 외부 공개 전 네이버 검수를 완료한다. 운영은 HTTPS와 보안 쿠키를 적용한다. 키가 없으면 익명 이용은 계속 가능하다.

## 서버 준비와 수동 컨테이너 배포

### 현재 서버 구성

`root@223.130.161.104`(Ubuntu 22.04)의 앱은 `127.0.0.1:3000`에서 실행한다. Apache의 80번 포트로 외부 요청을 받아 앱에 전달한다. 도메인은 없으므로 시연 주소는 `http://223.130.161.104`, 쿠키는 HTTP용으로 설정한다.

소스와 배포 스크립트는 `/opt/siheung-tourpass`, 설정은 위 운영 환경 파일에 둔다. 로컬 비밀키·DB는 전송하지 않는다. CD는 배포 중 Actions 실행 IP의 SSH 접근만 임시로 허용하며 기존 ACG 규칙은 유지한다. HTTPS는 도메인 확보 후 적용한다. 검증 결과는 [최신 판정](../04-test/01-verification.md#최신-판정)에서 관리한다.

이 서버에서는 [Apache HTTP 설정](../../deploy/apache-http.conf)을 `/etc/apache2/sites-available/siheung-tourpass.conf`에 준비한다. 공개 전환 시 아래 명령으로 해당 IP의 프록시를 활성화한다. 도메인 기반의 기본 배포 절차는 다음 절을 따른다.

```sh
a2enmod proxy proxy_http
a2ensite siheung-tourpass
apache2ctl configtest && systemctl reload apache2
```

### 기본 배포 절차

1. Ubuntu LTS 서버에 Docker를 설치한다. ACG는 외부 80/443과 관리자 IP 전용 SSH만 개방한다.
2. 도메인을 [Caddy](../../deploy/Caddyfile)의 `127.0.0.1:3000` 프록시로 연결한다.
3. 운영 설정에 `APP_ORIGIN=https://<도메인>`과 `COOKIE_SECURE=true`를 지정한 뒤 [Dockerfile](../../Dockerfile)로 기동한다.

```sh
docker build -t siheung-tourpass .
docker run -d --name siheung-tourpass --restart unless-stopped --init \
  -p 127.0.0.1:3000:3000 \
  --env-file /etc/siheung-tourpass/app.env \
  -e DATABASE_PATH=/app/.runtime/tourpass.sqlite \
  -v tourpass-data:/app/.runtime siheung-tourpass
```

## GitHub Actions CD (NAVER Cloud)

[CD 원본](../../.github/workflows/cd.yml)은 문서 전용 변경을 제외한 `main` 푸시·수동 실행을 처리한다. 검증한 커밋의 소스만 SSH로 전송하고 서버에서 Docker 이미지를 빌드한 뒤 [교체 스크립트](../../deploy/deploy-container.sh)를 실행한다. NCR은 사용하지 않는다. [ACG 스크립트](../../deploy/acg.py)는 Actions 실행 IPv4 한 개(`/32`)에 SSH 포트만 임시 허용하고 종료 시 해당 실행이 만든 규칙만 삭제한다. API 오류나 취소 시에도 정리를 시도하지만 runner 강제 종료로 정리가 실행되지 않으면 ACG의 `tourpass-cd-<실행 번호>` 규칙을 직접 삭제한다. 빌드 중에는 기존 앱을 유지하며 교체 시 짧은 중단이 발생한다. 트리거·잡·설정 기본값은 워크플로에서 관리한다([CI](../../.github/workflows/ci.yml)).

GitHub `production` Environment는 `main` 브랜치 배포만 허용하고 다음을 등록한다.

| 구분 | 설정 |
| --- | --- |
| Variables | `NCP_SERVER_HOST`(서버)·`APP_ORIGIN`(표시 URL)을 등록한다. ACG의 `NCP_VPC_NO`·`NCP_ACG_NO`를 등록한다. 리전·이미지명·SSH 포트는 `NCP_REGION_CODE`·`NCP_IMAGE_NAME`·`NCP_SERVER_PORT`로 변경한다. |
| Secrets | Docker 실행 권한 계정의 `NCP_SERVER_USER`·배포 전용 `NCP_SERVER_SSH_KEY`·검증한 호스트 공개키 `NCP_SERVER_KNOWN_HOSTS`, ACG 조회·인바운드 추가/삭제 권한의 `NCP_ACCESS_KEY_ID`·`NCP_SECRET_KEY`를 등록한다. |

필수 설정 누락 시 배포는 실패한다. 운영 환경 파일과 SQLite 볼륨은 서버에 유지하고 소스 전송에 포함하지 않는다.

## 백업과 운영 제약

- 배포 스크립트는 기존 컨테이너를 중지하고 `VACUUM INTO` 백업을 만든다. 볼륨의 `/app/.runtime/backups/`에 최근 7개를 유지한다.
- 서버 기동 중 일시적인 연결 오류는 재시도한다. 새 컨테이너의 `/`·`POST /api/session` 검사 실패 시 로그를 출력하고 직전 이미지가 있으면 복구한다.
- 볼륨을 외부 스토리지로 복사할 때는 컨테이너를 중지한다. 단일 서버·영속 디스크 전용이며 서버리스·다중 인스턴스 전환은 [남은 작업과 리스크](../03-tech/01-architecture.md#남은-작업과-리스크)를 따른다.

## 운영 모니터링

Linux Docker 서버에서 [모니터링 실행 스크립트](../../deploy/monitoring/start.sh)를 root로 실행한다. Compose는 필요하지 않다. 앱을 재시작하지 않으며 설정 변경 후 같은 명령으로 모니터링 컨테이너만 교체한다.

```sh
cd /opt/siheung-tourpass
bash deploy/monitoring/start.sh
```

Grafana의 `admin` 초기 비밀번호는 서버 `/etc/siheung-monitoring/grafana-password`에 자동 생성된다. 관리자는 `sudo cat /etc/siheung-monitoring/grafana-password`로 확인하고 최초 로그인 후 변경한다. 파일은 초기화에만 사용하므로 기존 Grafana 볼륨의 비밀번호는 재실행해도 바뀌지 않는다. 데이터 소스와 기본 대시보드는 파일에서 자동 등록되며 UI 편집은 파일 갱신 시 덮어쓸 수 있다.

관리자 PC에서 다음 터널을 유지하고 [Grafana](http://localhost:3001)와 [Prometheus](http://localhost:9090)에 접속한다. ACG·Apache에 모니터링 포트를 공개하지 않는다.

```sh
ssh -N -L 3001:127.0.0.1:3001 -L 9090:127.0.0.1:9090 root@223.130.161.104
```

대시보드에서 CPU·메모리·디스크·앱/Apache 응답 상태·지연을 확인한다. Prometheus의 `/targets`에서 수집 상태를 확인하고 `probe_success`가 두 대상 모두 1인지 검사한다. HTTP 검사는 로컬 경로이므로 외부 인터넷·ACG 장애는 검출하지 못한다. API별 처리량·오류율과 장애 알림 전송은 미구성이다.

중지는 `docker stop tourpass-prometheus tourpass-grafana tourpass-node-exporter tourpass-blackbox`로 수행한다. 전용 `tourpass-prometheus-data`·`tourpass-grafana-data` 볼륨은 유지한다. 앱 볼륨과는 독립적이다. 공식 [Prometheus 수집 패턴](https://prometheus.io/docs/guides/multi-target-exporter/)과 [Grafana 프로비저닝](https://grafana.com/docs/grafana/latest/administration/provisioning/)을 따른다.
