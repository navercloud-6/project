#!/usr/bin/env bash
set -euo pipefail

CONTAINER_NAME="${CONTAINER_NAME:-siheung-tourpass}"
ENV_FILE="${ENV_FILE:-/etc/siheung-tourpass/app.env}"
LISTEN_ADDR="${LISTEN_ADDR:-127.0.0.1:3000}"
IMAGE_REF="${IMAGE_REF:?IMAGE_REF 환경 변수가 필요합니다.}"

if [ ! -r "$ENV_FILE" ]; then
  echo "오류: 환경 변수 파일($ENV_FILE)을 읽을 수 없습니다." >&2
  exit 1
fi

DATABASE_URL_VAL="$(grep -E '^DATABASE_URL=' "$ENV_FILE" | tail -n 1 | cut -d= -f2- | tr -d '\r"' || true)"
if [ -z "$DATABASE_URL_VAL" ]; then
  echo "오류: 환경 변수 파일($ENV_FILE)에 DATABASE_URL 설정이 필요합니다." >&2
  exit 1
fi

APP_ORIGIN="$(grep -E '^APP_ORIGIN=' "$ENV_FILE" | tail -n 1 | cut -d= -f2- | tr -d '\r"' || true)"
APP_ORIGIN="${APP_ORIGIN:-http://localhost:3000}"

if [ -n "${NCP_CONTAINER_REGISTRY:-}" ] && [ -n "${NCP_ACCESS_KEY_ID:-}" ] && [ -n "${NCP_SECRET_KEY:-}" ]; then
  printf '%s' "$NCP_SECRET_KEY" | docker login "$NCP_CONTAINER_REGISTRY" -u "$NCP_ACCESS_KEY_ID" --password-stdin >/dev/null
  trap 'docker logout "$NCP_CONTAINER_REGISTRY" >/dev/null 2>&1 || true' EXIT
fi

if [ "${PULL_IMAGE:-true}" = true ]; then
  docker pull "$IMAGE_REF"
fi

PREV_IMAGE="$(docker inspect --format '{{.Config.Image}}' "$CONTAINER_NAME" 2>/dev/null || true)"

if docker ps -a --format '{{.Names}}' | grep -Fxq "$CONTAINER_NAME"; then
  docker stop --time 30 "$CONTAINER_NAME" >/dev/null || true
  docker rm "$CONTAINER_NAME" >/dev/null
fi

start_container() {
  local image="$1"
  docker run -d \
    --name "$CONTAINER_NAME" \
    --restart unless-stopped \
    --init \
    -p "${LISTEN_ADDR}:3000" \
    --env-file "$ENV_FILE" \
    "$image" >/dev/null
}

verify_container() {
  curl --fail --silent --show-error --retry 15 --retry-all-errors --retry-delay 2 --max-time 5 \
    "http://${LISTEN_ADDR}/" >/dev/null
  curl --fail --silent --show-error --retry 15 --retry-all-errors --retry-delay 2 --max-time 5 \
    -X POST \
    -H "Origin: ${APP_ORIGIN}" \
    "http://${LISTEN_ADDR}/api/session" >/dev/null
}

start_container "$IMAGE_REF"

if ! verify_container; then
  echo "오류: 신규 컨테이너 상태 확인에 실패했습니다. 로그를 출력하고 롤백합니다." >&2
  docker logs --tail 50 "$CONTAINER_NAME" >&2 || true
  docker stop --time 15 "$CONTAINER_NAME" >/dev/null || true
  docker rm "$CONTAINER_NAME" >/dev/null || true
  if [ -n "$PREV_IMAGE" ]; then
    echo "이전 이미지($PREV_IMAGE)로 복구합니다." >&2
    start_container "$PREV_IMAGE"
    verify_container
  fi
  exit 1
fi

echo "배포 완료: $IMAGE_REF"
