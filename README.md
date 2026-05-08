# Aiswing Image Studio

A Docker Compose deployable image-generation workspace. The browser only calls same-origin APIs. The Node backend uses a SQLite task queue, calls `cdn.aiswing.fun` asynchronously, saves generated images on disk, and cleans completed tasks after 48 hours.

## Features

- Text-to-image and reference-image tasks with `gpt-image-2`
- 4K sizes: `3840x2160`, `2160x3840`
- Ultra square size: `2880x2880`
- Frontend creates backend tasks through `/api/tasks`
- SQLite stores task metadata; image files are stored on disk
- API keys are encrypted while queued and removed after task completion/failure
- Frontend static files are under `frontend/`
- Optional one-click web update, similar to sub2api
- Default upstream: `https://cdn.aiswing.fun`

## Project layout

```text
frontend/      Static frontend pages, JS, CSS, API docs
server.js      Node backend, SQLite task queue, upstream proxy
data/          Runtime SQLite database and images; created automatically; not committed
deploy/        Nginx, systemd and deployment scripts
delivery/      Packaged delivery artifacts; not committed
```

## Deploy with Docker Compose

```bash
git clone https://github.com/xiao-hf/img.aiswing.fun.git
cd img.aiswing.fun
cp .env.example .env
# Change KEY_ENCRYPTION_SECRET. Set UPDATE_TOKEN only if you need web one-click update.
docker compose up -d --build
```

Open:

```text
http://SERVER_IP:8000
```

Health check:

```bash
curl http://127.0.0.1:8000/health
```

Expected example:

```json
{"ok":true,"upstream":"https://cdn.aiswing.fun","build":"2026050705","mode":"sqlite-async-tasks"}
```

## Configuration

Important `.env` values:

```env
HOST_PORT=8000
UPSTREAM=https://cdn.aiswing.fun
DATA_DIR=/app/data
SQLITE_PATH=/app/data/aiswing.sqlite
TASK_TTL_HOURS=48
KEY_ENCRYPTION_SECRET=change-this-secret-before-production
WORKER_CONCURRENCY=1
UPDATE_TOKEN=change-this-to-a-long-random-token-or-leave-empty
UPDATE_RESTART=true
UPDATE_TIMEOUT_MS=600000
```

If your upstream gateway runs on the Docker host:

```env
UPSTREAM=http://host.docker.internal:8080
```

## Nginx reverse proxy

Proxy the site to:

```text
http://127.0.0.1:8000
```

Recommended Nginx config:

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

## One-click web update

The web page has an `Update` button. Enable it by setting a strong random token in `.env`:

```env
UPDATE_TOKEN=change-this-to-a-long-random-token
```

When clicked, the backend checks the token, pulls the latest code from GitHub, validates `server.js`, and restarts the Node process. In Docker, `restart: unless-stopped` starts the container again.

The default update command copies fresh code into `/app`, but it does **not** delete the data directory.

Data survives updates because Compose mounts runtime data from the host:

```yaml
volumes:
  - ./data:/app/data
```

Therefore `git pull`, web update, and `docker compose up -d --build` will not clear SQLite or generated images. Do not manually delete the host-side `./data` directory.

## Data storage

```text
data/
  aiswing.sqlite
  images/
    task_xxx.png
```

SQLite stores task metadata. Images are stored in `data/images/`.

## API

Create a text-to-image task:

```bash
curl http://127.0.0.1:8000/api/tasks   -H 'Authorization: Bearer sk-your-key'   -H 'Content-Type: application/json'   --data '{"model":"gpt-image-2","prompt":"a red apple","size":"1024x1024","quality":"high","format":"png","reference_images":[]}'
```

Query a task:

```bash
curl http://127.0.0.1:8000/api/tasks/TASK_ID   -H 'Authorization: Bearer sk-your-key'
```

Download an image:

```bash
curl http://127.0.0.1:8000/api/tasks/TASK_ID/image   -H 'Authorization: Bearer sk-your-key'   -o result.png
```

## Common commands

```bash
docker compose up -d --build
docker compose logs -f
docker compose restart
docker compose down
```

