#!/usr/bin/env node
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { exec } = require("child_process");
const { URL } = require("url");
const Database = require("better-sqlite3");

const root = __dirname;
const frontendRoot = path.join(root, "frontend");
const host = process.env.HOST || "0.0.0.0";
const port = Number(process.env.PORT || 3000);
const upstream = (process.env.UPSTREAM || "https://cdn.aiswing.fun").replace(/\/+$/, "");
const maxBodyBytes = Number(process.env.MAX_BODY_BYTES || 60 * 1024 * 1024);
const build = "2026050939";
const dataDir = path.resolve(root, process.env.DATA_DIR || "data");
const imageDir = path.join(dataDir, "images");
const dbPath = process.env.SQLITE_PATH || path.join(dataDir, "aiswing.sqlite");
const taskTtlHours = Number(process.env.TASK_TTL_HOURS || 48);
const cleanupIntervalMs = Number(process.env.CLEANUP_INTERVAL_MINUTES || 10) * 60 * 1000;
const keySecret = process.env.KEY_ENCRYPTION_SECRET || "change-this-secret-before-production";
const workerConcurrency = Math.max(1, Number(process.env.WORKER_CONCURRENCY || 1));
const updateToken = process.env.UPDATE_TOKEN || "";
const updateCommand = process.env.UPDATE_COMMAND || "rm -rf /tmp/aiswing-image-studio-update && git clone --depth 1 https://github.com/xiao-hf/img.aiswing.fun.git /tmp/aiswing-image-studio-update && cp -a /tmp/aiswing-image-studio-update/. /app/ && npm install --omit=dev && node --check server.js";
const updateTimeoutMs = Number(process.env.UPDATE_TIMEOUT_MS || 10 * 60 * 1000);
const updateRestart = String(process.env.UPDATE_RESTART || "true").toLowerCase() !== "false";
let updateState = {
  running: false,
  started_at: null,
  finished_at: null,
  exit_code: null,
  output: "",
  error: "",
};

fs.mkdirSync(imageDir, { recursive: true });

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml; charset=utf-8",
  ".ico": "image/x-icon",
};

const publicFiles = new Map([
  ["/", "index.html"],
  ["/index.html", "index.html"],
  ["/app.js", "app.js"],
  ["/styles.css", "styles.css"],
  ["/docs.html", "docs.html"],
  ["/diagnose.html", "diagnose.html"],
  ["/version.txt", "version.txt"],
  ["/favicon.ico", "favicon.ico"],
]);

const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("busy_timeout = 5000");
db.exec(`
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  api_key_hash TEXT NOT NULL,
  api_key_enc TEXT,
  model TEXT NOT NULL,
  prompt TEXT NOT NULL,
  size TEXT NOT NULL,
  quality TEXT,
  format TEXT NOT NULL,
  reference_images TEXT,
  reference_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  progress TEXT,
  result_path TEXT,
  error_message TEXT,
  created_at INTEGER NOT NULL,
  started_at INTEGER,
  completed_at INTEGER,
  expires_at INTEGER,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tasks_status_created ON tasks(status, created_at);
CREATE INDEX IF NOT EXISTS idx_tasks_hash_created ON tasks(api_key_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_expires ON tasks(expires_at);
`);

function ensureColumn(tableName, columnName, definition) {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
  if (!columns.some((column) => column.name === columnName)) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }
}

ensureColumn("tasks", "reference_images", "TEXT");
ensureColumn("tasks", "reference_count", "INTEGER NOT NULL DEFAULT 0");

