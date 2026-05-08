#!/bin/bash
# 无感更新脚本 - 拉取最新代码并重启容器

set -e

echo "🔄 开始更新 Aiswing Image Studio..."

# 1. 拉取最新代码
echo "📥 拉取最新代码..."
git pull origin main

# 2. 重新构建并启动容器（无停机时间）
echo "🔨 重新构建 Docker 镜像..."
docker compose build

echo "🚀 重启容器..."
docker compose up -d

# 3. 等待健康检查
echo "⏳ 等待服务启动..."
sleep 5

# 4. 验证服务
if curl -s http://localhost:8000/health > /dev/null; then
  echo "✅ 更新成功！服务已启动"
  docker compose ps
else
  echo "❌ 更新失败，服务未响应"
  docker compose logs --tail=50
  exit 1
fi
