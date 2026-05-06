#!/usr/bin/env bash
set -u

DOMAIN="${1:-img.aiswing.fun}"
SITE_ROOT="${2:-/www/wwwroot/img.aiswing.fun}"
BUILD="2026050603"
NGINX_CONF_CANDIDATES=(
  "/www/server/panel/vhost/nginx/${DOMAIN}.conf"
  "/www/server/nginx/conf/vhost/${DOMAIN}.conf"
  "/etc/nginx/conf.d/${DOMAIN}.conf"
  "/etc/nginx/sites-enabled/${DOMAIN}"
)

ok() { echo "✅ $*"; }
bad() { echo "❌ $*"; }
warn() { echo "⚠️  $*"; }

printf '\n== 1. 站点目录检查 ==\n'
if [ -d "$SITE_ROOT" ]; then
  ok "站点目录存在: $SITE_ROOT"
else
  bad "站点目录不存在: $SITE_ROOT"
fi

printf '\n== 2. 新版文件检查 ==\n'
if [ -f "$SITE_ROOT/version.txt" ]; then
  if grep -q "$BUILD" "$SITE_ROOT/version.txt"; then
    ok "version.txt 是 build $BUILD"
  else
    bad "version.txt 存在但不是 build $BUILD"
    sed -n '1,20p' "$SITE_ROOT/version.txt"
  fi
else
  bad "缺少 $SITE_ROOT/version.txt，说明新版包没有覆盖到这个目录"
fi

if [ -f "$SITE_ROOT/diagnose.html" ]; then
  ok "diagnose.html 存在"
else
  bad "缺少 diagnose.html"
fi

if [ -f "$SITE_ROOT/app.js" ]; then
  if grep -q 'return window.location.origin' "$SITE_ROOT/app.js" && ! grep -q 'api.php?path=' "$SITE_ROOT/app.js"; then
    ok "app.js 是同域 /v1 代理新版"
  else
    bad "app.js 仍是旧版或含 api.php?path= 残留"
    grep -n 'api.php\|getDefaultBaseUrl\|window.location.origin' "$SITE_ROOT/app.js" | sed -n '1,20p'
  fi
else
  bad "缺少 app.js"
fi

printf '\n== 3. 错误文件检查 ==\n'
for f in api.php server.js package.json server.out.log server.err.log; do
  if [ -e "$SITE_ROOT/$f" ]; then
    bad "仍存在错误/测试文件: $SITE_ROOT/$f"
  else
    ok "不存在: $f"
  fi
done

printf '\n== 4. Nginx 反代配置检查 ==\n'
FOUND_CONF=""
for c in "${NGINX_CONF_CANDIDATES[@]}"; do
  if [ -f "$c" ]; then
    FOUND_CONF="$c"
    ok "找到 Nginx 配置: $c"
    break
  fi
done

if [ -z "$FOUND_CONF" ]; then
  bad "未找到常见 Nginx 配置文件，请在宝塔里打开该站点配置文件手动检查"
else
  if grep -q 'location .*\/v1\/images' "$FOUND_CONF" && grep -q 'proxy_pass https://gpt.aiswing.fun' "$FOUND_CONF"; then
    ok "Nginx 配置里已有 /v1/images/ -> gpt.aiswing.fun 反代"
  else
    bad "Nginx 配置里没有正确的 /v1/images/ 反代"
    echo "请把 deploy/config/nginx-v1-images-proxy.conf 的 location 片段加入 server { ... } 内"
  fi
fi

printf '\n== 5. 线上 HTTP 检查 ==\n'
if command -v curl >/dev/null 2>&1; then
  echo "-- version.txt --"
  curl -ksS -D - "https://${DOMAIN}/version.txt?audit=$(date +%s)" -o /tmp/img-version.txt | sed -n '1,12p'
  echo "BODY:"; sed -n '1,5p' /tmp/img-version.txt 2>/dev/null || true

  echo "-- /v1/images/generations --"
  curl -ksS -D - "https://${DOMAIN}/v1/images/generations?audit=$(date +%s)" \
    -H 'Authorization: Bearer sk-invalid-audit' \
    -H 'Content-Type: application/json' \
    --data '{"model":"gpt-image-2","prompt":"audit","size":"1024x1024","response_format":"b64_json"}' \
    -o /tmp/img-v1.txt | sed -n '1,16p'
  echo "BODY:"; sed -n '1,12p' /tmp/img-v1.txt 2>/dev/null || true
else
  warn "服务器缺少 curl，跳过线上 HTTP 检查"
fi

printf '\n== 结论判断 ==\n'
echo "version.txt 404 => 上传目录错或没覆盖"
echo "/v1/images 返回 404 nginx => Nginx/Worker 反代没生效"
echo "api.php 还能访问 => 旧错误文件没删"
