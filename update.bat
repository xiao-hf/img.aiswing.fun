@echo off
REM 无感更新脚本 - Windows 版本
echo 🔄 开始更新 Aiswing Image Studio...

REM 1. 拉取最新代码
echo 📥 拉取最新代码...
git pull origin main
if %errorlevel% neq 0 (
    echo ❌ Git 拉取失败
    exit /b 1
)

REM 2. 重新构建并启动容器
echo 🔨 重新构建 Docker 镜像...
docker compose build
if %errorlevel% neq 0 (
    echo ❌ Docker 构建失败
    exit /b 1
)

echo 🚀 重启容器...
docker compose up -d
if %errorlevel% neq 0 (
    echo ❌ Docker 启动失败
    exit /b 1
)

REM 3. 等待服务启动
echo ⏳ 等待服务启动...
timeout /t 5 /nobreak >nul

REM 4. 验证服务
curl -s http://localhost:8000/health >nul 2>&1
if %errorlevel% equ 0 (
    echo ✅ 更新成功！服务已启动
    docker compose ps
) else (
    echo ❌ 更新失败，服务未响应
    docker compose logs --tail=50
    exit /b 1
)
