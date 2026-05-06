#!/usr/bin/env bash
set -euo pipefail

SITE_ROOT="${1:-/www/wwwroot/img.aiswing.fun}"
ZIP_FILE="${2:-/tmp/img-site-upload.zip}"
BUILD="2026050603"

if [ ! -d "$SITE_ROOT" ]; then
  echo "站点目录不存在: $SITE_ROOT" >&2
  exit 1
fi

if [ ! -f "$ZIP_FILE" ]; then
  echo "上传包不存在: $ZIP_FILE" >&2
  echo "请先把 img-site-upload.zip 上传到服务器，例如 /tmp/img-site-upload.zip" >&2
  exit 1
fi

command -v unzip >/dev/null 2>&1 || { echo "缺少 unzip，请先安装 unzip" >&2; exit 1; }

BACKUP_DIR="${SITE_ROOT}.bak.$(date +%Y%m%d%H%M%S)"
echo "备份当前站点到: $BACKUP_DIR"
cp -a "$SITE_ROOT" "$BACKUP_DIR"

cd "$SITE_ROOT"

echo "删除旧的错误/测试文件"
rm -f api.php server.js package.json server.out.log server.err.log

echo "解压覆盖新文件"
unzip -o "$ZIP_FILE" -d "$SITE_ROOT"

if [ ! -f "$SITE_ROOT/version.txt" ]; then
  echo "部署失败：version.txt 不存在，可能 zip 内容不对" >&2
  exit 1
fi

if ! grep -q "$BUILD" "$SITE_ROOT/version.txt"; then
  echo "部署失败：version.txt 不是 build $BUILD" >&2
  cat "$SITE_ROOT/version.txt" >&2 || true
  exit 1
fi

if [ -f "$SITE_ROOT/api.php" ]; then
  echo "部署失败：api.php 仍存在，请检查上传包或目录" >&2
  exit 1
fi

echo "部署文件完成。当前关键文件："
ls -la "$SITE_ROOT" | sed -n '1,80p'

echo "下一步：配置 /v1/images/ 反代后执行 nginx -t && nginx -s reload"
