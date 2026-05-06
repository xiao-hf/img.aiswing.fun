const SETTINGS_KEY = "aiswing-image-studio-settings-v4";
const TASKS_KEY = "aiswing-image-studio-tasks-v4";
const MAX_TASKS = 30;
const POLL_INTERVAL_MS = 2500;

const elements = {
  apiKeyInput: document.getElementById("apiKeyInput"),
  baseUrlInput: document.getElementById("baseUrlInput"),
  modelSelect: document.getElementById("modelSelect"),
  sizeSelect: document.getElementById("sizeSelect"),
  qualitySelect: document.getElementById("qualitySelect"),
  formatSelect: document.getElementById("formatSelect"),
  promptInput: document.getElementById("promptInput"),
  referenceInput: document.getElementById("referenceInput"),
  referencePreviewList: document.getElementById("referencePreviewList"),
  generateButton: document.getElementById("generateButton"),
  demoButton: document.getElementById("demoButton"),
  toggleKeyButton: document.getElementById("toggleKeyButton"),
  clearAllButton: document.getElementById("clearAllButton"),
  updateButton: document.getElementById("updateButton"),
  copyPromptButton: document.getElementById("copyPromptButton"),
  copyCurlButton: document.getElementById("copyCurlButton"),
  downloadButton: document.getElementById("downloadButton"),
  currentPrompt: document.getElementById("currentPrompt"),
  taskModeBadge: document.getElementById("taskModeBadge"),
  statusBox: document.getElementById("statusBox"),
  resultStage: document.getElementById("resultStage"),
  taskList: document.getElementById("taskList"),
  taskCount: document.getElementById("taskCount"),
  successCount: document.getElementById("successCount"),
  taskTemplate: document.getElementById("taskTemplate"),
};

const state = {
  references: [],
  tasks: [],
  activeTaskId: null,
  currentImageUrl: "",
  currentFileName: "",
  polling: false,
};

const defaultSettings = {
  apiKey: "",
  baseUrl: getDefaultBaseUrl(),
  model: "gpt-image-2",
  size: "1024x1024",
  quality: "",
  format: "png",
  prompt: "",
};

init();

function init() {
  hydrateSettings();
  hydrateTasks();
  bindEvents();
  renderCurrentPrompt();
  renderReferencePreviews();
  renderTasks();
  if (state.tasks[0]) activateTask(state.tasks[0].id);
  startPolling();
}

function bindEvents() {
  [
    elements.apiKeyInput,
    elements.baseUrlInput,
    elements.modelSelect,
    elements.sizeSelect,
    elements.qualitySelect,
    elements.formatSelect,
    elements.promptInput,
  ].forEach((element) => {
    element.addEventListener("input", () => { persistSettings(); renderCurrentPrompt(); });
    element.addEventListener("change", () => { persistSettings(); renderCurrentPrompt(); });
  });

  elements.referenceInput.addEventListener("change", handleReferenceSelection);
  elements.generateButton.addEventListener("click", handleGenerate);
  elements.demoButton.addEventListener("click", fillDemo);
  elements.toggleKeyButton.addEventListener("click", toggleApiKey);
  elements.clearAllButton.addEventListener("click", clearTasks);
  elements.updateButton.addEventListener("click", updateFromGit);
  elements.copyPromptButton.addEventListener("click", copyPrompt);
  elements.copyCurlButton.addEventListener("click", copyCurl);
  elements.downloadButton.addEventListener("click", downloadCurrentImage);
}

function hydrateSettings() {
  const settings = { ...defaultSettings, ...safeJson(localStorage.getItem(SETTINGS_KEY), {}) };
  settings.baseUrl = normalizeCachedBaseUrl(settings.baseUrl);
  elements.apiKeyInput.value = settings.apiKey;
  elements.baseUrlInput.value = settings.baseUrl;
  elements.modelSelect.value = settings.model;
  elements.sizeSelect.value = settings.size;
  elements.qualitySelect.value = settings.quality;
  elements.formatSelect.value = settings.format;
  elements.promptInput.value = settings.prompt;
}

function persistSettings() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(getSettings()));
}

function getSettings() {
  return {
    apiKey: elements.apiKeyInput.value.trim(),
    baseUrl: normalizeBaseUrl(elements.baseUrlInput.value),
    model: elements.modelSelect.value,
    size: elements.sizeSelect.value,
    quality: elements.qualitySelect.value,
    format: elements.formatSelect.value,
    prompt: elements.promptInput.value.trim(),
  };
}

function hydrateTasks() {
  state.tasks = safeJson(localStorage.getItem(TASKS_KEY), []).filter((task) => task && task.id);
  persistTasks();
}

