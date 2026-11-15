#!/usr/bin/env bash
set -euo pipefail

CONTAINER_NAME="${CONTAINER_NAME:-siheung-tourpass}"
VOLUME_NAME="${VOLUME_NAME:-tourpass-data}"
ENV_FILE="${ENV_FILE:-/etc/siheung-tourpass/app.env}"
LISTEN_ADDR="${LISTEN_ADDR:-127.0.0.1:3000}"
IMAGE_REF="${IMAGE_REF:?IMAGE_REF 환경 변수가 필요합니다.}"

if [ ! -r "$ENV_FILE" ]; then
  echo "오류: 환경 변수 파일($ENV_FILE)을 읽을 수 없습니다." >&2
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
  docker run --rm \
    -v "${VOLUME_NAME}:/app/.runtime" \
    "$IMAGE_REF" \
    node -e '
      const { existsSync, mkdirSync, readdirSync, rmSync } = require("node:fs");
      const { DatabaseSync } = require("node:sqlite");
      const src = "/app/.runtime/tourpass.sqlite";
      if (existsSync(src)) {
        const dir = "/app/.runtime/backups";
        mkdirSync(dir, { recursive: true });
        const stamp = new Date().toISOString().replace(/[:.]/g, "-");
        const dst = `${dir}/tourpass-${stamp}.sqlite`;
        const db = new DatabaseSync(src);
        db.exec(`VACUUM INTO '\''${dst}'\''`);
        db.close();
        const files = readdirSync(dir).filter(f => f.startsWith("tourpass-") && f.endsWith(".sqlite")).sort().reverse();
        for (const old of files.slice(7)) rmSync(`${dir}/${old}`, { force: true });
      }
    '
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
    -e DATABASE_PATH=/app/.runtime/tourpass.sqlite \
    -v "${VOLUME_NAME}:/app/.runtime" \
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
