const SETTINGS_KEY = "aiswing-image-studio-settings-v5";
const API_KEY_CACHE_KEY = "aiswing-image-studio-api-key";
const TASKS_CACHE_PREFIX = "aiswing-image-studio-cache-v1";
const THEME_KEY = "aiswing-image-studio-theme";
const LANG_KEY = "aiswing-image-studio-lang";
const DRAFT_TASK_ID = "__draft__";
const MAX_TASKS = 30;
const POLL_INTERVAL_MS = 2500;

const elements = {
  apiKeyInput: document.getElementById("apiKeyInput"),
  apiKeyButton: document.getElementById("apiKeyButton"),
  apiKeyModal: document.getElementById("apiKeyModal"),
  apiKeyModalInput: document.getElementById("apiKeyModalInput"),
  apiKeySaveButton: document.getElementById("apiKeySaveButton"),
  apiKeyClearButton: document.getElementById("apiKeyClearButton"),
  apiKeyCloseButton: document.getElementById("apiKeyCloseButton"),
  advancedSettings: document.getElementById("advancedSettings"),
  advancedSummaryHint: document.getElementById("advancedSummaryHint"),
  baseUrlInput: document.getElementById("baseUrlInput"),
  modelSelect: document.getElementById("modelSelect"),
  sizeSelect: document.getElementById("sizeSelect"),
  qualitySelect: document.getElementById("qualitySelect"),
  formatSelect: document.getElementById("formatSelect"),
  promptInput: document.getElementById("promptInput"),
  referenceInput: document.getElementById("referenceInput"),
  referencePreviewList: document.getElementById("referencePreviewList"),
  dropHint: document.getElementById("dropHint"),
  composerBox: document.querySelector(".composer-box"),
  referenceButtonText: document.getElementById("referenceButtonText"),
  generateButton: document.getElementById("generateButton"),
  demoButton: document.getElementById("demoButton"),
  toggleKeyButton: document.getElementById("toggleKeyButton"),
  copyCurlButton: document.getElementById("copyCurlButton"),
  copyComposerCurlButton: document.getElementById("copyComposerCurlButton"),
  updateButton: document.getElementById("updateButton"),
  newTaskButton: document.getElementById("newTaskButton"),
  refreshTasksButton: document.getElementById("refreshTasksButton"),
  clearLocalButton: document.getElementById("clearLocalButton"),
  statusBox: document.getElementById("statusBox"),
  taskList: document.getElementById("taskList"),
  taskCount: document.getElementById("taskCount"),
  runningCount: document.getElementById("runningCount"),
  resultViewport: document.getElementById("resultViewport"),
  taskTemplate: document.getElementById("taskTemplate"),
  themeToggle: document.getElementById("themeToggle"),
  langToggle: document.getElementById("langToggle"),
};

const state = {
  references: [],
  tasks: [],
  selectedTaskId: null,
  currentImageUrl: "",
  currentFileName: "",
  currentObjectUrl: "",
  imageLoadToken: 0,
  pollingActive: false,
  pollingTimerId: null,
};

const defaultSettings = {
  apiKey: "",
  baseUrl: window.location.origin,
  model: "gpt-image-2",
  size: "1024x1024",
  quality: "",
  format: "png",
  prompt: "",
};

init();

function init() {
  initTheme();
  initLang();
  hydrateSettings();
  hydrateLocalTasks();
  if (state.tasks.length > 0) {
    state.selectedTaskId = state.tasks[0].id;
  }
  bindEvents();
  renderReferencePreviews();
  renderTaskList();
  renderSelectedTask();
  refreshTaskCounters();
  startPolling();
}

function initTheme() {
  const savedTheme = localStorage.getItem(THEME_KEY) || "light";
  document.documentElement.setAttribute("data-theme", savedTheme);
}

function toggleTheme() {
  const currentTheme = document.documentElement.getAttribute("data-theme") || "light";
  const newTheme = currentTheme === "light" ? "dark" : "light";
  document.documentElement.setAttribute("data-theme", newTheme);
  localStorage.setItem(THEME_KEY, newTheme);
}

