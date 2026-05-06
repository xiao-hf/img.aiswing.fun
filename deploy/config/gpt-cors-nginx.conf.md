# 如果能改 gpt.aiswing.fun：直接允许 img.aiswing.fun 跨域

当前前端直连 `https://gpt.aiswing.fun/v1/images/generations` 时失败，本质是 gpt 服务没有返回 CORS 头。

如果你能修改 `gpt.aiswing.fun` 的 Nginx 配置，在它的 `server { ... }` 内加入下面规则即可。

## Nginx 配置片段

```nginx
# 放在 gpt.aiswing.fun 的 server { ... } 内

set $cors_origin "";
if ($http_origin = "https://img.aiswing.fun") {
    set $cors_origin $http_origin;
}
if ($http_origin = "http://img.aiswing.fun") {
    set $cors_origin $http_origin;
}

location /v1/images/ {
    if ($request_method = OPTIONS) {
        add_header Access-Control-Allow-Origin $cors_origin always;
        add_header Access-Control-Allow-Methods "POST, OPTIONS" always;
        add_header Access-Control-Allow-Headers "Authorization, Content-Type" always;
        add_header Access-Control-Max-Age 86400 always;
        add_header Content-Length 0;
        add_header Content-Type text/plain;
        return 204;
    }

    add_header Access-Control-Allow-Origin $cors_origin always;
    add_header Access-Control-Allow-Methods "POST, OPTIONS" always;
    add_header Access-Control-Allow-Headers "Authorization, Content-Type" always;

    # 这里保留你原本 gpt 服务的 proxy_pass / fastcgi / upstream 配置
    # 不要直接照抄覆盖原 location 的业务转发，只把 add_header 和 OPTIONS 逻辑合进去。
}
```

## 验证

执行：

```bash
curl -i -X OPTIONS 'https://gpt.aiswing.fun/v1/images/generations' \
  -H 'Origin: https://img.aiswing.fun' \
  -H 'Access-Control-Request-Method: POST' \
  -H 'Access-Control-Request-Headers: authorization,content-type'
```

成功时应该看到：

```text
HTTP/2 204
access-control-allow-origin: https://img.aiswing.fun
access-control-allow-methods: POST, OPTIONS
access-control-allow-headers: Authorization, Content-Type
```

然后前端可以继续直接请求：

`https://gpt.aiswing.fun/v1/images/generations`

不再 `Failed to fetch`。
