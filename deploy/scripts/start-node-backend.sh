#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${1:-/www/wwwroot/img.aiswing.fun}"
PORT="${PORT:-3000}"

cd "$APP_DIR"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 未安装。请先在服务器安装 Node.js 18+。" >&2
  exit 1
fi

node --version
node --check server.js

if command -v pm2 >/dev/null 2>&1; then
  pm2 startOrReload ecosystem.config.cjs --env production
  pm2 save || true
else
  echo "未检测到 pm2，将用 nohup 启动。建议安装 pm2：npm i -g pm2" >&2
  pkill -f "node server.js" || true
  nohup env HOST=0.0.0.0 PORT="$PORT" UPSTREAM=https://cdn.aiswing.fun node server.js > backend.out.log 2> backend.err.log &
fi

sleep 1
curl -fsS "http://127.0.0.1:${PORT}/health"
echo

echo "后端已启动。请把 Nginx 反向代理到 http://127.0.0.1:${PORT}" 

