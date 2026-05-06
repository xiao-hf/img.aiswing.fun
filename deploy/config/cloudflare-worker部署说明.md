# Cloudflare Worker 反代部署说明

适用场景：服务器不执行 PHP，或不方便改 Nginx。你当前线上 `api.php` 会输出源码，说明 PHP 方案不可用；Cloudflare Worker 可以直接在边缘处理 `/v1/images/*`。

步骤：

1. Cloudflare 后台进入 Workers & Pages，新建 Worker。
2. 把 `cloudflare-worker-v1-images.js` 的内容粘贴进去并部署。
3. 给 Worker 添加 Route：

   `img.aiswing.fun/v1/images/*`

4. 确认 DNS 里 `img.aiswing.fun` 是橙云代理状态。
5. 上传 `delivery/upload-img-site/` 里的静态文件到网站根目录。
6. 删除服务器上的 `api.php`。
7. 清 Cloudflare 缓存，至少清：
   - `https://img.aiswing.fun/`
   - `https://img.aiswing.fun/app.js`
8. 浏览器 Ctrl+F5 强刷。

验证：

浏览器 DevTools 里生成请求应该是：

`https://img.aiswing.fun/v1/images/generations`

如果用无效 Key 测试，预期不是 `Failed to fetch`，而是正常返回 JSON 错误，例如 `INVALID_API_KEY`。这说明跨域/代理已打通。
