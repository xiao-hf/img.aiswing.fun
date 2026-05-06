# Docker Compose 部署说明

## 服务器准备

安装 Docker 和 Compose 插件：

```bash
curl -fsSL https://get.docker.com | bash
systemctl enable --now docker
```

## 部署

```bash
git clone https://github.com/YOUR_NAME/aiswing-image-studio.git
cd aiswing-image-studio
cp .env.example .env
docker compose up -d --build
```

## 验证

```bash
docker compose ps
curl http://127.0.0.1:3000/health
```

## 更新

```bash
git pull
docker compose up -d --build
```

## 域名反代

把 `img.aiswing.fun` 反代到：

```text
http://127.0.0.1:3000
```

Nginx 参考配置见：

```text
deploy/config/nginx-node-backend.conf
```

## 改成本机 8080 上游

如果你本机还有一个 API 网关跑在宿主机 `8080`，编辑 `.env`：

```env
UPSTREAM=http://host.docker.internal:8080
```

Linux 下可能还需要在 `compose.yaml` 的服务里加：

```yaml
extra_hosts:
  - "host.docker.internal:host-gateway"
```
