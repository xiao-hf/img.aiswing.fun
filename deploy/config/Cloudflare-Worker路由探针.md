# Cloudflare Worker 路由探针

如果完整 Worker 不生效，先用这个最小探针确认 Route 是否配置正确。

1. 新建 Worker，粘贴 `cloudflare-worker-canary.js`。
2. 添加 Route：

   `img.aiswing.fun/__worker_canary__*`

3. 访问：

   `https://img.aiswing.fun/__worker_canary__`

成功时必须看到：

`worker canary ok build 2026050603`

并且响应头有：

- `X-Aiswing-Build: 2026050603`
- `X-Aiswing-Proxy: cloudflare-worker-canary`

如果这个地址仍然是 nginx 404，说明不是 Worker 代码问题，而是：

- Route 没保存成功；或
- Route 填错；或
- DNS 不是橙云代理；或
- Worker 没绑定到当前 zone。

探针成功后，再把 Route 改成 `img.aiswing.fun/*` 并部署完整 Worker：

`cloudflare-worker-full-site-module.js`
