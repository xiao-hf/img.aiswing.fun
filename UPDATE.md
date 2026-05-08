# 更新指南

## 方式一：本地脚本更新（推荐）

### Linux/Mac
```bash
chmod +x update.sh
./update.sh
```

### Windows
```cmd
update.bat
```

这个脚本会：
1. 从 GitHub 拉取最新代码
2. 重新构建 Docker 镜像
3. 重启容器（无停机时间）
4. 验证服务是否正常

---

## 方式二：在线 API 更新

项目内置了在线更新功能，可以通过 HTTP 请求触发更新。

### 1. 配置更新 Token

编辑 `.env` 文件，设置一个强随机 Token：

```env
UPDATE_TOKEN=your-strong-random-token-here
```

**生成随机 Token：**
```bash
# Linux/Mac
openssl rand -hex 32

# Windows PowerShell
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 }))
```

### 2. 重启容器使配置生效

```bash
docker compose restart
```

### 3. 触发更新

**方式 A：使用 curl**
```bash
curl -X POST http://localhost:8000/api/update \
  -H "X-Update-Token: your-strong-random-token-here"
```

**方式 B：浏览器访问**
```
http://localhost:8000/api/update?token=your-strong-random-token-here
```

### 4. 查看更新状态

```bash
curl http://localhost:8000/api/update/status \
  -H "X-Update-Token: your-strong-random-token-here"
```

---

## 更新流程说明

在线更新会执行以下步骤：

1. 克隆最新代码到临时目录
2. 复制文件到 `/app/`
3. 安装依赖 `npm install --omit=dev`
4. 验证代码 `node --check server.js`
5. 自动重启服务（如果 `UPDATE_RESTART=true`）

**注意：**
- 更新过程中服务会短暂中断（约 10-30 秒）
- `data/` 目录不会被覆盖，数据安全
- 更新失败会保留原有代码

---

## 自定义更新命令

如果需要自定义更新流程，可以在 `.env` 中设置：

```env
UPDATE_COMMAND=cd /app && git pull && npm install --omit=dev && node --check server.js
UPDATE_RESTART=true
UPDATE_TIMEOUT_MS=600000
```

---

## 安全建议

1. **强 Token**：使用至少 32 字符的随机字符串
2. **HTTPS**：生产环境建议使用 HTTPS + Nginx 反向代理
3. **防火墙**：限制更新接口只能从特定 IP 访问
4. **备份**：更新前备份 `data/` 目录

---

## 故障排查

### 更新失败怎么办？

1. 查看更新日志：
```bash
curl http://localhost:8000/api/update/status \
  -H "X-Update-Token: your-token"
```

2. 查看容器日志：
```bash
docker compose logs -f
```

3. 手动回滚：
```bash
git reset --hard HEAD~1
docker compose restart
```

### 更新后服务无法启动？

```bash
# 查看错误日志
docker compose logs --tail=100

# 回滚到上一个版本
git log --oneline -5
git reset --hard <commit-hash>
docker compose up -d --build
```