function persistTasks() {
  localStorage.setItem(TASKS_KEY, JSON.stringify(state.tasks.slice(0, MAX_TASKS)));
}

function safeJson(raw, fallback) {
  try { return raw ? JSON.parse(raw) : fallback; } catch { return fallback; }
}

function normalizeBaseUrl(value) {
  return (value || defaultSettings.baseUrl).trim().replace(/\/+$/, "");
}

function getDefaultBaseUrl() {
  return window.location.origin;
}

function normalizeCachedBaseUrl(value) {
  const normalized = normalizeBaseUrl(value);
  const isLegacyPhpProxy = normalized.includes("/api.php") && normalized.includes("path=");
  const legacyHosts = new Set(["https://gpt.aiswing.fun", "https://img.aiswing.fun", "https://cdn.aiswing.fun"]);
  return legacyHosts.has(normalized) || isLegacyPhpProxy ? window.location.origin : normalized;
}

function buildApiUrl(settings, pathname) {
  return `${settings.baseUrl}${pathname}`;
}

function authHeaders(settings, json = false) {
  const headers = { Authorization: `Bearer ${settings.apiKey}` };
  if (json) headers["Content-Type"] = "application/json";
  return headers;
}

function renderCurrentPrompt() {
  const prompt = elements.promptInput.value.trim();
  elements.currentPrompt.textContent = prompt || "等待输入提示词。";
  elements.taskModeBadge.textContent = state.references.length ? "参考图编辑模式" : "生成模式";
}

async function handleReferenceSelection(event) {
  const incomingFiles = Array.from(event.target.files || []);
  const knownFiles = new Set(state.references.map(getReferenceFileKey));
  incomingFiles.forEach((file) => {
    const key = getReferenceFileKey(file);
    if (!knownFiles.has(key)) {
      state.references.push(file);
      knownFiles.add(key);
    }
  });
  elements.referenceInput.value = "";
  renderReferencePreviews();
  renderCurrentPrompt();
}