function initLang() {
  const savedLang = localStorage.getItem(LANG_KEY) || "zh";
  document.documentElement.setAttribute("lang", savedLang);
}

function toggleLang() {
  const currentLang = document.documentElement.getAttribute("lang") || "zh";
  const newLang = currentLang === "zh" ? "en" : "zh";
  document.documentElement.setAttribute("lang", newLang);
  localStorage.setItem(LANG_KEY, newLang);
  updateLangTexts();
}

function updateLangTexts() {
  const lang = document.documentElement.getAttribute("lang") || "zh";
  const texts = {
    zh: {
      newTask: "新建",
      refresh: "刷新",
      clear: "清空",
      apiDoc: "API 文档",
      fillApiKey: "填写 API Key",
      apiKeyOk: "API Key OK",
      uploadRef: "上传参考图",
      model: "模型",
      size: "尺寸",
      quality: "质量",
      format: "格式",
      copyCurl: "复制 curl",
      emptyTitle: "Turn ideas into images",
      emptyDesc: "输入提示词即可创建后台任务；任务按 API Key 隔离，完成后保留 48 小时。",
      promptPlaceholder: "输入你想生成的画面，也可以拖入/粘贴参考图",
      taskCount: "个任务",
      processing: "处理中",
    },
    en: {
      newTask: "New",
      refresh: "Refresh",
      clear: "Clear",
      apiDoc: "API Docs",
      fillApiKey: "Set API Key",
      apiKeyOk: "API Key OK",
      uploadRef: "Upload Reference",
      model: "Model",
      size: "Size",
      quality: "Quality",
      format: "Format",
      copyCurl: "Copy curl",
      emptyTitle: "Turn ideas into images",
      emptyDesc: "Enter a prompt to create a backend task; tasks are isolated by API Key and retained for 48 hours.",
      promptPlaceholder: "Describe the image you want to generate, or drag/paste reference images",
      taskCount: "tasks",
      processing: "processing",
    }
  };

  const t = texts[lang];

  elements.newTaskButton.textContent = t.newTask;
  elements.refreshTasksButton.textContent = t.refresh;
  elements.clearLocalButton.textContent = t.clear;
  document.querySelector('.doc-button').textContent = t.apiDoc;

  const hasKey = Boolean(elements.apiKeyInput.value.trim());
  elements.apiKeyButton.textContent = hasKey ? t.apiKeyOk : t.fillApiKey;

  elements.referenceButtonText.textContent = t.uploadRef;
  elements.copyComposerCurlButton.textContent = t.copyCurl;
  elements.promptInput.placeholder = t.promptPlaceholder;

  const emptyHero = document.querySelector('.empty-hero h2');
  const emptyDesc = document.querySelector('.empty-hero p');
  if (emptyHero) emptyHero.textContent = t.emptyTitle;
  if (emptyDesc) emptyDesc.textContent = t.emptyDesc;
}

function bindEvents() {
  elements.apiKeyInput.addEventListener("input", () => {
    persistSettings();
    syncAdvancedPanel(false);
  });
  elements.apiKeyInput.addEventListener("change", handleApiKeyChanged);
  elements.apiKeyButton?.addEventListener("click", openApiKeyModal);
  elements.apiKeySaveButton?.addEventListener("click", saveApiKeyFromModal);
  elements.apiKeyCloseButton?.addEventListener("click", closeApiKeyModal);
  elements.apiKeyClearButton?.addEventListener("click", clearApiKeyFromModal);
  elements.apiKeyModalInput?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") saveApiKeyFromModal();
    if (event.key === "Escape") closeApiKeyModal();
  });

  [elements.modelSelect, elements.sizeSelect, elements.qualitySelect, elements.formatSelect, elements.promptInput].forEach((element) => {
    element.addEventListener("input", persistSettings);
    element.addEventListener("change", persistSettings);
  });

  elements.referenceInput.addEventListener("change", handleReferenceSelection);
  bindReferenceDropEvents();
  elements.generateButton.addEventListener("click", handleGenerate);
  elements.demoButton?.addEventListener("click", fillDemo);
  elements.toggleKeyButton?.addEventListener("click", toggleApiKeyVisibility);
  elements.copyCurlButton?.addEventListener("click", copyCurl);
  elements.copyComposerCurlButton?.addEventListener("click", copyCurl);
  elements.updateButton?.addEventListener("click", updateFromGit);
  elements.newTaskButton.addEventListener("click", createDraft);
  elements.refreshTasksButton.addEventListener("click", refreshFromServer);
  elements.clearLocalButton.addEventListener("click", clearLocalTasks);
  elements.themeToggle?.addEventListener("click", toggleTheme);
  elements.langToggle?.addEventListener("click", toggleLang);
}

