# Cloudflare Worker 完整接管方案（优先用这个）

当前线上问题：

- 源站新版文件没有覆盖成功：`/version.txt`、`/diagnose.html` 都是 404
- 旧 `api.php` 仍存在并暴露源码
- `/v1/images/generations` 仍是 `404 nginx`

因此推荐直接用 Cloudflare Worker 接管 `img.aiswing.fun/*`，绕过源站目录和 Nginx 配置问题。

## 使用哪个文件

优先使用：

`cloudflare-worker-full-site-module.js`

这是 Cloudflare 新版 Workers 后台常用的 module 语法：

```js
export default { async fetch(request) { ... } }
```

如果你的 Worker 编辑器是旧版 Service Worker 语法，再用：

`cloudflare-worker-full-site.js`

## 部署步骤

1. Cloudflare 后台 -> Workers & Pages -> Create Worker。
2. 删除默认代码。
3. 复制 `cloudflare-worker-full-site-module.js` 全部内容进去。
4. Save and Deploy。
5. 进入 Worker 的 Settings / Triggers / Routes。
6. 添加 Route：

   `img.aiswing.fun/*`

7. 确认 DNS 里 `img.aiswing.fun` 是橙云。
8. 清缓存或等几十秒。

## 验证

访问：

`https://img.aiswing.fun/version.txt`

必须看到：

`build 2026050603`

访问：

`https://img.aiswing.fun/diagnose.html`

点击诊断。成功时：

- version 检查通过
- app.js 检查通过
- /v1/images 检查不再是 `404 nginx` 或 `Failed to fetch`

注意：用无效 key 时 `/v1/images` 返回 401 JSON 是正常的，说明代理已通。

## 成功后的请求形态

前端应该请求：

`https://img.aiswing.fun/v1/images/generations`

Worker 再转发到：

`https://gpt.aiswing.fun/v1/images/generations`

## 回滚

删除 Worker Route：

`img.aiswing.fun/*`
