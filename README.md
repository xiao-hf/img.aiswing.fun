# Aiswing Image Studio

可 Docker Compose 一键部署的图片生成工作台。浏览器只访问本站同源接口，Node 后端使用 SQLite 任务队列异步请求 `cdn.aiswing.fun`，生成结果保存到磁盘并在 48 小时后自动清理。

## 功能

- 支持 `gpt-image-2` 文生图
- 支持 4K：`3840x2160`、`2160x3840`
- 支持 `2880x2880` 超清方图
- 前端调用 `/api/tasks` 创建后台任务
- SQLite 存任务状态，磁盘存图片文件
- 任务完成或失败后清除加密 API Key
- 默认上游：`https://cdn.aiswing.fun`

## 一条命令部署

```bash
git clone https://github.com/YOUR_NAME/aiswing-image-studio.git
cd aiswing-image-studio
cp .env.example .env
# 务必修改 .env 里的 KEY_ENCRYPTION_SECRET
docker compose up -d --build
```

访问：

```text
http://服务器IP:3000
```

健康检查：

```bash
curl http://127.0.0.1:3000/health
```

应该看到类似：

```json
{"ok":true,"upstream":"https://cdn.aiswing.fun","build":"2026050607","mode":"sqlite-async-tasks"}
```

## 宝塔 / Nginx 反代

把站点反代到：

```text
http://127.0.0.1:3000
```

推荐：

```nginx
location / {
    proxy_pass http://127.0.0.1:3000;
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

## 配置

`.env` 关键项：

```env
HOST_PORT=3000
UPSTREAM=https://cdn.aiswing.fun
DATA_DIR=/app/data
SQLITE_PATH=/app/data/aiswing.sqlite
TASK_TTL_HOURS=48
KEY_ENCRYPTION_SECRET=change-this-secret-before-production
WORKER_CONCURRENCY=1
```

如果要让后端请求宿主机 8080 网关：

```env
UPSTREAM=http://host.docker.internal:8080
```

Linux Docker 下如访问宿主机不通，可在 `compose.yaml` 服务里加：

```yaml
extra_hosts:
  - "host.docker.internal:host-gateway"
```

## 数据存储

```text
data/
  aiswing.sqlite
  images/
    task_xxx.png
```

SQLite 只存任务元数据；图片文件存在 `data/images/`。

## API

创建任务：

```bash
curl http://127.0.0.1:3000/api/tasks \
  -H 'Authorization: Bearer sk-your-key' \
  -H 'Content-Type: application/json' \
  --data '{"model":"gpt-image-2","prompt":"a red apple","size":"1024x1024","response_format":"b64_json","output_format":"png"}'
```

查询任务：

```bash
curl http://127.0.0.1:3000/api/tasks/TASK_ID \
  -H 'Authorization: Bearer sk-your-key'
```

下载图片：

```bash
curl http://127.0.0.1:3000/api/tasks/TASK_ID/image \
  -H 'Authorization: Bearer sk-your-key' \
  -o result.png
```

## 常用命令

```bash
docker compose up -d --build
docker compose logs -f
docker compose restart
docker compose down
```