function hydrateSettings() {
  const settings = { ...defaultSettings, ...safeJson(localStorage.getItem(SETTINGS_KEY), {}) };
  const cachedApiKey = localStorage.getItem(API_KEY_CACHE_KEY) || settings.apiKey || "";
  elements.apiKeyInput.value = cachedApiKey;
  elements.baseUrlInput.value = normalizeBaseUrl(settings.baseUrl || defaultSettings.baseUrl);
  elements.modelSelect.value = settings.model || defaultSettings.model;
  elements.sizeSelect.value = settings.size || defaultSettings.size;
  elements.qualitySelect.value = settings.quality || "";
  elements.formatSelect.value = settings.format || defaultSettings.format;
  elements.promptInput.value = settings.prompt || "";
  syncAdvancedPanel(Boolean(cachedApiKey));
}

function persistSettings() {
  const settings = getSettings();
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  if (settings.apiKey) {
    localStorage.setItem(API_KEY_CACHE_KEY, settings.apiKey);
  } else {
    localStorage.removeItem(API_KEY_CACHE_KEY);
  }
}

function syncAdvancedPanel() {
  updateApiKeyButton();
}

function updateApiKeyButton() {
  if (!elements.apiKeyButton) return;
  const hasKey = Boolean(elements.apiKeyInput.value.trim());
  const lang = document.documentElement.getAttribute("lang") || "zh";
  const text = lang === "zh"
    ? (hasKey ? "API Key OK" : "\u586B\u5199 API Key")
    : (hasKey ? "API Key OK" : "Set API Key");
  elements.apiKeyButton.textContent = text;
  elements.apiKeyButton.dataset.ready = hasKey ? "true" : "false";
}

function handleApiKeyChanged() {
  persistSettings();
  syncAdvancedPanel(true);
  hydrateLocalTasks();
  state.selectedTaskId = state.tasks[0]?.id || null;
  renderTaskList();
  refreshTaskCounters();
  renderSelectedTask();
  void refreshFromServer({ silent: true });
}

function openApiKeyModal() {
  if (!elements.apiKeyModal || !elements.apiKeyModalInput) return;
  elements.apiKeyModalInput.value = elements.apiKeyInput.value.trim();
  elements.apiKeyModal.hidden = false;
  requestAnimationFrame(() => {
    elements.apiKeyModalInput.focus();
    elements.apiKeyModalInput.select();
  });
}

function closeApiKeyModal() {
  if (elements.apiKeyModal) elements.apiKeyModal.hidden = true;
}

function saveApiKeyFromModal() {
  if (!elements.apiKeyModalInput) return;
  elements.apiKeyInput.value = elements.apiKeyModalInput.value.trim();
  closeApiKeyModal();
  handleApiKeyChanged();
  setStatus(elements.apiKeyInput.value.trim() ? "API Key\u5DF2\u4FDD\u5B58" : "API Key\u5DF2\u6E05\u7A7A", "success");
}

function clearApiKeyFromModal() {
  if (elements.apiKeyModalInput) elements.apiKeyModalInput.value = "";
  elements.apiKeyInput.value = "";
  closeApiKeyModal();
  handleApiKeyChanged();
  setStatus("API Key\u5DF2\u6E05\u7A7A", "success");
}

