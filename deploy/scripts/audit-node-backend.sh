#!/usr/bin/env bash
set -u
DOMAIN="${1:-img.aiswing.fun}"
PORT="${2:-3000}"

echo "== local health =="
curl -i "http://127.0.0.1:${PORT}/health" 2>/dev/null || true

echo

echo "== public health =="
curl -i "https://${DOMAIN}/health" 2>/dev/null || true

echo

echo "== public proxy with invalid key =="
curl -i "https://${DOMAIN}/v1/images/generations" \
  -H 'Authorization: Bearer sk-invalid-audit' \
  -H 'Content-Type: application/json' \
  --data '{"model":"gpt-image-2","prompt":"audit","size":"1024x1024","response_format":"b64_json"}' 2>/dev/null || true

echo

echo "成功判定："
echo "1. /health 返回 build 2026050604"
echo "2. /v1/images/generations 响应头有 X-Aiswing-Proxy: node-backend"
echo "3. 无效 key 返回 401 属于正常，说明后端已连到上游"
