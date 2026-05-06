#!/usr/bin/env bash
set -euo pipefail

DOMAIN="${1:-img.aiswing.fun}"
APP_DIR="${2:-/www/wwwroot/img.aiswing.fun}"
PORT="${3:-3000}"
NGINX_CONF="/www/server/panel/vhost/nginx/${DOMAIN}.conf"
SERVICE_FILE="/etc/systemd/system/aiswing-image-studio.service"

if [ ! -d "$APP_DIR" ]; then
  echo "应用目录不存在: $APP_DIR" >&2
  exit 1
fi

if [ ! -f "$APP_DIR/server.js" ]; then
  echo "缺少 server.js，请先解压 node-backend-app.zip 到 $APP_DIR" >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "未检测到 node。请先安装 Node.js 18+" >&2
  exit 1
fi

cd "$APP_DIR"
node --check server.js

cat > "$SERVICE_FILE" <<SERVICE
[Unit]
Description=Aiswing Image Studio Node Backend
After=network.target

[Service]
Type=simple
WorkingDirectory=${APP_DIR}
Environment=NODE_ENV=production
Environment=HOST=0.0.0.0
Environment=PORT=${PORT}
Environment=UPSTREAM=https://cdn.aiswing.fun
Environment=MAX_BODY_BYTES=62914560
ExecStart=$(command -v node) ${APP_DIR}/server.js
Restart=always
RestartSec=3
User=www
Group=www

[Install]
WantedBy=multi-user.target
SERVICE

systemctl daemon-reload
systemctl enable aiswing-image-studio.service
systemctl restart aiswing-image-studio.service
sleep 1
curl -fsS "http://127.0.0.1:${PORT}/health"
echo

if [ -f "$NGINX_CONF" ]; then
  BACKUP="${NGINX_CONF}.bak.$(date +%Y%m%d%H%M%S)"
  cp "$NGINX_CONF" "$BACKUP"
  echo "已备份 Nginx 配置: $BACKUP"

  if grep -q "proxy_pass http://127.0.0.1:${PORT}" "$NGINX_CONF"; then
    echo "Nginx 配置里已经存在 Node 反代，跳过写入。"
  else
    echo "请手动把下面 location / 放入 ${NGINX_CONF} 的 server { ... } 内："
    cat <<NGINX

location / {
    proxy_pass http://127.0.0.1:${PORT};
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_connect_timeout 60s;
    proxy_send_timeout 300s;
    proxy_read_timeout 300s;
    client_max_body_size 60m;
}
NGINX
  fi
else
  echo "未找到宝塔 Nginx 配置文件: $NGINX_CONF"
  echo "请在宝塔面板里把站点反向代理到 http://127.0.0.1:${PORT}"
fi

echo "部署完成。验证："
echo "curl https://${DOMAIN}/health"
echo "curl -i https://${DOMAIN}/v1/images/generations -H 'Authorization: Bearer sk-invalid' -H 'Content-Type: application/json' --data '{\"model\":\"gpt-image-2\",\"prompt\":\"test\",\"size\":\"1024x1024\",\"response_format\":\"b64_json\"}'"