function collapseAdvancedIfKeyReady() {
  syncAdvancedPanel(true);
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

function hydrateLocalTasks() {
  state.tasks = safeJson(localStorage.getItem(getTasksCacheKey()), []).filter((task) => task && task.id);
}

function persistLocalTasks() {
  localStorage.setItem(getTasksCacheKey(), JSON.stringify(state.tasks.slice(0, MAX_TASKS)));
}

function getTasksCacheKey() {
  const apiKey = getSettings().apiKey;
  return `${TASKS_CACHE_PREFIX}:${apiKey ? fingerprintText(apiKey) : "anonymous"}`;
}

function fingerprintText(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

function safeJson(raw, fallback) {
  try {
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function normalizeBaseUrl(value) {
  return String(value || defaultSettings.baseUrl).trim().replace(/\/+$/, "") || defaultSettings.baseUrl;
}

function buildApiUrl(pathname) {
  const settings = getSettings();
  return `${settings.baseUrl}${pathname}`;
}

function authHeaders(json = false) {
  const headers = { Authorization: `Bearer ${getSettings().apiKey}` };
  if (json) headers["Content-Type"] = "application/json";
  return headers;
}

function setStatus(message, type = "idle") {
  if (!elements.statusBox) return;
  elements.statusBox.textContent = message;
  elements.statusBox.dataset.state = type;
}

function renderReferencePreviews() {
  elements.referencePreviewList.innerHTML = "";
  elements.referenceButtonText.textContent = state.references.length > 0 ? `参考图 ${state.references.length}` : "上传参考图";

  if (!state.references.length) {
    return;
  }

  state.references.forEach((file, index) => {
    const item = document.createElement("div");
    item.className = "reference-item";
    const img = document.createElement("img");
    img.alt = file.name;
    img.src = file.previewUrl || URL.createObjectURL(file);
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "reference-remove";
    remove.textContent = "×";
    remove.addEventListener("click", () => removeReference(index));
    item.appendChild(img);
    item.appendChild(remove);
    elements.referencePreviewList.appendChild(item);
  });
}

function removeReference(index) {
  const file = state.references[index];
  if (file?.previewUrl) {
    URL.revokeObjectURL(file.previewUrl);
  }
  state.references.splice(index, 1);
  renderReferencePreviews();
}

async function handleReferenceSelection(event) {
  addReferenceFiles(event.target.files || []);
  elements.referenceInput.value = "";
}

function addReferenceFiles(fileList) {
  const incomingFiles = Array.from(fileList || []).filter((file) => file.type.startsWith("image/"));
  if (!incomingFiles.length) return 0;

  const known = new Set(state.references.map(getReferenceKey));
  let added = 0;
  for (const file of incomingFiles) {
    const key = getReferenceKey(file);
    if (known.has(key)) continue;
    const previewUrl = URL.createObjectURL(file);
    state.references.push(Object.assign(file, { previewUrl }));
    known.add(key);
    added += 1;
  }

  renderReferencePreviews();
  persistSettings();
  if (added > 0) {
    setStatus(`已添加 ${added} 张参考图`, "success");
  }
  return added;
}

function bindReferenceDropEvents() {
  const dropTargets = [elements.composerBox, elements.promptInput, elements.referencePreviewList].filter(Boolean);
  let dragDepth = 0;

  const hasImageFiles = (event) => Array.from(event.dataTransfer?.items || event.dataTransfer?.files || [])
    .some((item) => item.kind === "file" ? item.type.startsWith("image/") : item.type?.startsWith("image/"));

  const setDragging = (enabled) => {
    document.body.classList.toggle("dragging-image", enabled);
    elements.composerBox?.classList.toggle("drag-over", enabled);
  };

  const preventIfImage = (event) => {
    if (!hasImageFiles(event)) return false;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "copy";
    return true;
  };

  dropTargets.forEach((target) => {
    target.addEventListener("dragenter", (event) => {
      if (!preventIfImage(event)) return;
      dragDepth += 1;
      setDragging(true);
    });
    target.addEventListener("dragover", preventIfImage);
    target.addEventListener("dragleave", (event) => {
      if (!hasImageFiles(event)) return;
      event.preventDefault();
      dragDepth = Math.max(0, dragDepth - 1);
      if (dragDepth === 0) setDragging(false);
    });
    target.addEventListener("drop", (event) => {
      if (!preventIfImage(event)) return;
      dragDepth = 0;
      setDragging(false);
      const added = addReferenceFiles(event.dataTransfer.files || []);
      if (!added) setStatus("未识别到图片文件", "error");
    });
  });

  elements.promptInput.addEventListener("paste", (event) => {
    const files = Array.from(event.clipboardData?.files || []).filter((file) => file.type.startsWith("image/"));
    if (!files.length) return;
    event.preventDefault();
    addReferenceFiles(files);
  });
}

function getReferenceKey(file) {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error(`读取参考图失败: ${file.name}`));
    reader.readAsDataURL(file);
  });
}

async function createTaskPayload() {
  const prompt = elements.promptInput.value.trim();
  const referenceImages = await Promise.all(state.references.map((file) => readFileAsDataUrl(file)));
  return {
    model: elements.modelSelect.value,
    prompt,
    size: elements.sizeSelect.value,
    quality: elements.qualitySelect.value,
    format: elements.formatSelect.value,
    reference_images: referenceImages,
  };
}

async function handleGenerate() {
  const settings = getSettings();
  if (!settings.apiKey) {
    setStatus("请先填写 API Key", "error");
    openApiKeyModal();
    return;
  }
  if (!settings.prompt) {
    setStatus("请先输入提示词", "error");
    return;
  }

  elements.generateButton.disabled = true;
  setStatus("正在创建任务", "loading");

  try {
    const payload = await createTaskPayload();
    const response = await fetch(buildApiUrl("/api/tasks"), {
      method: "POST",
      headers: authHeaders(true),
      body: JSON.stringify(payload),
    });
    const data = await parseJsonResponse(response);
    collapseAdvancedIfKeyReady();
    const task = normalizeTask(data.task);
    upsertTask(task);
    state.selectedTaskId = task.id;
    renderSelectedTask();
    setStatus(task.reference_count > 0 ? "参考图任务已提交，后端正在处理" : "任务已提交，后端正在处理", "loading");
    clearComposerAfterSubmit();
    startPolling(true);
  } catch (error) {
    setStatus(error.message, "error");
  } finally {
    elements.generateButton.disabled = false;
  }
}

function clearComposerAfterSubmit() {
  state.references.forEach((file) => {
    if (file.previewUrl) URL.revokeObjectURL(file.previewUrl);
  });
  state.references = [];
  elements.referenceInput.value = "";
  renderReferencePreviews();
  persistSettings();
}

async function parseJsonResponse(response) {
  const text = await response.text();
  let payload = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { raw: text };
  }
  if (!response.ok) {
    throw new Error(payload?.error?.message || payload?.message || text || `HTTP ${response.status}`);
  }
  return payload;
}