const statements = {
  insertTask: db.prepare(`
    INSERT INTO tasks (
      id, api_key_hash, api_key_enc, model, prompt, size, quality, format,
      reference_images, reference_count,
      status, progress, created_at, updated_at
    ) VALUES (
      @id, @api_key_hash, @api_key_enc, @model, @prompt, @size, @quality, @format,
      @reference_images, @reference_count,
      @status, @progress, @created_at, @updated_at
    )
  `),
  getTask: db.prepare("SELECT * FROM tasks WHERE id = ?"),
  listTasksByHash: db.prepare(`
    SELECT id, model, prompt, size, quality, format, reference_count, status, progress, error_message,
           created_at, started_at, completed_at, expires_at, updated_at
    FROM tasks
    WHERE api_key_hash = ?
    ORDER BY created_at DESC
    LIMIT ?
  `),
  markRunning: db.prepare(`
    UPDATE tasks
    SET status = 'running', progress = @progress, started_at = @started_at, updated_at = @updated_at
    WHERE id = @id AND status = 'pending'
  `),
  updateProgress: db.prepare(`
    UPDATE tasks
    SET progress = @progress, updated_at = @updated_at
    WHERE id = @id
  `),
  markSucceeded: db.prepare(`
    UPDATE tasks
    SET status = 'succeeded', progress = @progress, result_path = @result_path,
        api_key_enc = NULL, reference_images = NULL,
        completed_at = @completed_at, expires_at = @expires_at,
        updated_at = @updated_at
    WHERE id = @id
  `),
  markFailed: db.prepare(`
    UPDATE tasks
    SET status = 'failed', progress = @progress, error_message = @error_message,
        api_key_enc = NULL, reference_images = NULL,
        completed_at = @completed_at, expires_at = @expires_at,
        updated_at = @updated_at
    WHERE id = @id
  `),
  deleteTask: db.prepare("DELETE FROM tasks WHERE id = ?"),
  expiredTasks: db.prepare("SELECT id, result_path FROM tasks WHERE expires_at IS NOT NULL AND expires_at <= ? LIMIT 200"),
  pendingTasks: db.prepare("SELECT id FROM tasks WHERE status = 'pending' ORDER BY created_at ASC LIMIT ?"),
};

function nowMs() {
  return Date.now();
}

function createTaskId() {
  return `task_${Date.now().toString(36)}_${crypto.randomBytes(8).toString("hex")}`;
}

function hashApiKey(apiKey) {
  return crypto.createHash("sha256").update(String(apiKey || "")).digest("hex");
}

function encryptionKey() {
  return crypto.createHash("sha256").update(String(keySecret)).digest();
}