function getReferenceFileKey(file) {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

function renderReferencePreviews() {
  elements.referencePreviewList.innerHTML = "";
  state.references.forEach((file, index) => {
    const wrapper = document.createElement("div");
    wrapper.className = "thumb-item";
    const image = document.createElement("img");
    image.src = URL.createObjectURL(file);
    image.alt = file.name;
    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.textContent = "×";
    removeButton.setAttribute("aria-label", `删除参考图 ${file.name}`);
    removeButton.addEventListener("click", () => removeReference(index));
    wrapper.appendChild(image);
    wrapper.appendChild(removeButton);
    elements.referencePreviewList.appendChild(wrapper);
  });
}

function removeReference(index) {
  state.references.splice(index, 1);
  elements.referenceInput.value = "";
  renderReferencePreviews();
  renderCurrentPrompt();
}

async function handleGenerate() {
  const settings = getSettings();
  if (!settings.apiKey) return setStatus("请先填写 API Key。", "error");
  if (!settings.prompt) return setStatus("请先输入提示词。", "error");
  if (state.references.length) return setStatus("异步任务版当前先支持文生图；参考图编辑下一版接入。", "error");

  elements.generateButton.disabled = true;
  setStatus("正在创建后台任务。", "loading");

  try {
    const task = await createRemoteTask(settings);
    upsertTask(task);
    activateTask(task.id);
    setStatus("任务已创建，后台正在生成。页面可保持打开并自动轮询。", "loading");
    elements.promptInput.value = settings.prompt;
    persistSettings();
    startPolling(true);
  } catch (error) {
    setStatus(error.message, "error");
  } finally {
    elements.generateButton.disabled = false;
  }
}

async function createRemoteTask(settings) {
  const payload = {
    model: settings.model,
    prompt: settings.prompt,
    size: settings.size,
    response_format: "b64_json",
    output_format: settings.format || "png",
  };
  if (settings.quality) payload.quality = settings.quality;

  const response = await fetch(buildApiUrl(settings, "/api/tasks"), {
    method: "POST",
    headers: authHeaders(settings, true),
    body: JSON.stringify(payload),
  });
  const data = await parseResponse(response);
  return normalizeTask(data.task);
}

async function fetchTask(settings, id) {
  const response = await fetch(buildApiUrl(settings, `/api/tasks/${encodeURIComponent(id)}`), {
    headers: authHeaders(settings),
  });
  const data = await parseResponse(response);
  return normalizeTask(data.task);
}

async function parseResponse(response) {
  const text = await response.text();
  let payload;
  try { payload = JSON.parse(text); } catch { payload = { raw: text }; }
  if (!response.ok) {
    throw new Error(payload?.error?.message || payload?.message || text || `HTTP ${response.status}`);
  }
  return payload;
}

function normalizeTask(task) {
  return {
    id: task.id,
    status: task.status,
    model: task.model,
    size: task.size,
    quality: task.quality || "",
    format: task.format || "png",
    prompt: task.prompt,
    progress: task.progress || "",
    error: task.error_message || task.error || "",
    imageUrl: task.image_url || "",
    hasReferences: false,
    createdAt: task.created_at || Date.now(),
    updatedAt: task.updated_at || Date.now(),
    expiresAt: task.expires_at || null,
  };
}

function upsertTask(task) {
  const nextTasks = state.tasks.filter((item) => item.id !== task.id);
  state.tasks = [task, ...nextTasks].sort((a, b) => b.createdAt - a.createdAt).slice(0, MAX_TASKS);
  persistTasks();
  renderTasks();
}

function startPolling(force = false) {
  if (state.polling && !force) return;
  state.polling = true;
  pollTasks().finally(() => {
    setTimeout(startPolling, POLL_INTERVAL_MS);
  });
}

async function pollTasks() {
  const settings = getSettings();
  if (!settings.apiKey) return;
  const activeTasks = state.tasks.filter((task) => ["pending", "running"].includes(task.status));
  if (!activeTasks.length) return;

  for (const task of activeTasks) {
    try {
      const fresh = await fetchTask(settings, task.id);
      upsertTask(fresh);
      if (fresh.id === state.activeTaskId) {
        await renderResult(fresh);
        renderCurrentTaskText(fresh);
      }
    } catch (error) {
      task.error = error.message;
      task.updatedAt = Date.now();
      upsertTask(task);
    }
  }
}

function activateTask(id) {
  const task = state.tasks.find((item) => item.id === id);
  if (!task) return;
  state.activeTaskId = id;
  renderCurrentTaskText(task);
  renderResult(task);
  renderTasks();
}

function renderCurrentTaskText(task) {
  elements.currentPrompt.textContent = task.prompt;
  elements.taskModeBadge.textContent = statusText(task.status);
  if (task.status === "succeeded") setStatus("生成完成，结果会保留 48 小时。", "success");
  else if (task.status === "failed") setStatus(task.error || "生成失败。", "error");
  else setStatus(`后台生成中：${task.progress || task.status}`, "loading");
}

function renderResult(task) {
  elements.resultStage.innerHTML = "";
  elements.downloadButton.disabled = true;
  state.currentImageUrl = "";
  state.currentFileName = "";

  if (task.status === "succeeded" && task.imageUrl) {
    const settings = getSettings();
    const image = document.createElement("img");
    image.src = buildApiUrl(settings, `${task.imageUrl}?t=${task.updatedAt}`);
    image.alt = task.prompt;
    elements.resultStage.appendChild(image);
    state.currentImageUrl = image.src;
    state.currentFileName = `aiswing-${task.id}.${task.format || "png"}`;
    elements.downloadButton.disabled = false;
    return;
  }

  const wrapper = document.createElement("div");
  wrapper.className = "empty-state";
  const title = task.status === "failed" ? "生成失败" : "后台任务进行中";
  const detail = task.status === "failed"
    ? escapeHtml(task.error || "未知错误")
    : escapeHtml(task.progress || "任务排队中");
  wrapper.innerHTML = `<span></span><h3>${title}</h3><p>${detail}</p>`;
  elements.resultStage.appendChild(wrapper);
}

function renderTasks() {
  elements.taskList.innerHTML = "";
  elements.taskCount.textContent = state.tasks.length.toString();
  elements.successCount.textContent = state.tasks.filter((task) => task.status === "succeeded").length.toString();

  if (!state.tasks.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.innerHTML = "<h3>暂无任务</h3><p>生成后会自动保存到这里。</p>";
    elements.taskList.appendChild(empty);
    return;
  }

  state.tasks.forEach((task) => {
    const node = elements.taskTemplate.content.firstElementChild.cloneNode(true);
    node.dataset.status = task.status === "succeeded" ? "success" : task.status === "failed" ? "error" : "loading";
    node.classList.toggle("active", task.id === state.activeTaskId);
    node.querySelector("strong").textContent = task.prompt;
    node.querySelector("span").textContent = `${task.model} · ${task.size} · ${statusText(task.status)}`;
    renderTaskThumbnail(task, node.querySelector(".task-thumb"));
    node.addEventListener("click", () => activateTask(task.id));
    elements.taskList.appendChild(node);
  });
}

function renderTaskThumbnail(task, container) {
  container.innerHTML = "";
  if (task.status === "succeeded" && task.imageUrl) {
    const image = document.createElement("img");
    image.src = buildApiUrl(getSettings(), `${task.imageUrl}?thumb=${task.updatedAt}`);
    image.alt = task.prompt;
    container.appendChild(image);
  }
}

function statusText(status) {
  return {
    pending: "排队中",
    running: "生成中",
    succeeded: "已完成",
    failed: "失败",
  }[status] || status;
}

function setStatus(message, type) {
  elements.statusBox.textContent = message;
  elements.statusBox.className = `status-box ${type || "idle"}`;
}

function fillDemo() {
  elements.promptInput.value = "A premium product poster for a cute orange cat astronaut sticker, clean pastel background, crisp edges, soft studio light, playful and commercial, no text, no watermark.";
  persistSettings();
  renderCurrentPrompt();
}

function toggleApiKey() {
  const showing = elements.apiKeyInput.type === "text";
  elements.apiKeyInput.type = showing ? "password" : "text";
  elements.toggleKeyButton.textContent = showing ? "显示" : "隐藏";
}

async function copyPrompt() {
  await navigator.clipboard.writeText(elements.currentPrompt.textContent);
  setStatus("提示词已复制。", "success");
}

async function copyCurl() {
  const settings = getSettings();
  const payload = {
    model: settings.model,
    prompt: settings.prompt || "your prompt",
    size: settings.size,
    response_format: "b64_json",
    output_format: settings.format || "png",
  };
  if (settings.quality) payload.quality = settings.quality;
  const command = `curl --location '${buildApiUrl(settings, "/api/tasks")}' \\
--header 'Authorization: Bearer ${settings.apiKey || "sk-your-key"}' \\
--header 'Content-Type: application/json' \\
--data '${JSON.stringify(payload, null, 2)}'`;
  await navigator.clipboard.writeText(command);
  setStatus("API 请求已复制。", "success");
}

function downloadCurrentImage() {
  if (!state.currentImageUrl) return;
  const link = document.createElement("a");
  link.href = state.currentImageUrl;
  link.download = state.currentFileName || "aiswing-image.png";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

async function clearTasks() {
  if (!confirm("确定清空本地任务列表吗？服务器里的任务会在 48 小时后自动清理。")) return;
  state.tasks = [];
  state.activeTaskId = null;
  persistTasks();
  renderTasks();
  elements.resultStage.innerHTML = `<div class="empty-state"><span></span><h3>还没有图片</h3><p>生成完成后，图片会显示在这里并自动加入右侧任务列表。</p></div>`;
  setStatus("本地任务列表已清空。", "success");
}

async function updateFromGit() {
  const token = prompt("请输入后台更新密钥 UPDATE_TOKEN：");
  if (!token) return;
  if (!confirm("确认从 GitHub 拉取最新代码并重启服务吗？data 目录不会删除。")) return;
  elements.updateButton.disabled = true;
  setStatus("正在提交更新请求，请稍候...", "loading");
  try {
    const response = await fetch(`${getDefaultBaseUrl()}/api/update`, {
      method: "POST",
      headers: { "X-Update-Token": token },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error?.message || `HTTP ${response.status}`);
    setStatus("更新已开始。服务会自动拉取 GitHub 最新代码并重启，稍后刷新页面。", "success");
    pollUpdateStatus(token);
  } catch (error) {
    setStatus(`更新失败：${error.message}`, "error");
    elements.updateButton.disabled = false;
  }
}

async function pollUpdateStatus(token) {
  for (let i = 0; i < 60; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 3000));
    try {
      const response = await fetch(`${getDefaultBaseUrl()}/api/update`, {
        headers: { "X-Update-Token": token },
        cache: "no-store",
      });
      const data = await response.json();
      if (data.update?.running) {
        setStatus("更新执行中，请等待服务重启...", "loading");
        continue;
      }
      if (data.update?.exit_code === 0) {
        setStatus("更新完成，正在刷新页面...", "success");
        setTimeout(() => window.location.reload(), 1500);
        return;
      }
      if (data.update?.exit_code) {
        throw new Error(data.update?.error || "Update command failed");
      }
    } catch {
      setStatus("服务正在重启，稍后自动刷新...", "loading");
    }
  }
  elements.updateButton.disabled = false;
  setStatus("更新请求已发送。如页面未自动刷新，请稍后手动刷新。", "success");
}

function formatTime(timestamp) {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(timestamp));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