function normalizeTask(task) {
  return {
    id: String(task.id),
    model: task.model || "gpt-image-2",
    prompt: task.prompt || "",
    size: task.size || "1024x1024",
    quality: task.quality || "",
    format: task.format || "png",
    mode: task.mode === "edit" ? "edit" : "generate",
    reference_count: Number(task.reference_count || 0),
    status: task.status || "pending",
    progress: task.progress || "",
    error_message: task.error_message || "",
    image_url: task.image_url || "",
    created_at: Number(task.created_at || Date.now()),
    started_at: task.started_at || null,
    completed_at: task.completed_at || null,
    expires_at: task.expires_at || null,
    updated_at: Number(task.updated_at || Date.now()),
  };
}

function upsertTask(task) {
  state.tasks = [task, ...state.tasks.filter((item) => item.id !== task.id)].sort((a, b) => b.created_at - a.created_at).slice(0, MAX_TASKS);
  persistLocalTasks();
  renderTaskList();
  refreshTaskCounters();
}

function renderTaskList() {
  elements.taskList.innerHTML = "";
  if (!state.tasks.length) {
    const empty = document.createElement("div");
    empty.className = "task-empty";
    empty.textContent = "暂无任务";
    elements.taskList.appendChild(empty);
    return;
  }

  for (const task of state.tasks) {
    const node = elements.taskTemplate.content.firstElementChild.cloneNode(true);
    const main = node.querySelector(".task-main");
    const title = node.querySelector(".task-title");
    const meta = node.querySelector(".task-meta");
    const status = node.querySelector(".task-status");
    const del = node.querySelector(".task-delete");

    node.dataset.state = task.status;
    node.classList.toggle("active", task.id === state.selectedTaskId);
    title.textContent = truncateText(task.prompt || "未命名任务", 34);
    meta.textContent = `${task.model} · ${task.size} · ${task.reference_count > 0 ? "参考图" : "文本"}`;
    status.textContent = statusLabel(task.status, task.progress);

    main.addEventListener("click", () => {
      state.selectedTaskId = task.id;
      renderTaskList();
      renderSelectedTask();
    });

    del.addEventListener("click", async (event) => {
      event.stopPropagation();
      await removeTask(task.id);
    });

    elements.taskList.appendChild(node);
  }
}