function encryptText(text) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(text), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}.${tag.toString("base64")}.${encrypted.toString("base64")}`;
}

function decryptText(value) {
  const [ivRaw, tagRaw, encryptedRaw] = String(value || "").split(".");
  if (!ivRaw || !tagRaw || !encryptedRaw) throw new Error("Invalid encrypted value");
  const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivRaw, "base64"));
  decipher.setAuthTag(Buffer.from(tagRaw, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedRaw, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

function safeTask(task) {
  if (!task) return null;
  const imageUrl = task.status === "succeeded" ? `/api/tasks/${task.id}/image` : "";
  return {
    id: task.id,
    model: task.model,
    prompt: task.prompt,
    size: task.size,
    quality: task.quality || "",
    format: task.format || "png",
    mode: task.reference_count > 0 ? "edit" : "generate",
    reference_count: task.reference_count || 0,
    status: task.status,
    progress: task.progress || "",
    error_message: task.error_message || "",
    image_url: imageUrl,
    created_at: task.created_at,
    started_at: task.started_at,
    completed_at: task.completed_at,
    expires_at: task.expires_at,
    updated_at: task.updated_at,
  };
}

function normalizeReferenceImages(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const raw = typeof item === "string" ? item : item?.image_url || item?.data_url || item?.dataUrl || "";
      const imageUrl = String(raw || "").trim();
      if (!imageUrl) return "";
      if (/^data:image\/(?:png|jpe?g|webp);base64,[a-z0-9+/=\s]+$/i.test(imageUrl)) {
        return imageUrl.replace(/\s/g, "");
      }
      if (/^https?:\/\//i.test(imageUrl)) return imageUrl;
      return "";
    })
    .filter(Boolean)
    .slice(0, 8);
}

function requireBearer(req) {
  const value = req.headers.authorization || "";
  const match = value.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

function resolveResultPath(task) {
  if (!task?.result_path) return "";
  const resolved = path.resolve(dataDir, task.result_path);
  if (!resolved.startsWith(path.resolve(imageDir))) return "";
  return resolved;
}

let activeWorkers = 0;

function queueWorkerTick() {
  while (activeWorkers < workerConcurrency) {
    const next = statements.pendingTasks.get(1);
    if (!next) return;
    activeWorkers += 1;
    processTask(next.id)
      .catch((error) => console.error(`Task worker failed for ${next.id}:`, error))
      .finally(() => {
        activeWorkers -= 1;
        setImmediate(queueWorkerTick);
      });
  }
}

async function processTask(taskId) {
  const task = statements.getTask.get(taskId);
  if (!task || task.status !== "pending") return;

  const startedAt = nowMs();
  const changed = statements.markRunning.run({
    id: taskId,
    progress: "queued",
    started_at: startedAt,
    updated_at: startedAt,
  });
  if (!changed.changes) return;

  let apiKey = "";
  try {
    apiKey = decryptText(task.api_key_enc);
    const payload = {
      model: task.model,
      prompt: task.prompt,
      size: task.size,
      response_format: "b64_json",
      output_format: task.format || "png",
    };
    if (task.quality) payload.quality = task.quality;
    const references = normalizeReferenceImages(JSON.parse(task.reference_images || "[]"));
    if (references.length) payload.reference_images = references;

    const b64 = await generateImageB64(payload, apiKey, (progress) => {
      statements.updateProgress.run({ id: taskId, progress, updated_at: nowMs() });
    });
    const resultPath = writeResultImage(taskId, task.format, b64);
    const completedAt = nowMs();
    statements.markSucceeded.run({
      id: taskId,
      progress: "completed",
      result_path: resultPath,
      completed_at: completedAt,
      expires_at: completedAt + taskTtlHours * 60 * 60 * 1000,
      updated_at: completedAt,
    });
  } catch (error) {
    const completedAt = nowMs();
    statements.markFailed.run({
      id: taskId,
      progress: "failed",
      error_message: error.message || "Task failed",
      completed_at: completedAt,
      expires_at: completedAt + taskTtlHours * 60 * 60 * 1000,
      updated_at: completedAt,
    });
  }
}

function cleanupExpiredTasks() {
  const expired = statements.expiredTasks.all(nowMs());
  for (const task of expired) {
    if (task.result_path) {
      const filePath = resolveResultPath(task);
      if (filePath) fs.rmSync(filePath, { force: true });
    }
    statements.deleteTask.run(task.id);
  }
  return expired.length;
}

setInterval(() => {
  try { cleanupExpiredTasks(); } catch (error) { console.error("cleanup failed:", error); }
}, cleanupIntervalMs).unref();

function send(res, status, body, headers = {}) {
  res.writeHead(status, headers);
  res.end(body);
}

function sendJson(res, status, payload, headers = {}) {
  send(res, status, JSON.stringify(payload), {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...headers,
  });
}

function isAllowedApiPath(pathname) {
  return (
    pathname === "/v1/images/generations" ||
    pathname === "/v1/images/generations/events" ||
    pathname === "/v1/images/edits" ||
    pathname === "/v1/responses"
  );
}

async function readBody(req) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > maxBodyBytes) {
      throw Object.assign(new Error("Request body too large"), { statusCode: 413 });
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function requireUpdateToken(req, requestUrl) {
  if (!updateToken) return { ok: false, status: 503, message: "Online update is disabled. Set UPDATE_TOKEN in .env first." };
  const headerToken = req.headers["x-update-token"] || "";
  const bearerToken = requireBearer(req);
  const queryToken = requestUrl.searchParams.get("token") || "";
  const provided = String(headerToken || bearerToken || queryToken).trim();
  if (!provided) return { ok: false, status: 401, message: "Missing update token" };
  const a = Buffer.from(provided);
  const b = Buffer.from(updateToken);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, status: 403, message: "Invalid update token" };
  }
  return { ok: true };
}

function publicUpdateState() {
  return {
    enabled: Boolean(updateToken),
    running: updateState.running,
    started_at: updateState.started_at,
    finished_at: updateState.finished_at,
    exit_code: updateState.exit_code,
    output: updateState.output.slice(-12000),
    error: updateState.error,
    command: updateCommand,
    restart: updateRestart,
  };
}

function runUpdateCommand() {
  if (updateState.running) return false;
  updateState = {
    running: true,
    started_at: Date.now(),
    finished_at: null,
    exit_code: null,
    output: "",
    error: "",
  };
  const child = exec(updateCommand, {
    cwd: root,
    timeout: updateTimeoutMs,
    windowsHide: true,
    maxBuffer: 1024 * 1024 * 10,
  }, (error, stdout, stderr) => {
    updateState.running = false;
    updateState.finished_at = Date.now();
    updateState.output = `${stdout || ""}${stderr || ""}`.slice(-12000);
    if (error) {
      updateState.exit_code = typeof error.code === "number" ? error.code : 1;
      updateState.error = error.message || "Update command failed";
      return;
    }
    updateState.exit_code = 0;
    if (updateRestart) {
      updateState.output = `${updateState.output}
