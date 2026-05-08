# Aiswing Image Studio

[English](README.md) | 简体中文

基于 Docker Compose 部署的图像生成工作台。浏览器仅调用同源 API，Node 后端使用 SQLite 任务队列，异步调用 `cdn.aiswing.fun`，将生成的图片保存到磁盘，并在 48 小时后清理已完成的任务。

## 功能特性

- 支持文生图和图生图任务，使用 `gpt-image-2` 模型
- 4K 尺寸支持：`3840x2160`（横屏）、`2160x3840`（竖屏）
- 超大方图：`2880x2880`
- 前端通过 `/api/tasks` 创建后端任务
- SQLite 存储任务元数据；图片文件存储在磁盘
- API Key 在队列中加密存储，任务完成/失败后自动删除
- 前端静态文件位于 `frontend/` 目录
- 可选的一键在线更新功能，类似 sub2api
- 默认上游：`https://cdn.aiswing.fun`
- 支持中英文界面切换
- 深色/浅色主题切换

## 项目结构

```text
frontend/      前端静态页面、JS、CSS、API 文档
server.js      Node 后端、SQLite 任务队列、上游代理
data/          运行时 SQLite 数据库和图片；自动创建；不提交到 Git
deploy/        Nginx、systemd 和部署脚本
delivery/      打包的交付产物；不提交到 Git
```

## 使用 Docker Compose 部署

```bash
git clone https://github.com/xiao-hf/img.aiswing.fun.git
cd img.aiswing.fun
cp .env.example .env
# 修改 KEY_ENCRYPTION_SECRET。如果需要在线更新功能，设置 UPDATE_TOKEN。
docker compose up -d --build
```

访问：

```text
http://服务器IP:8000
```

健康检查：

```bash
curl http://127.0.0.1:8000/health
```

预期返回示例：

```json
{"ok":true,"upstream":"https://cdn.aiswing.fun","build":"2026050933","mode":"sqlite-async-tasks"}
```

## 配置说明

重要的 `.env` 配置项：

```env
HOST_PORT=8000                    # 宿主机端口
UPSTREAM=https://cdn.aiswing.fun  # 上游 API 地址
DATA_DIR=/app/data                # 数据目录
SQLITE_PATH=/app/data/aiswing.sqlite  # SQLite 数据库路径
TASK_TTL_HOURS=48                 # 任务保留时长（小时）
KEY_ENCRYPTION_SECRET=change-this-secret-before-production  # 加密密钥（必须修改）
WORKER_CONCURRENCY=1              # 并发工作线程数
UPDATE_TOKEN=                     # 在线更新 Token（可选）
UPDATE_RESTART=true               # 更新后自动重启
UPDATE_TIMEOUT_MS=600000          # 更新超时时间（毫秒）
```

如果上游网关运行在 Docker 宿主机上：

```env
UPSTREAM=http://host.docker.internal:8080
```

## Nginx 反向代理

将站点代理到：

```text
http://127.0.0.1:8000
```

推荐的 Nginx 配置：

```nginx
location / {
    proxy_pass http://127.0.0.1:8000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_connect_timeout 60s;
    proxy_send_timeout 300s;
    proxy_read_timeout 300s;
    client_max_body_size 60m;
}
```

## 在线更新

项目支持两种更新方式：

### 方式一：本地脚本更新（推荐）

```bash
# Linux/Mac
./update.sh

# Windows
update.bat
```

### 方式二：在线 API 更新

1. 在 `.env` 中设置 `UPDATE_TOKEN`
2. 重启容器：`docker compose restart`
3. 触发更新：

```bash
curl -X POST http://localhost:8000/api/update \
  -H "X-Update-Token: your-token"
```

详细说明请查看 [UPDATE.md](UPDATE.md)

## 数据迁移

所有数据存储在 `data/` 目录：

```text
data/
  ├── aiswing.sqlite    # SQLite 数据库
  └── images/           # 生成的图片
```

**迁移步骤：**

```bash
# 1. 备份数据
tar -czf data-backup.tar.gz data/

# 2. 在新服务器上恢复
tar -xzf data-backup.tar.gz

# 3. 启动容器
docker compose up -d
```

**注意：** `KEY_ENCRYPTION_SECRET` 必须在新旧服务器保持一致，否则无法解密 API Key。

## 开发

本地开发运行：

```bash
npm install
npm start
```

访问 `http://localhost:3000`

## 技术栈

- **前端**：原生 JavaScript、CSS Variables（主题切换）
- **后端**：Node.js、SQLite、better-sqlite3
- **部署**：Docker、Docker Compose
- **代理**：Nginx（可选）

## 开源协议

[MIT License](LICENSE)

## 贡献

欢迎提交 Issue 和 Pull Request！

## 相关链接

- [API 文档](frontend/docs.html)
- [更新指南](UPDATE.md)
- [GitHub 仓库](https://github.com/xiao-hf/img.aiswing.fun)
