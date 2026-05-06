# Node 后端部署方案（推荐）

后端会把前端兼容格式 /v1/images/generations 自动转换为参考程序使用的 Responses API：/v1/responses + image_generation。

这个方案把 CORS 问题彻底绕开：浏览器只访问 `img.aiswing.fun`，Node 后端再去请求 `https://cdn.aiswing.fun`。

## 交付包

上传：

`delivery/node-backend-app.zip`

解压到：

`/www/wwwroot/img.aiswing.fun/`

## 启动方式 A：PM2

```bash
cd /www/wwwroot/img.aiswing.fun
node --check server.js
npm i -g pm2
pm2 startOrReload ecosystem.config.cjs --env production
pm2 save
curl http://127.0.0.1:3000/health
```

## 启动方式 B：systemd

```bash
cd /www/wwwroot/img.aiswing.fun
bash deploy/scripts/install-node-backend-systemd.sh img.aiswing.fun /www/wwwroot/img.aiswing.fun 3000
```

## 宝塔/Nginx 反向代理

把站点 `img.aiswing.fun` 反向代理到：

```text
http://127.0.0.1:3000
```

或者把这个文件里的 `location /` 放入站点 Nginx 配置：

`deploy/config/nginx-node-backend.conf`

## 验证

```bash
curl https://img.aiswing.fun/health
```

应该返回：

```json
{"ok":true,"upstream":"https://cdn.aiswing.fun","build":"2026050606"}
```

再测代理：

```bash
curl -i https://img.aiswing.fun/v1/images/generations \
  -H 'Authorization: Bearer sk-invalid' \
  -H 'Content-Type: application/json' \
  --data '{"model":"gpt-image-2","prompt":"test","size":"3840x2160","response_format":"b64_json"}'
```

无效 key 返回 `401` 是正常的；关键是响应头应有：

```text
X-Aiswing-Proxy: node-backend-responses
```

## 线上还是旧页面怎么办

如果 `https://img.aiswing.fun/health` 是 404，说明 Nginx 没代理到 Node。

如果 `https://img.aiswing.fun/api.php` 还能看到 PHP 源码，建议删除源站旧文件：

```bash
rm -f /www/wwwroot/img.aiswing.fun/api.php
```

## 4K Notes

`gpt-image-2` has been tested with streaming output for `3840x2160` and `2160x3840`. A 4K request can be long-running, so keep the browser calling this Node backend on the same origin, and let Node continuously read the upstream SSE stream. The bundled Nginx config uses `proxy_read_timeout 300s`.