Update completed. Restarting process...`.slice(-12000);
      setTimeout(() => process.exit(0), 1500).unref();
    }
  });
  child.stdout?.on("data", (chunk) => {
    updateState.output = `${updateState.output}${chunk}`.slice(-12000);
  });
  child.stderr?.on("data", (chunk) => {
    updateState.output = `${updateState.output}${chunk}`.slice(-12000);
  });
  return true;
}

async function handleUpdateApi(req, res, requestUrl) {
  if (req.method === "OPTIONS") {
    send(res, 204, "", {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Update-Token",
    });
    return;
  }

  const auth = requireUpdateToken(req, requestUrl);
  if (!auth.ok) {
    sendJson(res, auth.status, { error: { message: auth.message }, update: publicUpdateState() });
    return;
  }

  if (req.method === "GET") {
    sendJson(res, 200, { update: publicUpdateState() });
    return;
  }

  if (req.method === "POST") {
    if (updateState.running) {
      sendJson(res, 409, { error: { message: "Update is already running" }, update: publicUpdateState() });
      return;
    }
    runUpdateCommand();
    sendJson(res, 202, { ok: true, update: publicUpdateState() });
    return;
  }

  sendJson(res, 405, { error: { message: "Method Not Allowed" } });
}

function normalizeSize(size) {
  return size && size !== "auto" ? size : undefined;
}

function imagePayloadToResponsesPayload(pathname, payload) {
  if (pathname === "/v1/responses") return payload;

  const tool = {
    type: "image_generation",
    quality: payload.quality || "auto",
    output_format: payload.output_format || payload.format || "png",
  };
  const size = normalizeSize(payload.size);
  if (size) tool.size = size;
  if ((tool.output_format === "jpeg" || tool.output_format === "webp") && payload.output_compression) {
    tool.output_compression = payload.output_compression;
  }

  let input = payload.prompt || payload.input || "";
  const referenceImages = normalizeReferenceImages(
    payload.reference_images || payload.referenceImages || payload.images || payload.input_images,
  );
  if (referenceImages.length) {
    const content = [];
    const prompt = String(payload.prompt || "");
    if (prompt) content.push({ type: "input_text", text: prompt });
    for (const imageUrl of referenceImages) content.push({ type: "input_image", image_url: imageUrl });
    input = [{ role: "user", content }];
  } else if (pathname === "/v1/images/edits") {
    // Browser FormData uploads are forwarded directly by forwardRawApi.
    // JSON edit payloads may pass an input array already.
    input = payload.input || payload.prompt || "";
  }

  return {
    model: payload.model || "gpt-image-2",
    input,
    tools: [tool],
    stream: true,
  };
}

function getOutputFormat(payload) {
  return payload.output_format || payload.format || "png";
}

function extractImageB64FromEvent(evt) {
  if (evt.type === "response.image_generation_call.partial_image" && evt.partial_image_b64) {
    return evt.partial_image_b64;
  }
  if (evt.type === "response.completed") {
    for (const output of evt.response?.output || []) {
      if (output.type === "image_generation_call" && output.result) {
        return output.result;
      }
    }
  }
  return "";
}

async function generateImageB64(payload, apiKey, onProgress = () => {}) {
  const responsesPayload = imagePayloadToResponsesPayload("/v1/images/generations", payload);
  const target = new URL("/v1/responses", upstream);
  const upstreamResponse = await fetch(target, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(responsesPayload),
  });

  if (!upstreamResponse.ok) {
    const text = await upstreamResponse.text();
    let message = text || `HTTP ${upstreamResponse.status}`;
    try {
      const parsed = JSON.parse(text);
      message = parsed?.error?.message || parsed?.message || message;
    } catch {}
    const error = new Error(message);
    error.status = upstreamResponse.status;
    throw error;
  }

  if (!upstreamResponse.body) throw new Error("Responses API returned no readable stream");

  const reader = upstreamResponse.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (value) {
        buffer += decoder.decode(value, { stream: !done });
        const split = splitSseBlocks(buffer);
        buffer = split.rest;
        for (const block of split.blocks) {
          const data = extractSseData(block);
          if (!data || data === "[DONE]") continue;
          let evt;
          try {
            evt = JSON.parse(data);
          } catch {
            continue;
          }
          if (evt.type) onProgress(evt.type);
          const resultB64 = extractImageB64FromEvent(evt);
          if (resultB64) {
            try { await reader.cancel(); } catch {}
            return resultB64;
          }
          if (evt.type === "error" || evt.error) {
            throw new Error(evt.error?.message || evt.message || "Upstream image generation failed");
          }
        }
      }
      if (done) break;
    }
  } finally {
    try { reader.releaseLock(); } catch {}
  }

  throw new Error("Responses stream ended without image data");
}

function writeResultImage(taskId, format, b64) {
  const safeFormat = ["png", "jpeg", "jpg", "webp"].includes(String(format).toLowerCase())
    ? String(format).toLowerCase()
    : "png";
  const ext = safeFormat === "jpg" ? "jpeg" : safeFormat;
  const fileName = `${taskId}.${ext}`;
  const absolutePath = path.join(imageDir, fileName);
  fs.writeFileSync(absolutePath, Buffer.from(b64, "base64"));
  return path.relative(dataDir, absolutePath).replaceAll("\\", "/");
}

async function parseResponsesStream(upstreamResponse) {
  if (!upstreamResponse.ok) {
    const text = await upstreamResponse.text();
    return { ok: false, status: upstreamResponse.status, text };
  }

  if (!upstreamResponse.body) {
    return { ok: false, status: 502, text: JSON.stringify({ error: { message: "Responses API returned no readable stream" } }) };
  }

  const reader = upstreamResponse.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let rawPreview = "";

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      buffer += chunk;
      if (rawPreview.length < 1000) rawPreview += chunk;

      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6).trim();
        if (!data || data === "[DONE]") continue;

        let evt;
        try {
          evt = JSON.parse(data);
        } catch {
          continue;
        }

        const resultB64 = extractImageB64FromEvent(evt);
        if (resultB64) {
          try { await reader.cancel(); } catch {}
          return {
            ok: true,
            status: 200,
            text: JSON.stringify({ data: [{ b64_json: resultB64 }] }),
          };
        }
      }
    }
  } catch (error) {
    return {
      ok: false,
      status: 502,
      text: JSON.stringify({ error: { message: `Failed to read Responses stream: ${error.message}` }, raw: rawPreview.slice(0, 1000) }),
    };
  } finally {
    try { reader.releaseLock(); } catch {}
  }

  return {
    ok: false,
    status: 502,
    text: JSON.stringify({ error: { message: "Responses API returned no image data" }, raw: rawPreview.slice(0, 1000) }),
  };
}

function sendSseEvent(res, eventName, payload) {
  if (res.writableEnded || res.destroyed) return;
  res.write(`event: ${eventName}\n`);
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function extractSseData(block) {
  const dataLines = [];
  for (const line of block.split(/\r?\n/)) {
    if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
  }
  return dataLines.join("\n").trim();
}

function splitSseBlocks(buffer) {
  const blocks = [];
  let rest = buffer;
  while (true) {
    const match = rest.match(/\r?\n\r?\n/);
    if (!match || match.index === undefined) break;
    blocks.push(rest.slice(0, match.index));
    rest = rest.slice(match.index + match[0].length);
  }
  return { blocks, rest };
}

async function streamResponsesToClient(upstreamResponse, res, outputFormat) {
  if (!upstreamResponse.ok) {
    const text = await upstreamResponse.text();
    send(res, upstreamResponse.status, text, {
      "Content-Type": upstreamResponse.headers.get("content-type") || "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
      "X-Aiswing-Proxy": "node-backend-stream-error",
    });
    return;
  }

  if (!upstreamResponse.body) {
    sendJson(res, 502, { error: { message: "Responses API returned no readable stream" } });
    return;
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-store, no-transform",
    "Connection": "keep-alive",
    "Access-Control-Allow-Origin": "*",
    "X-Accel-Buffering": "no",
    "X-Aiswing-Proxy": "node-backend-client-stream",
  });

  const startedAt = Date.now();
  let reader;
  let closed = false;
  const heartbeat = setInterval(() => {
    sendSseEvent(res, "keepalive", { type: "proxy.keepalive", elapsed_ms: Date.now() - startedAt });
  }, 15000);

  res.on("close", () => {
    closed = true;
    clearInterval(heartbeat);
    if (reader) {
      reader.cancel().catch(() => {});
    }
  });

  sendSseEvent(res, "ready", { type: "proxy.ready", build, upstream });

  reader = upstreamResponse.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const handleBlock = (block) => {
    const data = extractSseData(block);
    if (!data || data === "[DONE]") return false;

    let evt;
    try {
      evt = JSON.parse(data);
    } catch {
      return false;
    }

    const resultB64 = extractImageB64FromEvent(evt);
    if (resultB64) {
      sendSseEvent(res, "image", {
        type: "proxy.image",
        b64_json: resultB64,
        output_format: outputFormat,
        elapsed_ms: Date.now() - startedAt,
      });
      sendSseEvent(res, "done", { type: "proxy.done", elapsed_ms: Date.now() - startedAt });
      return true;
    }

    if (evt.type === "error" || evt.error) {
      sendSseEvent(res, "error", { type: "proxy.error", error: evt.error || evt });
      return true;
    }

    sendSseEvent(res, "progress", {
      type: "proxy.progress",
      upstream_type: evt.type || "message",
      elapsed_ms: Date.now() - startedAt,
    });
    return false;
  };

  try {
    while (!closed) {
      const { value, done } = await reader.read();
      if (value) {
        buffer += decoder.decode(value, { stream: !done });
        const split = splitSseBlocks(buffer);
        buffer = split.rest;
        for (const block of split.blocks) {
          if (handleBlock(block)) {
            try { await reader.cancel(); } catch {}
            clearInterval(heartbeat);
            if (!res.writableEnded) res.end();
            return;
          }
        }
      }
      if (done) break;
    }
    if (buffer.trim() && handleBlock(buffer)) return;
    sendSseEvent(res, "error", { type: "proxy.error", error: { message: "Responses stream ended without image data" } });
  } catch (error) {
    sendSseEvent(res, "error", { type: "proxy.error", error: { message: error.message } });
  } finally {
    clearInterval(heartbeat);
    try { reader.releaseLock(); } catch {}
    if (!res.writableEnded && !closed) res.end();
  }
}

function buildForwardHeaders(req, bodyLength) {
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    const lower = key.toLowerCase();
    if (["host", "connection", "content-length", "expect", "origin", "referer"].includes(lower)) continue;
    if (Array.isArray(value)) value.forEach((item) => headers.append(key, item));
    else if (typeof value === "string") headers.set(key, value);
  }
  if (bodyLength) headers.set("content-length", String(bodyLength));
  return headers;
}

async function forwardRawApi(req, res, requestUrl, body) {
  const target = new URL(requestUrl.pathname, upstream);
  const headers = buildForwardHeaders(req, body.length);
  const upstreamResponse = await fetch(target, {
    method: req.method,
    headers,
    body: body.length ? body : undefined,
    duplex: "half",
  });
  const responseHeaders = {};
  upstreamResponse.headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (["connection", "content-encoding", "content-length", "transfer-encoding"].includes(lower)) return;
    responseHeaders[key] = value;
  });
  responseHeaders["Access-Control-Allow-Origin"] = "*";
  responseHeaders["Cache-Control"] = "no-store";
  responseHeaders["X-Aiswing-Proxy"] = "node-backend-raw";
  const responseBody = Buffer.from(await upstreamResponse.arrayBuffer());
  responseHeaders["content-length"] = String(responseBody.length);
  res.writeHead(upstreamResponse.status, responseHeaders);
  res.end(responseBody);
}

async function handleTasksApi(req, res, requestUrl) {
  if (req.method === "OPTIONS") {
    send(res, 204, "", {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
      "Access-Control-Max-Age": "86400",
    });
    return;
  }

  const apiKey = requireBearer(req);
  if (!apiKey) {
    sendJson(res, 401, { error: { message: "Missing Authorization Bearer API Key" } });
    return;
  }
  const apiKeyHash = hashApiKey(apiKey);

  if (requestUrl.pathname === "/api/tasks" && req.method === "POST") {
    let body;
    try {
      body = await readBody(req);
    } catch (error) {
      sendJson(res, error.statusCode || 400, { error: { message: error.message } });
      return;
    }

    let payload;
    try {
      payload = body.length ? JSON.parse(body.toString("utf8")) : {};
    } catch {
      sendJson(res, 400, { error: { message: "Invalid JSON body" } });
      return;
    }

    const prompt = String(payload.prompt || "").trim();
    if (!prompt) {
      sendJson(res, 400, { error: { message: "prompt is required" } });
      return;
    }

    const referenceImages = normalizeReferenceImages(
      payload.reference_images || payload.referenceImages || payload.images || payload.input_images,
    );
    const createdAt = nowMs();
    const task = {
      id: createTaskId(),
      api_key_hash: apiKeyHash,
      api_key_enc: encryptText(apiKey),
      model: payload.model || "gpt-image-2",
      prompt,
      size: payload.size || "1024x1024",
      quality: payload.quality || "",
      format: getOutputFormat(payload),
      reference_images: referenceImages.length ? JSON.stringify(referenceImages) : null,
      reference_count: referenceImages.length,
      status: "pending",
      progress: "pending",
      created_at: createdAt,
      updated_at: createdAt,
    };
    statements.insertTask.run(task);
    setImmediate(queueWorkerTick);
    sendJson(res, 202, { task: safeTask(statements.getTask.get(task.id)) });
    return;
  }

  if (requestUrl.pathname === "/api/tasks" && req.method === "GET") {
    const limit = Math.min(100, Math.max(1, Number(requestUrl.searchParams.get("limit") || 30)));
    const tasks = statements.listTasksByHash.all(apiKeyHash, limit).map(safeTask);
    sendJson(res, 200, { tasks });
    return;
  }

  const taskMatch = requestUrl.pathname.match(/^\/api\/tasks\/([^/]+)(?:\/(image))?$/);
  if (!taskMatch) {
    sendJson(res, 404, { error: { message: "Not Found" } });
    return;
  }

  const task = statements.getTask.get(taskMatch[1]);
  if (!task || task.api_key_hash !== apiKeyHash) {
    sendJson(res, 404, { error: { message: "Task not found" } });
    return;
  }

  if (taskMatch[2] === "image" && req.method === "GET") {
    if (task.status !== "succeeded") {
      sendJson(res, 409, { error: { message: "Task image is not ready" }, task: safeTask(task) });
      return;
    }
    const filePath = resolveResultPath(task);
    if (!filePath || !fs.existsSync(filePath)) {
      sendJson(res, 404, { error: { message: "Image file not found" } });
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const contentType = mimeTypes[ext] || "application/octet-stream";
    res.writeHead(200, {
      "Content-Type": contentType,
      "Cache-Control": "private, max-age=3600",
      "Access-Control-Allow-Origin": "*",
    });
    fs.createReadStream(filePath).pipe(res);
    return;
  }

  if (req.method === "GET") {
    sendJson(res, 200, { task: safeTask(task) });
    return;
  }

  if (req.method === "DELETE") {
    const filePath = resolveResultPath(task);
    if (filePath) fs.rmSync(filePath, { force: true });
    statements.deleteTask.run(task.id);
    sendJson(res, 200, { ok: true });
    return;
  }

  sendJson(res, 405, { error: { message: "Method Not Allowed" } });
}

async function proxyApi(req, res, requestUrl) {
  if (req.method === "OPTIONS") {
    send(res, 204, "", {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
      "Access-Control-Max-Age": "86400",
    });
    return;
  }

  if (req.method !== "POST") {
    sendJson(res, 405, { error: { message: "Method Not Allowed" } });
    return;
  }

  if (!isAllowedApiPath(requestUrl.pathname)) {
    sendJson(res, 404, { error: { message: "Not Found" } });
    return;
  }

  let body;
  try {
    body = await readBody(req);
  } catch (error) {
    sendJson(res, error.statusCode || 400, { error: { message: error.message } });
    return;
  }

  try {
    const contentType = req.headers["content-type"] || "";
    if (!contentType.includes("application/json")) {
      await forwardRawApi(req, res, requestUrl, body);
      return;
    }

    const originalPayload = body.length ? JSON.parse(body.toString("utf8")) : {};
    const responsesPayload = imagePayloadToResponsesPayload(requestUrl.pathname, originalPayload);
    const shouldStreamToClient = requestUrl.pathname === "/v1/images/generations/events";
    const outputFormat = getOutputFormat(originalPayload);
    const target = new URL("/v1/responses", upstream);
    const headers = new Headers();
    headers.set("Content-Type", "application/json");
    if (req.headers.authorization) headers.set("Authorization", req.headers.authorization);

    const upstreamResponse = await fetch(target, {
      method: "POST",
      headers,
      body: JSON.stringify(responsesPayload),
    });

    if (shouldStreamToClient) {
      await streamResponsesToClient(upstreamResponse, res, outputFormat);
      return;
    }

    if (requestUrl.pathname === "/v1/responses") {
      const rawText = await upstreamResponse.text();
      send(res, upstreamResponse.status, rawText, {
        "Content-Type": upstreamResponse.headers.get("content-type") || "text/event-stream; charset=utf-8",
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*",
        "X-Aiswing-Proxy": "node-backend-responses-raw",
      });
      return;
    }

    const parsed = await parseResponsesStream(upstreamResponse);
    send(res, parsed.status, parsed.text, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
      "X-Aiswing-Proxy": "node-backend-responses",
    });
  } catch (error) {
    const cause = error.cause ? ` ${error.cause.code || ""} ${error.cause.message || ""}`.trim() : "";
    sendJson(res, 502, { error: { message: `Backend upstream request failed: ${error.message}${cause ? ` (${cause})` : ""}` } });
  }
}

function serveStatic(req, res, requestUrl) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    send(res, 405, "Method Not Allowed", { "Content-Type": "text/plain; charset=utf-8" });
    return;
  }

  let pathname;
  try {
    pathname = decodeURIComponent(requestUrl.pathname);
  } catch {
    send(res, 400, "Bad Request", { "Content-Type": "text/plain; charset=utf-8" });
    return;
  }

  const cleanPathname = pathname.replace(/\/+$/, "") || "/";
  const publicFile = publicFiles.get(cleanPathname);
  if (!publicFile) {
    send(res, 404, "File not found", { "Content-Type": "text/plain; charset=utf-8" });
    return;
  }

  const filePath = path.resolve(frontendRoot, publicFile);
  fs.stat(filePath, (statErr, stat) => {
    if (statErr || !stat.isFile()) {
      send(res, 404, "File not found", { "Content-Type": "text/plain; charset=utf-8" });
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      "Content-Type": mimeTypes[ext] || "application/octet-stream",
      "Cache-Control": [".html", ".css", ".js"].includes(ext) ? "no-store" : "public, max-age=300",
    });
    if (req.method === "HEAD") {
      res.end();
      return;
    }
    fs.createReadStream(filePath)
      .on("error", () => res.destroy())
      .pipe(res);
  });
}

const server = http.createServer((req, res) => {
  const requestUrl = new URL(req.url, `http://${req.headers.host || `${host}:${port}`}`);

  if (requestUrl.pathname === "/health") {
    sendJson(res, 200, {
      ok: true,
      upstream,
      build,
      mode: "sqlite-async-tasks",
      data_dir: dataDir,
      update_enabled: Boolean(updateToken),
      task_ttl_hours: taskTtlHours,
    });
    return;
  }

  if (requestUrl.pathname === "/api/update") {
    handleUpdateApi(req, res, requestUrl).catch((error) => {
      sendJson(res, 500, { error: { message: error.message } });
    });
    return;
  }

  if (requestUrl.pathname === "/api/tasks" || requestUrl.pathname.startsWith("/api/tasks/")) {
    handleTasksApi(req, res, requestUrl).catch((error) => {
      sendJson(res, 500, { error: { message: error.message } });
    });
    return;
  }

  if (requestUrl.pathname.startsWith("/v1/images/") || requestUrl.pathname === "/v1/responses") {
    proxyApi(req, res, requestUrl).catch((error) => {
      sendJson(res, 500, { error: { message: error.message } });
    });
    return;
  }

  serveStatic(req, res, requestUrl);
});

server.listen(port, host, () => {
  console.log(`Aiswing app listening on http://${host}:${port}`);
  console.log(`Compat /v1/images/* -> ${upstream}/v1/responses image_generation stream-first`);
});
