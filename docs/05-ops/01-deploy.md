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