function refreshTaskCounters() {
  elements.taskCount.textContent = String(state.tasks.length);
  elements.runningCount.textContent = String(state.tasks.filter((task) => task.status === "pending" || task.status === "running").length);
}

function truncateText(value, max) {
  const text = String(value || "");
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function statusLabel(status, progress) {
  if (status === "pending") return progress || "排队中";
  if (status === "running") return progress || "生成中";
  if (status === "succeeded") return "已完成";
  if (status === "failed") return "失败";
  return status;
}

function renderSelectedTask() {
  const task = state.selectedTaskId === DRAFT_TASK_ID
    ? null
    : state.tasks.find((item) => item.id === state.selectedTaskId) || state.tasks[0] || null;
  state.selectedTaskId = task ? task.id : state.selectedTaskId === DRAFT_TASK_ID ? DRAFT_TASK_ID : null;
  renderTaskList();
  elements.resultViewport.innerHTML = "";
  resetCurrentImage();
  const imageLoadToken = ++state.imageLoadToken;

  if (!task) {
    elements.resultViewport.innerHTML = `
      <div class="empty-hero">
        <h2>Turn ideas into images</h2>
        <p>输入提示词即可创建后台任务；任务按 API Key 隔离，完成后保留 48 小时。</p>
      </div>
    `;
    return;
  }

  const header = document.createElement("div");
  header.className = "result-head";
  header.innerHTML = `
    <div>
      <div class="result-badge">${task.reference_count > 0 ? "参考图编辑" : "文本生图"}</div>
      <h2>${escapeHtml(task.prompt || "未命名任务")}</h2>
      <p>${escapeHtml(task.model)} · ${escapeHtml(task.size)} · ${statusLabel(task.status, task.progress)}</p>
    </div>
    <div class="result-head-actions">
      <button id="copyPromptButton" class="secondary small" type="button">复制提示词</button>
    </div>
  `;

  const stage = document.createElement("div");
  stage.className = `result-stage state-${task.status}`;

  let resultImage = null;
  if (task.status === "succeeded" && task.image_url) {
    stage.innerHTML = `<div class="empty-inner"><strong>图片已完成</strong><span>正在加载预览...</span></div>`;
    resultImage = document.createElement("img");
    resultImage.alt = task.prompt || "生成结果";
    setStatus("图片已完成，正在加载预览", "loading");
  } else if (task.status === "failed") {
    stage.innerHTML = `<div class="empty-inner error">${escapeHtml(task.error_message || "生成失败")}</div>`;
    setStatus(task.error_message || "生成失败", "error");
  } else {
    stage.innerHTML = `<div class="empty-inner"><strong>${task.status === "pending" ? "排队中" : "生成中"}</strong><span>${escapeHtml(task.progress || "正在处理任务")}</span></div>`;
    setStatus(task.status === "pending" ? "任务已入队，等待后端处理" : "后端正在生成", "loading");
  }

  const actions = document.createElement("div");
  actions.className = "result-actions";
  actions.innerHTML = `
    <button id="downloadButton" class="secondary" type="button" disabled>下载当前图</button>
    <button id="copyCurlTaskButton" class="secondary" type="button">复制请求</button>
  `;

  elements.resultViewport.appendChild(header);
  elements.resultViewport.appendChild(stage);
  elements.resultViewport.appendChild(actions);

  const copyPromptButton = header.querySelector("#copyPromptButton");
  const downloadButton = actions.querySelector("#downloadButton");
  const copyCurlTaskButton = actions.querySelector("#copyCurlTaskButton");

  copyPromptButton.addEventListener("click", async () => {
    await navigator.clipboard.writeText(task.prompt || "");
    setStatus("提示词已复制", "success");
  });

  downloadButton.addEventListener("click", downloadCurrentImage);
  copyCurlTaskButton.addEventListener("click", copyCurl);

  if (resultImage) {
    void loadTaskImageBlob(task, resultImage, stage, downloadButton, imageLoadToken);
  }
}

function resetCurrentImage() {
  if (state.currentObjectUrl) {
    URL.revokeObjectURL(state.currentObjectUrl);
  }
  state.currentObjectUrl = "";
  state.currentImageUrl = "";
  state.currentFileName = "";
}

async function loadTaskImageBlob(task, img, stage, downloadButton, token) {
  try {
    const response = await fetch(buildApiUrl(`${task.image_url}?t=${task.updated_at}`), {
      headers: authHeaders(),
    });
    if (!response.ok) {
      let message = `图片读取失败 HTTP ${response.status}`;
      try {
        const payload = await response.clone().json();
        message = payload?.error?.message || payload?.message || message;
      } catch {
        // keep status code message
      }
      throw new Error(message);
    }

    const blob = await response.blob();
    if (token !== state.imageLoadToken || state.selectedTaskId !== task.id) return;

    resetCurrentImage();
    const objectUrl = URL.createObjectURL(blob);
    state.currentObjectUrl = objectUrl;
    state.currentImageUrl = objectUrl;
    state.currentFileName = `aiswing-${task.id}.${task.format || "png"}`;

    img.src = objectUrl;
    stage.innerHTML = "";
    stage.appendChild(img);
    downloadButton.disabled = false;
    setStatus("图片已完成，结果保留 48 小时", "success");
  } catch (error) {
    if (token !== state.imageLoadToken || state.selectedTaskId !== task.id) return;
    stage.innerHTML = `<div class="empty-inner error">${escapeHtml(error.message || "图片预览加载失败")}</div>`;
    downloadButton.disabled = true;
    setStatus(error.message || "图片预览加载失败", "error");
  }
}

async function refreshFromServer(options = {}) {
  const settings = getSettings();
  if (!settings.apiKey) {
    if (!options.silent) {
      setStatus("\u8BF7\u5148\u586B\u5199 API Key", "error");
      openApiKeyModal();
    }
    return;
  }
  try {
    const response = await fetch(buildApiUrl("/api/tasks?limit=30"), {
      headers: authHeaders(),
    });
    const data = await parseJsonResponse(response);
    if (!Array.isArray(data.tasks)) throw new Error("任务列表格式错误");
    const normalized = data.tasks.map(normalizeTask);
    state.tasks = normalized.sort((a, b) => b.created_at - a.created_at).slice(0, MAX_TASKS);
    persistLocalTasks();
    if (state.selectedTaskId === DRAFT_TASK_ID) {
      // 保持新建空白态
    } else if (!state.selectedTaskId || !state.tasks.some((task) => task.id === state.selectedTaskId)) {
      state.selectedTaskId = state.tasks[0]?.id || null;
    }
    renderTaskList();
    refreshTaskCounters();
    renderSelectedTask();
    if (!options.silent) setStatus("任务列表已刷新", "success");
  } catch (error) {
    if (!options.silent) setStatus(error.message, "error");
  }
}

async function pollTasks() {
  const settings = getSettings();
  if (!settings.apiKey) return;
  const activeTasks = state.tasks.filter((task) => task.status === "pending" || task.status === "running");
  if (!activeTasks.length) return;

  for (const task of activeTasks) {
    try {
      const response = await fetch(buildApiUrl(`/api/tasks/${encodeURIComponent(task.id)}`), {
        headers: authHeaders(),
      });
      const data = await parseJsonResponse(response);
      const fresh = normalizeTask(data.task);
      upsertTask(fresh);
      if (fresh.id === state.selectedTaskId) {
        renderSelectedTask();
      }
    } catch {
      // keep polling
    }
  }
}

function startPolling(force = false) {
  if (state.pollingActive && !force) return;
  state.pollingActive = true;

  const loop = async () => {
    try {
      await pollTasks();
    } finally {
      if (state.pollingActive) {
        state.pollingTimerId = window.setTimeout(loop, POLL_INTERVAL_MS);
      }
    }
  };

  if (state.pollingTimerId) {
    window.clearTimeout(state.pollingTimerId);
    state.pollingTimerId = null;
  }

  void loop();
}

async function removeTask(taskId) {
  const settings = getSettings();
  if (!settings.apiKey) {
    setStatus("请先填写 API Key", "error");
    openApiKeyModal();
    return;
  }
  try {
    const response = await fetch(buildApiUrl(`/api/tasks/${encodeURIComponent(taskId)}`), {
      method: "DELETE",
      headers: authHeaders(),
    });
    await parseJsonResponse(response);
    state.tasks = state.tasks.filter((task) => task.id !== taskId);
    persistLocalTasks();
    if (state.selectedTaskId === taskId) {
      state.selectedTaskId = state.tasks[0]?.id || null;
    }
    renderTaskList();
    refreshTaskCounters();
    renderSelectedTask();
    setStatus("任务已删除", "success");
  } catch (error) {
    setStatus(error.message, "error");
  }
}

async function clearLocalTasks() {
  if (!confirm("确认清空本地任务缓存吗？服务端数据不会删除。")) return;
  state.tasks = [];
  state.selectedTaskId = null;
  persistLocalTasks();
  renderTaskList();
  refreshTaskCounters();
  renderSelectedTask();
  setStatus("本地缓存已清空", "success");
}

function createDraft() {
  state.selectedTaskId = DRAFT_TASK_ID;
  renderTaskList();
  elements.promptInput.focus();
  renderSelectedTask();
}

function fillDemo() {
  elements.promptInput.value = "A premium product poster for a cute orange cat astronaut sticker, clean pastel background, crisp edges, soft studio lighting, no text, no watermark.";
  persistSettings();
  setStatus("已填入示例提示词", "success");
}

function toggleApiKeyVisibility() {
  const isText = elements.apiKeyInput.type === "text";
  elements.apiKeyInput.type = isText ? "password" : "text";
  elements.toggleKeyButton.textContent = isText ? "显示" : "隐藏";
}

async function copyCurl() {
  const settings = getSettings();
  const payload = await createTaskPayload();
  const safePayload = JSON.stringify(payload, null, 2);
  const command = `curl --location '${window.location.origin}/api/tasks' \
  --header 'Authorization: Bearer ${settings.apiKey || "sk-your-key"}' \
  --header 'Content-Type: application/json' \
  --data '${safePayload}'`;
  await navigator.clipboard.writeText(command);
  setStatus("curl\u5DF2\u590D\u5236", "success");
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

async function updateFromGit() {
  const token = prompt("请输入 UPDATE_TOKEN");
  if (!token) return;
  try {
    const response = await fetch(`${getSettings().baseUrl}/api/update`, {
      method: "POST",
      headers: { "X-Update-Token": token },
    });
    const data = await parseJsonResponse(response);
    if (!response.ok) throw new Error(data?.error?.message || `HTTP ${response.status}`);
    setStatus("更新已触发，服务将自动重启", "success");
  } catch (error) {
    setStatus(error.message, "error");
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

window.addEventListener("beforeunload", () => {
  resetCurrentImage();
  for (const file of state.references) {
    if (file.previewUrl) URL.revokeObjectURL(file.previewUrl);
  }
});
