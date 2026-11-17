#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"
CONFIG_DIR="$(pwd)"
PASSWORD_DIR=/etc/siheung-monitoring
PASSWORD_FILE="$PASSWORD_DIR/grafana-password"

if [ "$(uname -s)" != Linux ] || [ "$(id -u)" != 0 ]; then
  echo 'Linux Docker 서버에서 root로 실행하세요.' >&2
  exit 1
fi

install -d -m 700 "$PASSWORD_DIR"
if [ ! -s "$PASSWORD_FILE" ]; then
  (umask 077; openssl rand -hex 24 > "$PASSWORD_FILE")
fi
# 컨테이너 UID가 파일을 읽되 호스트에서는 root 전용 부모 디렉터리로 보호한다.
chmod 444 "$PASSWORD_FILE"

PROMETHEUS=prom/prometheus:v3.16.0
GRAFANA=grafana/grafana:13.3.1
NODE_EXPORTER=prom/node-exporter:v1.12.1
BLACKBOX=prom/blackbox-exporter:v0.29.1

# 이미지·설정을 먼저 확인해 실패 시 실행 중인 모니터링을 유지한다.
for image in "$PROMETHEUS" "$GRAFANA" "$NODE_EXPORTER" "$BLACKBOX"; do
  docker pull "$image"
done
docker run --rm --entrypoint /bin/promtool \
  -v "$CONFIG_DIR/prometheus.yml:/etc/prometheus/prometheus.yml:ro" \
  "$PROMETHEUS" check config /etc/prometheus/prometheus.yml
docker run --rm -v "$CONFIG_DIR/blackbox.yml:/etc/blackbox_exporter/config.yml:ro" \
  "$BLACKBOX" --config.file=/etc/blackbox_exporter/config.yml --config.check

for name in tourpass-prometheus tourpass-grafana tourpass-node-exporter tourpass-blackbox; do
  if docker container inspect "$name" >/dev/null 2>&1; then
    docker rm -f "$name" >/dev/null
  fi
done

docker run -d --name tourpass-node-exporter --restart unless-stopped \
  --network host --pid host --memory 128m --cpus 0.25 \
  -v /:/host:ro,rslave "$NODE_EXPORTER" \
  --path.rootfs=/host --web.listen-address=127.0.0.1:9100 >/dev/null
docker run -d --name tourpass-blackbox --restart unless-stopped \
  --network host --memory 64m --cpus 0.25 \
  -v "$CONFIG_DIR/blackbox.yml:/etc/blackbox_exporter/config.yml:ro" \
  "$BLACKBOX" --config.file=/etc/blackbox_exporter/config.yml \
  --web.listen-address=127.0.0.1:9115 >/dev/null
docker run -d --name tourpass-prometheus --restart unless-stopped \
  --network host --memory 512m --cpus 0.5 \
  -v "$CONFIG_DIR/prometheus.yml:/etc/prometheus/prometheus.yml:ro" \
  -v tourpass-prometheus-data:/prometheus "$PROMETHEUS" \
  --config.file=/etc/prometheus/prometheus.yml --storage.tsdb.path=/prometheus \
  --storage.tsdb.retention.time=15d --storage.tsdb.retention.size=2GB \
  --web.listen-address=127.0.0.1:9090 >/dev/null
docker run -d --name tourpass-grafana --restart unless-stopped \
  --network host --memory 512m --cpus 0.5 \
  -e GF_SERVER_HTTP_ADDR=127.0.0.1 -e GF_SERVER_HTTP_PORT=3001 \
  -e GF_AUTH_ANONYMOUS_ENABLED=false -e GF_USERS_ALLOW_SIGN_UP=false \
  -e GF_ANALYTICS_REPORTING_ENABLED=false -e GF_ANALYTICS_CHECK_FOR_UPDATES=false \
  -e GF_SECURITY_ADMIN_PASSWORD__FILE=/run/secrets/grafana-password \
  -v "$PASSWORD_FILE:/run/secrets/grafana-password:ro" \
  -v "$CONFIG_DIR/grafana/provisioning:/etc/grafana/provisioning:ro" \
  -v "$CONFIG_DIR/grafana/dashboards:/var/lib/grafana/dashboards:ro" \
  -v tourpass-grafana-data:/var/lib/grafana "$GRAFANA" >/dev/null

for endpoint in http://127.0.0.1:9090/-/ready http://127.0.0.1:3001/api/health; do
  curl --fail --silent --show-error --retry 20 --retry-all-errors --retry-delay 2 --max-time 5 "$endpoint"
done
echo "모니터링 기동 완료. Grafana admin 초기 비밀번호: $PASSWORD_FILE"
