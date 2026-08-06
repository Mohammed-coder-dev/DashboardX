/* ─── Ridge — Frontend Logic ───────────────────────────── */
const uploadScreen    = document.getElementById("uploadScreen");
const loadingScreen   = document.getElementById("loadingScreen");
const dashboardScreen = document.getElementById("dashboardScreen");
const dropzone        = document.getElementById("dropzone");
const dropzoneIcon    = document.getElementById("dropzoneIcon");
const fileInput       = document.getElementById("fileInput");
const fileListEl      = document.getElementById("fileList");
const urlInput        = document.getElementById("urlInput");
const questionInput   = document.getElementById("questionInput");
const analyzeBtn      = document.getElementById("analyzeBtn");
const errorBox        = document.getElementById("errorBox");
const resetBtn        = document.getElementById("resetBtn");
const loadingFileCount = document.getElementById("loadingFileCount");
const loadingTitle    = document.getElementById("loadingTitle");
const loadingProgressBar = document.getElementById("loadingProgressBar");
const cancelAnalysisBtn = document.getElementById("cancelAnalysisBtn");
let activeRequestController = null;
let loadingTimers = [];
const uploadReadiness = document.getElementById("uploadReadiness");
const dropzoneTitle   = document.getElementById("dropzoneTitle");

const dashTitle         = document.getElementById("dashTitle");
const dashMeta          = document.getElementById("dashMeta");
const crossSummarySection = document.getElementById("crossSummarySection");
const crossSummaryText  = document.getElementById("crossSummaryText");
const crossGrid         = document.getElementById("crossGrid");
const crossInsights     = document.getElementById("crossInsights");
const crossConclusion   = document.getElementById("crossConclusion");
const fileTabs          = document.getElementById("fileTabs");
const tabsBar           = document.getElementById("tabsBar");
const summaryText       = document.getElementById("summaryText");
const insightsList      = document.getElementById("insightsList");
const varList           = document.getElementById("varList");
const varListTitle      = document.getElementById("varListTitle");
const statGrid          = document.getElementById("statGrid");
const statsSection      = document.getElementById("statsSection");
const spreadStrips      = document.getElementById("spreadStrips");
const chartsGrid        = document.getElementById("chartsGrid");
const chartsSection     = document.getElementById("chartsSection");
const corrSection       = document.getElementById("corrSection");
const corrMatrix        = document.getElementById("corrMatrix");
const corrList          = document.getElementById("corrList");
const conclusionText    = document.getElementById("conclusionText");
const topicsSection     = document.getElementById("topicsSection");
const topicsList        = document.getElementById("topicsList");
const qualitySection    = document.getElementById("qualitySection");
const qualityGrade      = document.getElementById("qualityGrade");
const qualityMeta       = document.getElementById("qualityMeta");
const qualityIssues     = document.getElementById("qualityIssues");
const qualityColumns    = document.getElementById("qualityColumns");
const rawTextSection    = document.getElementById("rawTextSection");
const rawTextPreview    = document.getElementById("rawTextPreview");
const conclusionSection = document.getElementById("conclusionSection");
const explainBar        = document.getElementById("explainBar");
const explainSub        = document.getElementById("explainSub");
const explainBtn        = document.getElementById("explainBtn");
const summaryCard       = document.getElementById("summaryCard");
const evidenceSection   = document.getElementById("evidenceSection");
const evidenceList      = document.getElementById("evidenceList");
const targetBar         = document.getElementById("targetBar");
const targetSelect      = document.getElementById("targetSelect");
const sampleBtn         = document.getElementById("sampleBtn");
const sampleStrip       = document.getElementById("sampleStrip");
const exportJsonBtn     = document.getElementById("exportJsonBtn");
const exportReportBtn   = document.getElementById("exportReportBtn");
const analysisRecord    = document.getElementById("analysisRecord");
const analysisRecordSummary = document.getElementById("analysisRecordSummary");
const analysisRecordGrid = document.getElementById("analysisRecordGrid");
const resultNav          = document.getElementById("resultNav");
const aiDetailGrid       = document.getElementById("aiDetailGrid");
const analysisModeHint   = document.getElementById("analysisModeHint");
const urlInputWrap       = document.getElementById("urlInputWrap");
const questionInputWrap  = document.getElementById("questionInputWrap");
const fileDashboard      = document.getElementById("fileDashboard");
const compareSection     = document.getElementById("compareSection");
const compareTitle       = document.getElementById("compareTitle");
const compareMetrics     = document.getElementById("compareMetrics");
const compareQuality     = document.getElementById("compareQuality");
const compareSchema      = document.getElementById("compareSchema");
const compareFindings    = document.getElementById("compareFindings");
const compareColumnRows  = document.getElementById("compareColumnRows");
const overviewSection    = document.getElementById("overviewSection");
const overviewGrid       = document.getElementById("overviewGrid");
const overviewFocus      = document.getElementById("overviewFocus");
const columnInspector    = document.getElementById("columnInspector");
const columnInspectorTitle = document.getElementById("columnInspectorTitle");
const columnInspectorMeta = document.getElementById("columnInspectorMeta");
const columnInspectorMetrics = document.getElementById("columnInspectorMetrics");
const columnInspectorVisual = document.getElementById("columnInspectorVisual");
const columnInspectorClose = document.getElementById("columnInspectorClose");
const tierData           = document.getElementById("tierData");
const tierDataBody       = document.getElementById("tierDataBody");
const tierDataToggle     = document.getElementById("tierDataToggle");
const tierDataJump       = document.getElementById("tierDataJump");
const resultTiers        = ["tierFindings", "tierSupport", "tierData", "tierInterpretation"]
  .map((id) => document.getElementById(id));
const workspaceRail      = document.getElementById("workspaceRail");
const workspaceCanvas    = document.getElementById("workspaceCanvas");
const railToggle         = document.getElementById("railToggle");
const railSource         = document.getElementById("railSource");
const railColumns        = document.getElementById("railColumns");
const railColumnList     = document.getElementById("railColumnList");
const railColumnsCount   = document.getElementById("railColumnsCount");
const railColumnsReset   = document.getElementById("railColumnsReset");
const rerunBtn           = document.getElementById("rerunBtn");
const rerunHint          = document.getElementById("rerunHint");
const staleBanner        = document.getElementById("staleBanner");
const structureNote      = document.getElementById("structureNote");
const structureSummary   = document.getElementById("structureSummary");
const structureDetail    = document.getElementById("structureDetail");
const exclusionNote      = document.getElementById("exclusionNote");
const exclusionSummary   = document.getElementById("exclusionSummary");
const exclusionList      = document.getElementById("exclusionList");

const steps = [document.getElementById("step1"),document.getElementById("step2"),
               document.getElementById("step3"),document.getElementById("step4")];

const settingsBtn     = document.getElementById("settingsBtn");
const settingsPanel   = document.getElementById("settingsPanel");
const apiKeyInput     = document.getElementById("apiKeyInput");
const modelSelect     = document.getElementById("modelSelect");
const saveSettingsBtn = document.getElementById("saveSettingsBtn");
const settingsStatus  = document.getElementById("settingsStatus");

// ─── Browser storage (Ridge keys, migrated from the DashboardX era) ──
const KEY_STORAGE     = "ridge_api_key";
const MODEL_STORAGE   = "ridge_model";
const SESSION_STORAGE = "ridge_session";

// One-time rename of the pre-Ridge keys. `dx_*` appears here and in this
// migration's tests only; everywhere else uses the names above. Each key is
// copied to its new name in the store it was found in, then removed, so a
// returning user keeps their key, model and history without noticing.
function migrateLegacyStorage(stores = [localStorage, sessionStorage]) {
  const renames = [
    ["dx_api_key", KEY_STORAGE],
    ["dx_model", MODEL_STORAGE],
    ["dx_session", SESSION_STORAGE],
  ];
  const migrated = [];
  for (const store of stores) {
    if (!store) continue;
    for (const [legacy, current] of renames) {
      let value = null;
      try { value = store.getItem(legacy); } catch { continue; }
      if (value === null) continue;
      // Never clobber a value already stored under the new name.
      try {
        if (store.getItem(current) === null) store.setItem(current, value);
        store.removeItem(legacy);
        migrated.push(legacy);
      } catch { /* a full or blocked store must not break startup */ }
    }
  }
  return migrated;
}

migrateLegacyStorage();

// ─── API settings (BYOK) ──────────────────────────────────────
const rememberKeyToggle = document.getElementById("rememberKeyToggle");
let serverHasKey = false;
let modelLabels  = {};

// The key lives in sessionStorage (this tab, until it closes) unless the user
// explicitly asks to remember it on this device.
function getApiKey() {
  return sessionStorage.getItem(KEY_STORAGE) || localStorage.getItem(KEY_STORAGE) || "";
}
function storeApiKey(key, remember) {
  sessionStorage.removeItem(KEY_STORAGE);
  localStorage.removeItem(KEY_STORAGE);
  if (!key) return;
  (remember ? localStorage : sessionStorage).setItem(KEY_STORAGE, key);
}
function getModel()    { return localStorage.getItem(MODEL_STORAGE) || ""; }
function keyMissing()  { return !serverHasKey && !getApiKey(); }

function updateSettingsBtn() {
  settingsBtn.classList.toggle("needs-key", keyMissing());
  settingsBtn.textContent = keyMissing() ? "Add AI explanation" : "AI settings";
}

async function initSettings() {
  try {
    const res    = await fetch("/api/health");
    const health = await res.json();
    serverHasKey = health.serverKey;
    modelSelect.innerHTML = health.models.map(m =>
      `<option value="${m.id}">${m.label}${m.note ? ` — ${m.note}` : ""}${m.id === health.defaultModel ? " (default)" : ""}</option>`).join("");
    health.models.forEach(m => { modelLabels[m.id] = m.label; });
    modelSelect.value = getModel() || health.defaultModel;
  } catch (_) { /* health check failing shouldn't block the UI */ }
  apiKeyInput.value = getApiKey();
  if (rememberKeyToggle) rememberKeyToggle.checked = Boolean(localStorage.getItem(KEY_STORAGE));
  updateSettingsBtn();
}

settingsBtn.addEventListener("click", () => {
  const opening = settingsPanel.style.display === "none";
  settingsPanel.style.display = opening ? "" : "none";
  settingsBtn.setAttribute("aria-expanded", String(opening));
  if (opening) apiKeyInput.focus();
});

settingsPanel.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  settingsPanel.style.display = "none";
  settingsBtn.setAttribute("aria-expanded", "false");
  settingsBtn.focus();
});

saveSettingsBtn.addEventListener("click", () => {
  storeApiKey(apiKeyInput.value.trim(), rememberKeyToggle?.checked === true);
  localStorage.setItem(MODEL_STORAGE, modelSelect.value);
  updateSettingsBtn();
  settingsStatus.textContent = "Saved ✓";
  setTimeout(() => {
    settingsStatus.textContent = "";
    settingsPanel.style.display = "none";
    settingsBtn.setAttribute("aria-expanded", "false");
  }, 900);
});

const settingsReady = initSettings();

function modelChip() {
  const id = getModel() || modelSelect.value;
  return (modelLabels[id] || "Claude").toUpperCase();
}

// Everything the dashboard renders (model output, filenames, shared payloads)
// is untrusted, so every interpolation into innerHTML goes through esc().
function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, c =>
    ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
}

// ─── History & sharing ────────────────────────────────────────
const historySection = document.getElementById("historySection");
const historyList    = document.getElementById("historyList");
const shareBtn       = document.getElementById("shareBtn");
const saveToggle     = document.getElementById("saveToggle");
const saveToggleHint = document.getElementById("saveToggleHint");
let currentAnalysisId = null;

// Persistence is opt-in per analysis; surface what opting in means.
saveToggle?.addEventListener("change", () => {
  if (saveToggleHint) saveToggleHint.style.display = saveToggle.checked ? "" : "none";
});

function getSessionId() {
  let id = localStorage.getItem(SESSION_STORAGE);
  if (!id) { id = crypto.randomUUID().replace(/-/g, ""); localStorage.setItem(SESSION_STORAGE, id); }
  return id;
}

async function loadHistory() {
  try {
    const res  = await fetch(`/api/history?session=${encodeURIComponent(getSessionId())}`);
    const data = await res.json();
    if (!data.enabled || data.items.length === 0) { historySection.style.display = "none"; return; }
    historySection.style.display = "";
    historyList.innerHTML = data.items.map(item => {
      const when = new Date(item.created_at).toLocaleString(undefined, { month:"short", day:"numeric", hour:"2-digit", minute:"2-digit" });
      const icon = item.kind === "comparison" ? "A/B" : (item.kind === "multi" ? "FILES" : (FILE_ICONS[item.filename.split(".").pop().toLowerCase()] || "FILE"));
      return `<div class="history-item" data-id="${esc(item.id)}">
        <span>${icon}</span>
        <span class="history-item-name">${esc(item.filename)}</span>
        <span class="history-item-meta">${esc(when)}</span>
        <button class="history-delete" data-id="${esc(item.id)}" title="Delete this saved analysis" aria-label="Delete ${esc(item.filename)} from history">✕</button>
      </div>`;
    }).join("");
    historyList.querySelectorAll(".history-item").forEach(el =>
      el.addEventListener("click", () => openSaved(el.dataset.id)));
    historyList.querySelectorAll(".history-delete").forEach(btn =>
      btn.addEventListener("click", async (event) => {
        event.stopPropagation();
        if (!confirm("Delete this saved analysis? Its share link will stop working.")) return;
        try {
          const res = await fetch(`/api/history/${encodeURIComponent(btn.dataset.id)}`, {
            method: "DELETE",
            headers: { "x-ridge-session": getSessionId() },
          });
          if (!res.ok) throw new Error();
          if (currentAnalysisId === btn.dataset.id) { currentAnalysisId = null; updateShareBtn(); }
          loadHistory();
        } catch (_) { alert("Could not delete this analysis."); }
      }));
  } catch (_) { historySection.style.display = "none"; }
}

async function openSaved(id) {
  cancelAnalysisBtn.style.display = "none";
  loadingTitle.textContent = "Opening saved analysis";
  loadingFileCount.textContent = "Loading the stored result and its analysis record.";
  animateLoadingSteps({ kind: "saved" });
  showScreen("loading");
  hideError();
  try {
    const res = await fetch(`/api/analysis/${encodeURIComponent(id)}`);
    const row = await res.json()
      .catch(() => ({ error: `Could not load analysis (HTTP ${res.status}).` }));
    if (!res.ok) throw new Error(row.error || "Could not load analysis.");
    currentAnalysisId = row.id;
    lastSource = null;
    if (row.kind === "comparison") renderComparisonDashboard(row.payload);
    else if (row.kind === "multi") renderMultiDashboard(row.payload);
    else { allFileResults = [row.payload]; renderSingleFile(row.payload, false); }
    sheetBar.style.display = "none";
    updateShareBtn();
    showScreen("dashboard");
  } catch (err) {
    showScreen("upload");
    showError(err.message);
  } finally {
    clearLoadingTimers();
  }
}

function updateShareBtn() {
  shareBtn.style.display = currentAnalysisId ? "" : "none";
}

shareBtn.addEventListener("click", async () => {
  const link = `${location.origin}/app?a=${currentAnalysisId}`;
  try {
    await navigator.clipboard.writeText(link);
    shareBtn.textContent = "✓ Link copied";
  } catch (_) {
    prompt("Copy this share link:", link);
  }
  setTimeout(() => { shareBtn.textContent = "Share"; }, 1500);
});

loadHistory();
const sharedId = new URLSearchParams(location.search).get("a");
if (sharedId) openSaved(sharedId);

const FILE_ICONS = {
  xlsx:"XLSX",xls:"XLS",csv:"CSV",json:"JSON",pdf:"PDF",
  pptx:"PPTX",ppt:"PPT",docx:"DOCX",doc:"DOC",txt:"TXT",md:"MD",
};
const MAX_FILES = 10;
// Chart cards rendered before the grid stops and says so. Wide files produce a
// chart per column; past this many the marginal card is noise, not signal.
const MAX_CHART_CARDS = 12;

let selectedFiles  = [];
let chartInstances = [];
let allFileResults = [];
let activeTabIdx   = 0;
let analysisMode   = "analyze";
let currentComparison = null;
// What produced the current dashboard, so sheet chips can re-run it.
// null when it came from history/share (no re-runnable source).
let lastSource     = null;
let lastSheet      = null;
let currentTarget  = null;
// null means "every column"; an array is an explicit narrowing staged in the rail.
let currentColumns = null;
// Corrections to the inferred structure. Held here and re-sent with the file,
// never applied to a stored result: the file only ever lives in this tab.
let currentHeaderRow   = null;
let currentIncludeRows = [];

document.querySelectorAll("[data-analysis-mode]").forEach((button) => {
  button.addEventListener("click", () => {
    analysisMode = button.dataset.analysisMode;
    document.querySelectorAll("[data-analysis-mode]").forEach((candidate) => {
      const active = candidate === button;
      candidate.classList.toggle("active", active);
      candidate.setAttribute("aria-pressed", String(active));
    });
    const comparing = analysisMode === "compare";
    if (comparing && selectedFiles.length > 2) selectedFiles = selectedFiles.slice(0, 2);
    analysisModeHint.textContent = comparing
      ? "Choose exactly two tabular files. File 1 is the baseline; file 2 is the current version."
      : "Upload one file for a focused analysis, or several to explore them side by side.";
    urlInputWrap.style.display = comparing ? "none" : "";
    questionInputWrap.style.display = comparing ? "none" : "";
    // The strip, not just its button: half-hiding the invitation reads broken.
    sampleStrip.style.display = comparing ? "none" : "";
    hideError();
    renderFileList();
  });
});

// ─── File handling ────────────────────────────────────────────
fileInput.addEventListener("change", (e) => handleFiles([...e.target.files]));
dropzone.addEventListener("dragover",  (e) => { e.preventDefault(); dropzone.classList.add("drag-over"); });
dropzone.addEventListener("dragleave", () => dropzone.classList.remove("drag-over"));
dropzone.addEventListener("drop", (e) => {
  e.preventDefault(); dropzone.classList.remove("drag-over");
  handleFiles([...e.dataTransfer.files]);
});

function handleFiles(incoming) {
  const combined = [...selectedFiles];
  const limit = analysisMode === "compare" ? 2 : MAX_FILES;
  const rejected = [];
  for (const f of incoming) {
    const extension = f.name.split(".").pop().toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(extension)) {
      rejected.push(`Unsupported file type: ${f.name}`);
      continue;
    }
    if (f.size > MAX_REQUEST_BYTES) {
      rejected.push(`${f.name} is larger than the 4 MB upload limit`);
      continue;
    }
    if (combined.length >= limit) {
      rejected.push(analysisMode === "compare" ? "Comparison mode accepts exactly two files" : `You can analyze up to ${MAX_FILES} files at once`);
      break;
    }
    if (!combined.find(x => x.name === f.name && x.size === f.size)) combined.push(f);
  }
  selectedFiles = combined;
  const totalBytes = selectedFiles.reduce((sum, file) => sum + file.size, 0);
  if (totalBytes > MAX_REQUEST_BYTES) {
    rejected.push("Selected files exceed the 4 MB total upload limit");
  }
  if (rejected.length) showError(`${rejected[0]}. ${rejected[0].includes("4 MB") ? "Use the HTTPS link option for larger data." : ""}`.trim());
  else hideError();
  renderFileList();
}

function urlValue() { return urlInput.value.trim(); }

urlInput.addEventListener("input", () => { if (selectedFiles.length === 0) renderFileList(); });

function renderFileList() {
  const comparing = analysisMode === "compare";
  const selectedBytes = selectedFiles.reduce((sum, file) => sum + file.size, 0);
  const withinLimit = selectedBytes <= MAX_REQUEST_BYTES;
  dropzone.classList.toggle("has-files", selectedFiles.length > 0);
  dropzone.classList.toggle("is-comparing", comparing);
  dropzoneTitle.textContent = comparing ? "Add baseline and current files" : "Drop files here or click to browse";
  if (selectedFiles.length === 0) {
    fileListEl.style.display = "none";
    dropzoneIcon.textContent = "↑";
    analyzeBtn.disabled = comparing || !urlValue();
    analyzeBtn.textContent = comparing ? "Select two files to compare" : (urlValue() ? "Analyze link →" : "Analyze data →");
    uploadReadiness.className = `upload-status${urlValue() ? " ready" : ""}`;
    uploadReadiness.innerHTML = urlValue()
      ? `<span class="upload-status-dot"></span><span>Link ready. Ridge will fetch and analyze it securely.</span>`
      : `<span class="upload-status-dot"></span><span>${comparing ? "Add a baseline file and a current file to continue." : "Choose a file to begin. Deterministic analysis does not need an API key."}</span>`;
    return;
  }

  dropzoneIcon.textContent = selectedFiles.length === 1
    ? (FILE_ICONS[selectedFiles[0].name.split(".").pop().toLowerCase()] || "FILE")
    : `${selectedFiles.length}`;

  fileListEl.style.display = "flex";
  fileListEl.innerHTML = selectedFiles.map((f, i) => {
    const ext  = f.name.split(".").pop().toLowerCase();
    const icon = FILE_ICONS[ext] || "FILE";
    const size = f.size > 1024*1024 ? `${(f.size/1024/1024).toFixed(1)}MB` : `${(f.size/1024).toFixed(0)}KB`;
    const role = comparing ? (i === 0 ? "Baseline" : "Current") : (selectedFiles.length > 1 ? `File ${i + 1}` : "Ready");
    return `<div class="file-chip">
      <span class="file-chip-role">${esc(role)}</span>
      <span class="file-chip-icon">${icon}</span>
      <span class="file-chip-name">${esc(f.name)}</span>
      <span class="file-chip-size">${size}</span>
      <button class="file-chip-remove" data-idx="${i}" type="button" aria-label="Remove ${esc(f.name)}">×</button>
    </div>`;
  }).join("");

  if (selectedFiles.length < (comparing ? 2 : MAX_FILES)) {
    fileListEl.innerHTML += `<label class="add-more-btn" for="fileInput">+ Add more</label>`;
  }
  if (comparing && selectedFiles.length === 2) {
    fileListEl.innerHTML += `<button class="swap-files-btn" data-swap-files type="button" aria-label="Swap baseline and current files">⇄ Swap order</button>`;
  }

  analyzeBtn.disabled = !withinLimit || (comparing && selectedFiles.length !== 2);
  analyzeBtn.textContent = comparing
    ? (selectedFiles.length === 2 ? "Compare baseline to current →" : "Add one current file")
    : (selectedFiles.length === 1 ? "Analyze data →" : `Analyze ${selectedFiles.length} files →`);
  const size = selectedBytes > 1024 * 1024 ? `${(selectedBytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(selectedBytes / 1024))} KB`;
  const status = !withinLimit
    ? `${size} selected — over the 4 MB total upload limit.`
    : comparing && selectedFiles.length < 2
      ? `${selectedFiles[0].name} is the baseline. Add the current file next.`
      : comparing
        ? `Ready to compare ${selectedFiles[0].name} against ${selectedFiles[1].name}.`
        : `${selectedFiles.length} file${selectedFiles.length === 1 ? "" : "s"} ready · ${size} total · deterministic analysis available.`;
  uploadReadiness.className = `upload-status ${withinLimit && (!comparing || selectedFiles.length === 2) ? "ready" : !withinLimit ? "error" : ""}`;
  uploadReadiness.innerHTML = `<span class="upload-status-dot"></span><span>${esc(status)}</span>`;
}

function removeFile(idx) {
  selectedFiles.splice(idx, 1);
  fileInput.value = "";
  renderFileList();
}

// Delegated handlers instead of inline onclick attributes, so the CSP can
// drop 'unsafe-inline' for scripts.
fileListEl.addEventListener("click", (e) => {
  const btn = e.target.closest(".file-chip-remove");
  if (btn) removeFile(Number(btn.dataset.idx));
  if (e.target.closest("[data-swap-files]") && selectedFiles.length === 2) {
    selectedFiles = [selectedFiles[1], selectedFiles[0]];
    renderFileList();
  }
});
tabsBar.addEventListener("click", (e) => {
  const tab = e.target.closest(".tab-btn");
  if (tab) switchTab(Number(tab.dataset.idx));
});

// ─── Analyze ──────────────────────────────────────────────────
analyzeBtn.addEventListener("click", () => {
  currentTarget = null; currentColumns = null;
  currentHeaderRow = null; currentIncludeRows = [];
  runAnalysis();
});
resetBtn.addEventListener("click", resetDashboard);

const sheetBar = document.getElementById("sheetBar");

function renderSheetBar(meta) {
  const sheets = meta?.sheets || [];
  if (sheets.length < 2 || !lastSource) { sheetBar.style.display = "none"; return; }
  sheetBar.style.display = "";
  sheetBar.innerHTML = `<span class="sheet-bar-label">Sheets</span>` + sheets.map(s => `
    <button class="sheet-chip ${s === meta.sheetName ? "active" : ""}" data-sheet="${esc(s)}" type="button">${esc(s)}</button>`).join("");
}

sheetBar.addEventListener("click", (e) => {
  const chip = e.target.closest(".sheet-chip");
  if (!chip || chip.classList.contains("active") || !lastSource) return;
  const sheet = chip.dataset.sheet;
  if (lastSource.kind === "url") runUrlAnalysis(sheet);
  else runAnalysis(sheet);
});

// Vercel rejects request bodies over ~4.5 MB before the server sees them,
// so oversized uploads are caught here with a useful message instead.
const MAX_REQUEST_BYTES = 4 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set(Object.keys(FILE_ICONS));

async function runAnalysis(sheet) {
  const isComparison = analysisMode === "compare";
  if (!isComparison && selectedFiles.length === 0 && urlValue()) return runUrlAnalysis(sheet);
  if (selectedFiles.length === 0) return;
  if (isComparison && selectedFiles.length !== 2) {
    showError("Comparison mode requires exactly two files: baseline first, current second.");
    return;
  }
  const totalBytes = selectedFiles.reduce((sum, f) => sum + f.size, 0);
  if (totalBytes > MAX_REQUEST_BYTES) {
    showError("Uploads are limited to 4 MB per request in total — analyze a larger file by pasting a link instead.");
    return;
  }
  const isMulti  = selectedFiles.length > 1 && !isComparison;
  const question = questionInput.value.trim();
  const requestController = new AbortController();
  activeRequestController = requestController;
  cancelAnalysisBtn.style.display = "";
  showScreen("loading");
  hideError();
  animateLoadingSteps({ kind: isComparison ? "compare" : "analyze", withAI: !isComparison && !keyMissing() });

  if (isComparison) {
    loadingTitle.textContent = "Comparing two versions";
    loadingFileCount.textContent = `${selectedFiles[0].name} → ${selectedFiles[1].name}`;
  } else if (isMulti) {
    loadingTitle.textContent = `Analyzing ${selectedFiles.length} files`;
    loadingFileCount.textContent = "Each file is profiled independently before the results are combined.";
  } else {
    loadingTitle.textContent = `Analyzing ${selectedFiles[0].name}`;
    loadingFileCount.textContent = "Reading the full file and computing its evidence profile.";
  }

  lastSheet = sheet || null;
  const formData = new FormData();
  formData.append("question", isComparison ? "" : question);
  if (!isComparison) formData.append("model", getModel() || modelSelect.value || "");
  if (sheet && !isMulti) formData.append("sheet", sheet);
  if (currentTarget && !isComparison) formData.append("target", currentTarget);
  // Column narrowing is a single-file setting; the rail only offers it there.
  if (currentColumns && !isComparison && !isMulti) formData.append("columns", JSON.stringify(currentColumns));
  // Structural corrections are single-file too: one header row cannot mean the
  // same thing across a batch.
  if (currentHeaderRow && !isComparison && !isMulti) formData.append("headerRow", String(currentHeaderRow));
  if (currentIncludeRows.length > 0 && !isComparison && !isMulti) formData.append("includeRows", JSON.stringify(currentIncludeRows));

  if (isMulti || isComparison) {
    selectedFiles.forEach(f => formData.append("files", f));
  } else {
    formData.append("file", selectedFiles[0]);
  }

  formData.append("save", saveToggle?.checked ? "true" : "false");

  try {
    const endpoint = isComparison ? "/api/compare" : (isMulti ? "/api/analyze-multi" : "/api/analyze");
    const headers  = { "x-ridge-session": getSessionId() };
    if (!isComparison && getApiKey()) headers["x-anthropic-key"] = getApiKey();
    const response = await fetch(endpoint, { method:"POST", headers, body:formData, signal:requestController.signal });
    const data     = await response.json()
      .catch(() => ({ error: `The server returned an unexpected response (HTTP ${response.status}) — the upload may be too large.` }));
    if (!response.ok) throw new Error(apiErrorMessage(data, "Analysis failed."));
    await delay(500);
    if (requestController.signal.aborted) return;

    lastSource = isMulti || isComparison ? null : { kind: "upload" };
    if (isComparison) {
      renderComparisonDashboard(data);
    } else if (isMulti) {
      renderMultiDashboard(data);
    } else {
      allFileResults = [data];
      renderSingleFile(data, false);
    }
    renderSheetBar(isMulti || isComparison ? null : data.meta);
    currentAnalysisId = data.analysisId || null;
    updateShareBtn();
    loadHistory();
    showScreen("dashboard");
  } catch (err) {
    if (err.name === "AbortError") return;
    showScreen("upload");
    showError(err.message);
  } finally {
    if (activeRequestController === requestController) activeRequestController = null;
    cancelAnalysisBtn.style.display = "none";
    clearLoadingTimers();
  }
}

async function runUrlAnalysis(sheet) {
  const requestController = new AbortController();
  activeRequestController = requestController;
  cancelAnalysisBtn.style.display = "";
  showScreen("loading");
  hideError();
  animateLoadingSteps({ kind: "url", withAI: !keyMissing() });
  loadingTitle.textContent = "Analyzing linked data";
  loadingFileCount.textContent = "Fetching the HTTPS source before running the same deterministic checks.";

  try {
    const headers = { "Content-Type": "application/json", "x-ridge-session": getSessionId() };
    if (getApiKey()) headers["x-anthropic-key"] = getApiKey();
    const response = await fetch("/api/analyze-url", {
      method: "POST",
      headers,
      signal: requestController.signal,
      body: JSON.stringify({
        url: urlValue(),
        question: questionInput.value.trim(),
        model: getModel() || modelSelect.value || "",
        sheet: sheet || undefined,
        target: currentTarget || undefined,
        columns: currentColumns || undefined,
        save: saveToggle?.checked === true,
      }),
    });
    const data = await response.json()
      .catch(() => ({ error: `The server returned an unexpected response (HTTP ${response.status}).` }));
    if (!response.ok) throw new Error(apiErrorMessage(data, "Analysis failed."));
    await delay(500);
    if (requestController.signal.aborted) return;
    lastSource = { kind: "url" };
    allFileResults = [data];
    renderSingleFile(data, false);
    renderSheetBar(data.meta);
    currentAnalysisId = data.analysisId || null;
    updateShareBtn();
    loadHistory();
    showScreen("dashboard");
  } catch (err) {
    if (err.name === "AbortError") return;
    showScreen("upload");
    showError(err.message);
  } finally {
    if (activeRequestController === requestController) activeRequestController = null;
    cancelAnalysisBtn.style.display = "none";
    clearLoadingTimers();
  }
}

function clearLoadingTimers() {
  loadingTimers.forEach((timer) => clearTimeout(timer));
  loadingTimers = [];
}

function setLoadingStep(index) {
  steps.forEach((step, stepIndex) => {
    step.classList.toggle("active", stepIndex === index);
    step.classList.toggle("complete", stepIndex < index);
    if (stepIndex === index) step.setAttribute("aria-current", "step");
    else step.removeAttribute("aria-current");
  });
  loadingProgressBar.style.width = `${(index + 1) * 25}%`;
}

function animateLoadingSteps({ kind = "analyze", withAI = false } = {}) {
  clearLoadingTimers();
  const labels = kind === "compare"
    ? ["Validating file pair", "Profiling baseline", "Profiling current", "Calculating deltas"]
    : kind === "saved"
      ? ["Locating record", "Loading results", "Verifying metadata", "Opening dashboard"]
    : kind === "url"
      ? ["Fetching source", "Profiling columns", withAI ? "Interpreting evidence" : "Computing evidence", "Building results"]
      : ["Parsing source", "Profiling columns", withAI ? "Interpreting evidence" : "Computing evidence", "Building results"];
  steps.forEach((step, index) => { step.querySelector("strong").textContent = labels[index]; });
  setLoadingStep(0);
  [900, 1800, 2700].forEach((d, i) => {
    loadingTimers.push(setTimeout(() => setLoadingStep(i + 1), d));
  });
}

cancelAnalysisBtn.addEventListener("click", () => {
  if (!activeRequestController) return;
  activeRequestController.abort();
  activeRequestController = null;
  clearLoadingTimers();
  cancelAnalysisBtn.style.display = "none";
  showScreen("upload");
  showError("Analysis cancelled. Your selected files are still ready when you want to try again.");
});

// ─── Deterministic comparison dashboard ───────────────────────
function signed(value, suffix = "") {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `${value > 0 ? "+" : ""}${value}${suffix}`;
}

function formatPValue(value) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  if (value < 0.0001) return "<0.0001";
  return value.toFixed(value < 0.01 ? 4 : 3).replace(/0+$/, "").replace(/\.$/, "");
}

function comparisonColumnValue(side, type) {
  if (!side) return "—";
  if (type === "numeric") return `mean ${side.mean} · median ${side.median} · ${side.coverage}% coverage`;
  if (type === "categorical") return side.top
    ? `${side.top.value} ${side.top.percentage}% · ${side.unique} levels`
    : `${side.unique} levels · ${side.coverage}% coverage`;
  if (type === "date") return `${side.earliest || "—"} → ${side.latest || "—"}`;
  return `${side.coverage ?? "—"}% coverage`;
}

function comparisonColumnChange(column) {
  if (column.type === "numeric") {
    const pct = column.deltas.meanPct === null ? "" : ` (${signed(column.deltas.meanPct, "%")})`;
    const meanTest = column.inference?.meanDifference;
    const distribution = column.inference?.distributionShift;
    const interval = meanTest?.confidenceInterval
      ? ` · 95% CI ${meanTest.confidenceInterval.lower} to ${meanTest.confidenceInterval.upper}, p=${formatPValue(meanTest.pValue)}`
      : "";
    const shift = distribution ? ` · KS D=${distribution.statistic}, p=${formatPValue(distribution.pValue)}` : "";
    return `mean ${signed(column.deltas.mean)}${pct}${interval}${shift}`;
  }
  if (column.type === "categorical") {
    if (column.dominantChanged) return "leading category changed";
    return `top share ${signed(column.deltas.topShare, " pts")}`;
  }
  if (column.type === "date") return "date range compared";
  return `coverage ${signed(column.deltas.coverage, " pts")}`;
}

function renderComparisonDashboard(data) {
  const comparison = data.comparison || {};
  const summary = comparison.summary || {};
  const quality = comparison.quality || {};
  currentComparison = data;
  allFileResults = [];
  activeTabIdx = 0;
  chartInstances.forEach((chart) => chart.destroy());
  chartInstances = [];
  resetPendingCharts();
  resetAsk(null, false);

  fileDashboard.style.display = "none";
  compareSection.style.display = "";
  crossSummarySection.style.display = "none";
  fileTabs.style.display = "none";
  resultNav.style.display = "none";
  targetBar.style.display = "none";
  sheetBar.style.display = "none";

  dashTitle.textContent = "File Comparison";
  dashMeta.innerHTML = `<span class="meta-chip">DETERMINISTIC</span><span class="meta-chip">${esc(summary.sharedColumns ?? 0)} SHARED COLUMNS</span><span class="meta-chip">v${esc(comparison.version || "—")}</span>`;
  compareTitle.textContent = `${comparison.labels?.baseline || "Baseline"} → ${comparison.labels?.current || "Current"}`;

  const metrics = [
    ["Rows", signed(summary.rowDelta), `${summary.baselineRows ?? 0} → ${summary.currentRows ?? 0}${summary.rowDeltaPct === null ? "" : ` · ${signed(summary.rowDeltaPct, "%")}`}`],
    ["Columns", signed(summary.columnDelta), `${summary.baselineColumns ?? 0} → ${summary.currentColumns ?? 0}`],
    ["Health score", signed(summary.healthScoreDelta, " pts"), `${quality.baseline?.healthScore ?? "—"} → ${quality.current?.healthScore ?? "—"}`],
    ["Completeness", signed(summary.completenessDelta, " pts"), `${quality.baseline?.completeness ?? "—"}% → ${quality.current?.completeness ?? "—"}%`],
  ];
  compareMetrics.innerHTML = metrics.map(([label, value, context]) => `
    <div class="compare-metric"><span class="compare-metric-label">${esc(label)}</span><strong class="compare-metric-value">${esc(value)}</strong><span class="compare-metric-context">${esc(context)}</span></div>`).join("");

  const qualityCards = [
    [comparison.labels?.baseline || "Baseline", quality.baseline || {}, "Baseline"],
    [comparison.labels?.current || "Current", quality.current || {}, "Current"],
  ];
  compareQuality.innerHTML = qualityCards.map(([name, side, label]) => {
    const health = Math.max(0, Math.min(100, Number(side.healthScore) || 0));
    const completeness = Math.max(0, Math.min(100, Number(side.completeness) || 0));
    return `<div class="compare-quality-card">
      <div class="compare-quality-head"><span class="compare-quality-name">${esc(name)}</span><span class="compare-quality-score">${esc(label)} · ${esc(side.healthGrade || "—")}</span></div>
      <div class="compare-bar-row"><span>Health</span><span class="compare-bar"><span style="width:${health}%"></span></span><span class="compare-bar-value">${esc(side.healthScore ?? "—")}/100</span></div>
      <div class="compare-bar-row"><span>Complete</span><span class="compare-bar"><span style="width:${completeness}%"></span></span><span class="compare-bar-value">${esc(side.completeness ?? "—")}%</span></div>
    </div>`;
  }).join("");

  const schema = comparison.schema || {};
  const schemaGroup = (label, values, kind) => `<div class="compare-schema-group"><span class="compare-schema-label">${esc(label)}</span>${values.length
    ? values.map((value) => `<span class="compare-chip ${esc(kind)}">${esc(value)}</span>`).join("")
    : `<span class="compare-chip">None</span>`}</div>`;
  compareSchema.innerHTML = schemaGroup("Added", schema.added || [], "added")
    + schemaGroup("Removed", schema.removed || [], "removed")
    + schemaGroup("Changed", (schema.typeChanges || []).map((change) => `${change.column}: ${change.baseline} → ${change.current}`), "changed")
    + schemaGroup("Shared", schema.shared || [], "");

  compareFindings.innerHTML = (comparison.findings || []).length
    ? comparison.findings.map((finding) => `
      <div class="compare-finding ${esc(finding.severity || "neutral")}"><strong>${esc(finding.title)}</strong><p>${esc(finding.detail)}</p></div>`).join("")
    : `<div class="compare-empty"><strong>No material changes detected</strong><p>The shared columns did not cross Ridge's reporting thresholds. Review the deltas below for smaller movements.</p></div>`;

  compareColumnRows.innerHTML = (comparison.columns || []).length
    ? comparison.columns.map((column) => `<tr><td>${esc(column.column)}</td><td>${esc(column.type)}</td><td>${esc(comparisonColumnValue(column.baseline, column.type))}</td><td>${esc(comparisonColumnValue(column.current, column.type))}</td><td class="change">${esc(comparisonColumnChange(column))}</td></tr>`).join("")
    : `<tr><td colspan="5">No shared columns have directly comparable types.</td></tr>`;
  renderAnalysisRecord(data.meta);
}

// ─── Multi-file dashboard ─────────────────────────────────────
function renderMultiDashboard(data) {
  currentComparison = null;
  compareSection.style.display = "none";
  fileDashboard.style.display = "";
  const { files, crossSummary, totalFiles, successCount } = data;
  allFileResults = files;
  resetAsk(null, false);

  // Topbar
  dashTitle.textContent = `${totalFiles} File Analysis`;
  dashMeta.innerHTML = `
    <span class="meta-chip">${successCount} ANALYZED</span>
    ${totalFiles - successCount > 0 ? `<span class="meta-chip" style="color:var(--red);">${totalFiles - successCount} FAILED</span>` : ""}
    <span class="meta-chip">${modelChip()}</span>
  `;

  // Cross-file summary
  if (crossSummary && successCount > 1) {
    crossSummarySection.style.display = "";
    crossSummaryText.textContent = crossSummary.summary;

    // Common themes + differences
    crossGrid.innerHTML = "";
    const themes = crossSummary.commonThemes || [];
    const diffs  = crossSummary.differences  || [];

    if (themes.length > 0) {
      const col = document.createElement("div");
      col.innerHTML = `<div class="cross-col-title">Common themes</div>` +
        themes.map(t => `<div class="cross-item theme"><strong>${esc(t.theme)}</strong><p>${esc(t.detail)}</p></div>`).join("");
      crossGrid.appendChild(col);
    }
    if (diffs.length > 0) {
      const col = document.createElement("div");
      col.innerHTML = `<div class="cross-col-title">↔ Key Differences</div>` +
        diffs.map(d => `<div class="cross-item diff"><strong>${esc(d.aspect)}</strong><p>${esc(d.detail)}</p></div>`).join("");
      crossGrid.appendChild(col);
    }

    // Cross insights
    crossInsights.innerHTML = (crossSummary.insights||[]).map(ins =>
      `<div class="insight-item ${esc(ins.type||"neutral")}" style="margin-bottom:8px;">
        <div class="insight-title">${esc(ins.title)}</div>
        <div class="insight-detail">${esc(ins.detail)}</div>
      </div>`
    ).join("");

    crossConclusion.textContent = crossSummary.conclusion;
  } else {
    crossSummarySection.style.display = "none";
  }

  // Tabs
  fileTabs.style.display = "";
  tabsBar.innerHTML = files.map((f, i) => {
    const ext  = f.filename.split(".").pop().toLowerCase();
    const icon = FILE_ICONS[ext] || "FILE";
    const hasErr = !!f.error;
    return `<button class="tab-btn ${i === 0 ? "active" : ""} ${hasErr ? "tab-error" : ""}"
      data-idx="${i}" type="button">${icon} ${esc(f.filename)}${hasErr ? " ⚠" : ""}</button>`;
  }).join("");

  // Render first tab
  activeTabIdx = 0;
  renderSingleFile(files[0], true);
}

function switchTab(idx) {
  activeTabIdx = idx;
  document.querySelectorAll(".tab-btn").forEach((b, i) => b.classList.toggle("active", i === idx));
  chartInstances.forEach(c => c.destroy());
  chartInstances = [];
  resetPendingCharts();
  renderSingleFile(allFileResults[idx], true);
}

// ─── Single file renderer ─────────────────────────────────────
function renderSingleFile(data, isTabbed) {
  currentComparison = null;
  compareSection.style.display = "none";
  fileDashboard.style.display = "";
  chartInstances.forEach(c => c.destroy());
  chartInstances = [];
  resetPendingCharts();

  if (data.error) {
    if (!isTabbed) resetAsk(null, false);
    summaryText.textContent = `Failed to analyze this file: ${data.error}`;
    insightsList.innerHTML = "";
    varList.innerHTML = "";
    statsSection.style.display = "none";
    rawTextSection.style.display = "none";
    chartsSection.style.display = "none";
    corrSection.style.display = "none";
    topicsSection.style.display = "none";
    qualitySection.style.display = "none";
    overviewSection.style.display = "none";
    analysisRecord.style.display = "none";
    resultNav.style.display = "none";
    aiDetailGrid.style.display = "none";
    conclusionText.textContent = "";
    return;
  }

  const { meta, stats, correlations, analysis, chartData, rawText } = data;

  if (!isTabbed) {
    const fileTypeLabel = { spreadsheet:"SPREADSHEET",json:"JSON",text:"TEXT FILE",pdf:"PDF",presentation:"POWERPOINT",document:"WORD DOC" }[meta.fileType]||meta.fileType.toUpperCase();
    dashTitle.textContent = meta.filename || "Analysis Complete";
    dashMeta.innerHTML = `
      <span class="meta-chip">${meta.totalRows.toLocaleString()} ${meta.isTabular?"ROWS":"LINES"}</span>
      ${meta.isTabular ? `<span class="meta-chip">${meta.columns} COLUMNS</span>` : ""}
      ${meta.pages    ? `<span class="meta-chip">${meta.pages} PAGES</span>` : ""}
      <span class="meta-chip file-type-chip">${fileTypeLabel}</span>
      <span class="meta-chip">${(modelLabels[meta.model] || modelChip()).toUpperCase()}</span>
    `;
    crossSummarySection.style.display = "none";
    fileTabs.style.display = "none";
  }

  // AI sections render only when an interpretation exists; without a key the
  // deterministic sections below stand on their own behind an explain CTA.
  const hasAI = Boolean(analysis);
  explainBar.style.display = hasAI ? "none" : "";
  summaryCard.style.display = hasAI ? "" : "none";
  aiDetailGrid.style.display = hasAI ? "" : "none";
  if (!hasAI) {
    const isDoc = !meta.isTabular;
    explainSub.textContent = isDoc
      ? "This document type has limited deterministic analysis (an excerpt is shown above). Adding an Anthropic API key enables full AI reading, insights and follow-up questions."
      : "Every statistic, quality check and piece of evidence above was computed deterministically — no AI involved yet. Add an interpretation when you want one.";
    explainBtn.textContent = keyMissing() ? "Add API key to explain →" : "Explain with Claude →";
  }

  summaryText.textContent = hasAI ? analysis.summary : "";

  insightsList.innerHTML = hasAI ? (analysis.insights||[]).map(ins => `
    <div class="insight-item ${esc(ins.type||"neutral")}">
      <div class="insight-title">${esc(ins.title)}</div>
      <div class="insight-detail">${esc(ins.detail)}</div>
    </div>`).join("") : "";

  varListTitle.textContent = meta.isTabular ? "Variable Explanations" : "Key Sections";
  varList.innerHTML = hasAI ? (analysis.variables||[]).map(v => `
    <div class="var-item">
      <div class="var-name">${esc(v.name)}</div>
      <div class="var-explanation">${esc(v.explanation)}</div>
      <div class="var-notable">→ ${esc(v.notable)}</div>
    </div>`).join("") : "";

  renderEvidence(data.evidence || [], data);
  renderOverview(data);
  syncSetupToResult(data);
  renderTargetBar(data);
  renderStructureNote(data);
  renderExclusionNote(data);
  renderRail(data);
  renderQuality(data);
  renderAnalysisRecord(meta);
  if (!isTabbed) resetAsk(data, true);

  const topics = (hasAI && analysis.topics) || [];
  if (topics.length > 0) {
    topicsSection.style.display = "";
    topicsList.innerHTML = topics.map(t => `
      <div class="topic-item importance-${esc(t.importance||"medium")}">
        <div class="topic-header">
          <span class="topic-name">${esc(t.name)}</span>
          <span class="topic-importance">${esc(t.importance||"medium")}</span>
        </div>
        <div class="topic-summary">${esc(t.summary)}</div>
      </div>`).join("");
  } else {
    topicsSection.style.display = "none";
  }

  if (meta.isTabular && Object.keys(stats).length > 0) {
    statsSection.style.display = "";
    rawTextSection.style.display = "none";
    spreadStrips.innerHTML = buildSpreadStripsHtml(stats);
    statGrid.innerHTML = Object.entries(stats).map(([col, s]) => {
      if (s.type === "numeric") {
        const coverage = s.coverage !== undefined
          ? statRow("coverage", `${s.coverage}%${s.invalid ? ` (${s.invalid} invalid)` : ""}`)
          : "";
        return `<button class="stat-card" data-column="${esc(col)}" type="button" aria-label="Inspect ${esc(col)} column">
        <div class="stat-card-head"><div class="stat-col-name">${esc(col)}</div><span class="stat-card-action">Inspect</span></div><span class="stat-type-badge numeric">numeric</span>
        ${statRow("mean",s.mean)}${s.meanConfidence95 ? statRow("95% CI", `${s.meanConfidence95.lower} to ${s.meanConfidence95.upper}`) : ""}${statRow("median",s.median)}${statRow("min",s.min)}${statRow("max",s.max)}${statRow("std",s.std)}${statRow("count",s.count)}${coverage}
      </button>`;
      }
      if (s.type === "date") return `<button class="stat-card" data-column="${esc(col)}" type="button" aria-label="Inspect ${esc(col)} column">
        <div class="stat-card-head"><div class="stat-col-name">${esc(col)}</div><span class="stat-card-action">Inspect</span></div><span class="stat-type-badge categorical">date</span>
        ${statRow("valid",s.validCount)}${statRow("earliest",s.earliest||"—")}${statRow("latest",s.latest||"—")}${statRow("range",s.rangeDays != null ? s.rangeDays + " days" : "—")}${s.trend ? statRow("trend", s.trend) : ""}
      </button>`;
      // Categorical top values are { value, count, percentage } objects ranked
      // by frequency; render the leading levels with their share.
      const topText = (s.top || [])
        .slice(0, 5)
        .map(t => typeof t === "object" && t !== null ? `${t.value} (${t.percentage}%)` : String(t))
        .join(", ");
      return `<button class="stat-card" data-column="${esc(col)}" type="button" aria-label="Inspect ${esc(col)} column">
        <div class="stat-card-head"><div class="stat-col-name">${esc(col)}</div><span class="stat-card-action">Inspect</span></div><span class="stat-type-badge categorical">${esc(s.role || "categorical")}</span>
        ${statRow("count",s.count)}${statRow("unique",s.unique)}
        <div class="stat-row"><span class="stat-key">most common</span><span class="stat-val" style="font-size:10px;">${esc(topText)}</span></div>
      </button>`;
    }).join("");
  } else {
    statsSection.style.display = "none";
    spreadStrips.innerHTML = "";
    if (rawText) { rawTextSection.style.display = ""; rawTextPreview.textContent = rawText; }
    else rawTextSection.style.display = "none";
  }

  if (correlations && correlations.length > 0) {
    corrSection.style.display = "";
    corrMatrix.innerHTML = buildCorrMatrixHtml(stats, correlations);
    corrList.innerHTML = correlations.map((c, idx) => {
      // Support both the current shape (columnA/coefficient/n/coverage) and the
      // legacy colA/r shape still present in previously shared analyses.
      const r = c.coefficient ?? c.r;
      const colA = c.columnA ?? c.colA;
      const colB = c.columnB ?? c.colB;
      const isPos = r >= 0, pct = Math.abs(r) * 100;
      const evidence = c.n !== undefined
        ? `<div class="corr-meta">${c.strength ? strengthScale(c.strength) : ""}<span>${esc(c.method || "pearson")} · n=${c.n} · ${c.coverage}% coverage${c.smallSample ? " · small sample" : ""}</span></div>`
        : "";
      const caveat = c.caveat ? `<div class="corr-caveat">Caveat — ${esc(c.caveat)}</div>` : "";
      // Older saved analyses carry no pairs; the number stands alone there
      // rather than gaining a plot it cannot honestly have.
      const scatter = c.scatter
        ? `<div class="corr-scatter"><canvas id="corr-scatter-${idx}" height="150" role="img" aria-label="${esc(`${colA} against ${colB}, ${c.scatter.n} pairs`)}"></canvas></div>`
        : "";
      return `<div class="corr-item">
        <div class="corr-cols">${esc(colA)} ↔ ${esc(colB)}</div>
        <div class="corr-bar-wrap"><div class="corr-bar ${isPos?"positive":"negative"}" style="width:${pct}%"></div></div>
        <div class="corr-val ${isPos?"positive":"negative"}">${r>0?"+":""}${r}</div>
        ${evidence}${scatter}${caveat}
      </div>`;
    }).join("");
    correlations.forEach((c, idx) => {
      if (c.scatter) scheduleChartRender(`corr-scatter-${idx}`, () => renderCorrScatter(`corr-scatter-${idx}`, c));
    });
  } else {
    corrSection.style.display = "none";
    corrMatrix.innerHTML = "";
  }

  // Charts are derived from full-file aggregates computed by the deterministic
  // engine. Older saved analyses without those aggregates retain their legacy
  // AI chart specs as a compatibility fallback.
  const deterministicCharts = buildDeterministicCharts(stats, meta.target);
  const charts = deterministicCharts.length > 0
    ? deterministicCharts
    : (hasAI && analysis.charts) || [];
  if (charts.length > 0 && meta.isTabular) {
    chartsSection.style.display = "";
    chartsGrid.innerHTML = "";
    const shown = charts.slice(0, MAX_CHART_CARDS);
    shown.forEach((spec, idx) => {
      const card = document.createElement("div");
      card.className = "chart-card animate";
      card.style.animationDelay = `${Math.min(idx, 6) * 0.08}s`;
      const canvasId = `chart-${idx}`;
      card.innerHTML = `<div class="chart-card-head"><div class="chart-title">${esc(spec.title)}</div>
        <button class="chart-download" type="button" data-canvas="${canvasId}" data-title="${esc(spec.title)}" aria-label="Download ${esc(spec.title)} as an image">PNG ↓</button></div>
        <div class="chart-reason">${esc(spec.reason)}</div><canvas id="${canvasId}" class="chart-canvas" height="220"></canvas>`;
      chartsGrid.appendChild(card);
      scheduleChartRender(canvasId, () => {
        if (spec.deterministic) renderAggregateChart(canvasId, spec);
        else renderChart(canvasId, spec, chartData, stats);
      });
    });
    // A silent cap would read as "these are all the charts". Say what was
    // held back and where the rest of the computed aggregates live.
    if (charts.length > shown.length) {
      const note = document.createElement("p");
      note.className = "charts-more-note";
      note.textContent = `Showing the first ${shown.length} of ${charts.length} chartable columns. Every column's full aggregate is still computed — open a column under Statistical Summary, or export the JSON.`;
      chartsGrid.appendChild(note);
    }
  } else chartsSection.style.display = "none";

  conclusionText.textContent = hasAI ? analysis.conclusion : "";
  conclusionSection.style.display = hasAI ? "" : "none";
  renderResultNav();
}

function sectionVisible(element) {
  return Boolean(element) && element.style.display !== "none" && !element.hidden;
}

/**
 * Tier ③ holds reference material, so it opens collapsed — but its contents
 * stay named on the collapsed header and reachable in a single click. Nothing
 * in there is ever buried.
 */
function setDataTierOpen(open) {
  if (!tierData) return;
  tierDataBody.hidden = !open;
  tierDataToggle.setAttribute("aria-expanded", String(open));
  tierDataToggle.textContent = open ? "Collapse" : "Expand";
  tierData.classList.toggle("is-open", open);
}

function revealResultSection(id) {
  const element = document.getElementById(id);
  if (!element) return;
  if (tierDataBody?.contains(element)) setDataTierOpen(true);
  element.scrollIntoView({ behavior: "smooth", block: "start" });
}

tierDataToggle?.addEventListener("click", () => setDataTierOpen(tierDataBody.hidden));

tierDataJump?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-tier-jump]");
  if (button) revealResultSection(button.dataset.tierJump);
});

/**
 * A tier band with nothing visible inside it is noise — a text file has no
 * correlations, a keyless run has no interpretation. Hide the whole band, and
 * hide the jump buttons whose sections this file never produced.
 */
function syncTiers() {
  tierDataJump?.querySelectorAll("[data-tier-jump]").forEach((button) => {
    button.hidden = !sectionVisible(document.getElementById(button.dataset.tierJump));
  });
  for (const tier of resultTiers) {
    if (!tier) continue;
    const body = tier.querySelector(".tier-body");
    tier.style.display = [...(body?.children || [])].some(sectionVisible) ? "" : "none";
  }
}

function renderResultNav() {
  syncTiers();
  const sections = [
    ["overviewSection", "Overview"],
    ["evidenceSection", "Evidence"],
    ["qualitySection", "Quality"],
    ["statsSection", "Columns"],
    ["chartsSection", "Charts"],
    ["corrSection", "Relationships"],
    ["askSection", "Ask"],
  ].filter(([id]) => sectionVisible(document.getElementById(id)));
  if (sections.length < 2) {
    resultNav.style.display = "none";
    return;
  }
  resultNav.style.display = "";
  resultNav.innerHTML = sections.map(([id, label], index) => `<a href="#${esc(id)}"${index === 0 ? ` class="active" aria-current="location"` : ""}>${esc(label)}</a>`).join("");
  observeResultSections(sections.map(([id]) => id));
}

// Anchor jumps cannot reach a collapsed tier, so the nav expands it first.
resultNav?.addEventListener("click", (event) => {
  const link = event.target.closest("a[href^='#']");
  if (!link) return;
  const id = link.getAttribute("href").slice(1);
  if (!tierDataBody?.contains(document.getElementById(id))) return;
  event.preventDefault();
  revealResultSection(id);
});

let resultNavObserver = null;

function setActiveResultSection(id) {
  resultNav.querySelectorAll("a").forEach((link) => {
    const active = link.getAttribute("href") === `#${id}`;
    link.classList.toggle("active", active);
    if (active) link.setAttribute("aria-current", "location");
    else link.removeAttribute("aria-current");
  });
}

function observeResultSections(ids) {
  resultNavObserver?.disconnect();
  if (!("IntersectionObserver" in window)) return;
  resultNavObserver = new IntersectionObserver((entries) => {
    const visible = entries
      .filter((entry) => entry.isIntersecting)
      .sort((left, right) => left.boundingClientRect.top - right.boundingClientRect.top)[0];
    if (visible) setActiveResultSection(visible.target.id);
  }, { rootMargin: "-120px 0px -62% 0px", threshold: [0, 0.01] });
  ids.forEach((id) => {
    const section = document.getElementById(id);
    if (section) resultNavObserver.observe(section);
  });
}

resultNav.addEventListener("click", (event) => {
  const link = event.target.closest("a");
  if (link) setActiveResultSection(link.getAttribute("href").slice(1));
});

function renderOverview(data) {
  const { meta = {}, profile, evidence = [], correlations = [] } = data;
  if (!meta.isTabular || !profile) {
    overviewSection.style.display = "none";
    return;
  }

  const issueCount = profile.issues?.length || 0;
  const completeness = Math.max(0, Math.min(100, Number(profile.completeness) || 0));
  const tone = ["A", "B"].includes(profile.healthGrade) ? "good" : profile.healthGrade === "C" ? "fair" : "poor";
  const tile = (label, value, context, visual = "") => `
    <div class="result-overview-metric${visual ? " has-visual" : ""}">
      ${visual}<div class="result-overview-metric-text">
      <span>${esc(label)}</span><strong>${esc(value)}</strong><small>${esc(context)}</small>
      </div>
    </div>`;
  overviewGrid.innerHTML =
    tile("Rows analyzed", (meta.totalRows ?? profile.rows ?? 0).toLocaleString(), "Full dataset")
    + tile("Data health", `${profile.healthGrade || "—"} · ${profile.healthScore ?? "—"}/100`,
        `${issueCount} flagged issue${issueCount === 1 ? "" : "s"}`, healthRingHtml(profile.healthScore, tone))
    + tile("Completeness", `${profile.completeness ?? "—"}%`,
        `${profile.duplicateRows || 0} duplicate row${profile.duplicateRows === 1 ? "" : "s"}`,
        `<span class="overview-meter" aria-hidden="true"><i style="width:${completeness}%"></i></span>`)
    + tile("Evidence", String(evidence.length), `${correlations.length} reported relationship${correlations.length === 1 ? "" : "s"}`);

  const priorityIssue = (profile.issues || []).find((issue) => issue.severity === "high")
    || (profile.issues || []).find((issue) => issue.severity === "medium")
    || (profile.issues || [])[0];
  const priorityEvidence = evidence.find((item) => ["strong", "very strong"].includes(String(item.strength).toLowerCase())) || evidence[0];
  overviewFocus.textContent = priorityIssue
    ? `Review data quality first: ${priorityIssue.message}`
    : priorityEvidence
      ? priorityEvidence.claim
      : "No material quality or evidence flags were found. Review the column profiles for context.";
  overviewSection.style.display = "";
}

/**
 * The health score as a ring, sized to sit inside its overview tile. The score
 * and grade stay in text beside it — the ring adds glanceability, it never
 * replaces the number.
 */
function healthRingHtml(score, tone) {
  const circumference = 97.4; // 2π × r15.5, fixed so the dasharray maths stays in one place
  const clamped = Math.max(0, Math.min(100, Number(score) || 0));
  return `<svg class="health-ring health-ring--${esc(tone)}" viewBox="0 0 36 36" aria-hidden="true">
    <circle class="health-ring-track" cx="18" cy="18" r="15.5"></circle>
    <circle class="health-ring-value" cx="18" cy="18" r="15.5"
      stroke-dasharray="${(clamped / 100 * circumference).toFixed(1)} ${circumference}"></circle>
  </svg>`;
}

function inspectorMetric(label, value, context = "") {
  return `<div class="column-inspector-metric"><span>${esc(label)}</span><strong>${esc(value)}</strong>${context ? `<small>${esc(context)}</small>` : ""}</div>`;
}

function histogramLabel(bin) {
  if (bin.kind === "low-tail") return `< ${bin.end}`;
  if (bin.kind === "high-tail") return `> ${bin.start}`;
  return bin.start === bin.end ? String(bin.start) : `${bin.start}–${bin.end}`;
}

function inspectorBars(items, labelFor, valueFor) {
  const maximum = Math.max(1, ...items.map(valueFor));
  return `<div class="column-inspector-bars">${items.map((item) => {
    const value = valueFor(item);
    const height = Math.max(4, Math.round(value / maximum * 100));
    const label = labelFor(item);
    return `<div class="column-inspector-bar" title="${esc(`${label}: ${value}`)}">
      <span class="column-inspector-bar-value">${esc(value)}</span>
      <span class="column-inspector-bar-track"><span style="height:${height}%"></span></span>
      <small>${esc(label)}</small>
    </div>`;
  }).join("")}</div>`;
}

function renderColumnInspectorVisual(field) {
  if (field.type === "numeric" && field.histogram?.bins?.length) {
    const outliers = field.outliers?.applied
      ? `${field.outliers.count} outside the IQR fences`
      : `Outlier check unavailable${field.outliers?.reason ? `: ${field.outliers.reason}` : ""}`;
    return `<div class="column-inspector-visual-head"><h3>Distribution</h3><p>${esc(outliers)}</p></div>
      ${inspectorBars(field.histogram.bins, histogramLabel, (bin) => bin.count)}`;
  }
  if (field.type === "date" && field.periods?.length) {
    return `<div class="column-inspector-visual-head"><h3>Timeline coverage</h3><p>${esc(field.granularity || "period")} buckets · ${esc(field.trend || "no stable trend")}</p></div>
      ${inspectorBars(field.periods.slice(-16), (period) => period.period, (period) => period.count)}`;
  }
  if (field.top?.length) {
    return `<div class="column-inspector-visual-head"><h3>Most common values</h3><p>Ranked across ${esc(field.validCount ?? field.count ?? 0)} valid rows</p></div>
      <div class="column-inspector-ranks">${field.top.slice(0, 8).map((item) => {
        const width = Math.max(2, Math.min(100, item.percentage || 0));
        return `<div class="column-inspector-rank"><span title="${esc(item.value)}">${esc(item.value)}</span><span class="column-inspector-rank-track"><span style="width:${width}%"></span></span><strong>${esc(item.percentage)}%</strong></div>`;
      }).join("")}</div>`;
  }
  return `<div class="column-inspector-empty">There is not enough valid data to visualize this column.</div>`;
}

function openColumnInspector(column) {
  const current = activeResult();
  const field = current?.stats?.[column];
  if (!field) return;
  const profile = current.profile?.columns?.[column];
  const valid = field.validCount ?? field.count ?? 0;
  const metrics = field.type === "numeric"
    ? [
        ["Mean", field.mean], ["Median", field.median], ["Std. deviation", field.std],
        ["Range", `${field.min} to ${field.max}`],
        ["Middle 50%", field.quantiles ? `${field.quantiles.q1} to ${field.quantiles.q3}` : "—"],
        ["95% mean interval", field.meanConfidence95 ? `${field.meanConfidence95.lower} to ${field.meanConfidence95.upper}` : "Unavailable"],
      ]
    : field.type === "date"
      ? [
          ["Earliest", field.earliest || "—"], ["Latest", field.latest || "—"],
          ["Date range", field.rangeDays == null ? "—" : `${field.rangeDays} days`],
          ["Observed periods", field.periods?.length || 0], ["Trend", field.trend || "—"],
          ["Gaps", field.gaps?.length || 0],
        ]
      : [
          ["Valid rows", valid], ["Unique values", field.unique ?? "—"],
          ["Coverage", `${field.coverage ?? "—"}%`], ["Missing", field.missing ?? 0],
          ["Column role", field.role || field.type], ["Type consistency", profile?.typeConsistency != null ? `${Math.round(profile.typeConsistency * 100)}%` : "—"],
        ];

  columnInspectorTitle.textContent = column;
  // Reading "$48,000" as 48000 changes what the column is; say so where the
  // column is being read, not only in the payload.
  const formats = field.formats?.length ? ` · read through ${field.formats.join(", ")}` : "";
  columnInspectorMeta.textContent = `${field.type} · ${Number(valid).toLocaleString()} valid · ${field.coverage ?? "—"}% coverage${field.invalid ? ` · ${field.invalid} invalid` : ""}${field.missing ? ` · ${field.missing} missing` : ""}${formats}`;
  columnInspectorMetrics.innerHTML = metrics.map(([label, value]) => inspectorMetric(label, value)).join("");
  columnInspectorVisual.innerHTML = renderColumnInspectorVisual(field);
  if (typeof columnInspector.showModal === "function") columnInspector.showModal();
  else columnInspector.setAttribute("open", "");
}

statGrid.addEventListener("click", (event) => {
  const card = event.target.closest("[data-column]");
  if (card) openColumnInspector(card.dataset.column);
});
columnInspectorClose.addEventListener("click", () => columnInspector.close());
columnInspector.addEventListener("click", (event) => {
  if (event.target === columnInspector) columnInspector.close();
});

/**
 * One chart per column the engine computed a full-file aggregate for — a
 * histogram for numeric fields, frequency bars for true categories, a bucketed
 * trend for dates. The target column leads. Columns without a chartable
 * aggregate (identifiers, free text, empty fields) produce nothing: a filler
 * chart would be decoration, not evidence.
 *
 * This used to stop at one chart per kind and three in total, which read as
 * "these three columns matter" when it meant "the renderer stopped".
 */
function buildDeterministicCharts(stats, target) {
  const entries = Object.entries(stats || {});
  if (target && stats?.[target]) {
    entries.sort(([left], [right]) => left === target ? -1 : right === target ? 1 : 0);
  }

  const charts = [];
  for (const [column, field] of entries) {
    if (field.type === "numeric" && field.histogram?.bins?.length) {
      charts.push({
        deterministic: true,
        kind: "histogram",
        title: `${column} distribution`,
        reason: `${field.validCount.toLocaleString()} valid values · ${field.coverage}% coverage · ${field.histogram.method === "iqr-tail-aware" ? "outliers separated from central bins" : "equal-width bins"}`,
        labels: field.histogram.bins.map(histogramLabel),
        values: field.histogram.bins.map(bin => bin.count),
        xLabel: column,
        yLabel: "rows",
      });
    } else if (field.type === "date" && field.periods?.length > 1) {
      charts.push({
        deterministic: true,
        kind: "trend",
        title: `${column} over time`,
        reason: `${field.validCount.toLocaleString()} dated rows · ${field.granularity} buckets · ${field.coverage}% coverage`,
        labels: field.periods.map(period => period.period),
        values: field.periods.map(period => period.count),
        xLabel: column,
        yLabel: "rows",
      });
    } else if (field.type === "categorical" && field.role === "category" && field.top?.length > 1) {
      charts.push({
        deterministic: true,
        kind: "category",
        title: `${column} breakdown`,
        reason: `${field.validCount.toLocaleString()} valid values · top ${field.top.length} of ${field.unique} levels · ${field.coverage}% coverage`,
        labels: field.top.map(item => item.value),
        values: field.top.map(item => item.count),
        xLabel: column,
        yLabel: "rows",
      });
    }
  }
  return charts;
}

function renderAnalysisRecord(meta = {}) {
  const hasRecord = meta.schemaVersion || meta.evidenceEngine || meta.requestId;
  if (!hasRecord) {
    analysisRecord.style.display = "none";
    return;
  }

  const stored = meta.saved ? "Saved by request" : "Not saved";
  const mode = meta.comparisonVersion ? "Deterministic comparison" : (meta.aiIncluded ? "Deterministic + AI" : "Deterministic only");
  const duration = Number.isFinite(meta.processingMs) ? `${meta.processingMs.toLocaleString()} ms` : "Not recorded";
  let generated = "Not recorded";
  if (meta.generatedAt) {
    const parsed = new Date(meta.generatedAt);
    if (Number.isFinite(parsed.getTime())) generated = parsed.toLocaleString();
  }

  analysisRecord.style.display = "";
  analysisRecordSummary.textContent = `${mode} · ${stored.toLowerCase()} · ${duration}`;
  const recordItems = [
    ["Processing mode", mode],
    ["Data retention", stored],
    ...(meta.comparisonVersion ? [["Comparison engine", `v${meta.comparisonVersion}`]] : []),
    ["Evidence engine", meta.evidenceEngine ? `v${meta.evidenceEngine}` : (meta.comparisonVersion ? "Not applicable" : "Legacy analysis")],
    ["Analysis schema", meta.schemaVersion ? `v${meta.schemaVersion}` : "Legacy analysis"],
    ["Completed", generated],
    ["Processing time", duration],
    ["Request ID", meta.requestId || "Not recorded"],
  ];
  analysisRecordGrid.innerHTML = recordItems.map(([label, value]) => `<div class="analysis-record-item"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`).join("");
}

// ─── Follow-up Q&A ────────────────────────────────────────────
// ─── Evidence panel (deterministic) ───────────────────────────
const STRENGTH_STEPS = { "very strong": 4, strong: 3, moderate: 2, weak: 1, negligible: 1 };

/** One four-step scale for every claim, evidence and correlation alike. The
 *  underlying number always sits adjacent to it, never replaced by it. */
function strengthScale(strength) {
  const label = String(strength || "").toLowerCase();
  const steps = STRENGTH_STEPS[label] ?? 1;
  const dots = Array.from({ length: 4 }, (_, index) => `<i${index < steps ? ' class="on"' : ""}></i>`).join("");
  return `<span class="strength" data-strength="${esc(label)}">
    <span class="strength-dots" aria-hidden="true">${dots}</span>
    <span class="strength-label">${esc(strength)}</span>
  </span>`;
}

function evidenceStatisticsText(evidence) {
  const statistics = evidence.statistics;
  if (!statistics) return "";
  if (evidence.metric === "cramers_v") {
    return `χ²(${statistics.degreesFreedom})=${statistics.chiSquare} · Cramér's V=${statistics.cramersV} · p=${formatPValue(statistics.pValue)}`;
  }
  if (evidence.metric === "group_mean_difference" && statistics.welch) {
    const test = statistics.welch;
    return `Cohen's d=${statistics.effectSize} · Welch difference=${test.difference}${test.confidenceInterval ? ` · 95% CI ${test.confidenceInterval.lower} to ${test.confidenceInterval.upper} · p=${formatPValue(test.pValue)}` : " · interval unavailable because both compared groups have zero observed variance"}`;
  }
  if (evidence.metric === "candidate_level_shift") {
    const test = statistics.inference;
    return `Robust effect=${statistics.robustEffect} · median difference=${statistics.medianDifference}${test?.confidenceInterval ? ` · Welch 95% CI ${test.confidenceInterval.lower} to ${test.confidenceInterval.upper} · p=${formatPValue(test.pValue)}` : " · confirmatory interval unavailable"}`;
  }
  return "";
}

/**
 * @param {Array} evidence findings that cleared the reporting thresholds
 * @param {object} [data] the full result, to tell "nothing qualified" apart
 *   from "evidence was never applicable to this file"
 */
function renderEvidence(evidence, data) {
  // A file with no evidence used to make this panel disappear — the headline of
  // tier ①, gone, with nothing said. A reader could not tell "Ridge found
  // nothing worth claiming" from "Ridge broke" or "I uploaded it wrong". A
  // finding that did not qualify is still a result, and it is now reported as
  // one. Non-tabular files stay hidden: evidence was never computed for them,
  // so claiming nothing qualified would describe a test that never ran.
  if (!evidence.length) {
    const tabular = data?.meta?.isTabular;
    evidenceSection.style.display = tabular ? "" : "none";
    if (!tabular) return;
    const rows = data?.meta?.totalRows ?? 0;
    evidenceList.innerHTML = `<div class="evidence-empty">
      <strong>No finding cleared the reporting thresholds.</strong>
      <p>That is a result, not a failure. Ridge states a claim only when the support behind it is
      strong enough to defend — often this means too few rows${rows ? ` (${esc(rows)} here)` : ""},
      no relationship strong enough to report, or no column pair with enough overlap to compare.</p>
      <p>Everything below was still computed in full: column statistics, data quality, and the
      distributions for every field.</p>
    </div>`;
    return;
  }
  evidenceSection.style.display = "";
  evidenceList.innerHTML = evidence.map(e => {
    const provenance = e.provenance;
    const headers = e.columns || [];
    const sourceRows = provenance?.sourceRows || [];
    const exclusions = (provenance?.exclusionReasons || []).map((reason) => `${reason.count} ${reason.reason}`).join(" · ") || "None";
    const statistics = evidenceStatisticsText(e);
    const drilldown = provenance ? `<details class="evidence-provenance">
      <summary>Inspect formula and source rows</summary>
      <div class="evidence-provenance-grid">
        <div><span>Formula</span><strong>${esc(provenance.formula)}</strong></div>
        <div><span>Included</span><strong>${esc(provenance.includedRows)} of ${esc(provenance.inputRows)} rows</strong></div>
        <div><span>Rule</span><strong>${esc(provenance.inclusionRule)}</strong></div>
        <div><span>Excluded</span><strong>${esc(provenance.excludedRows)} rows · ${esc(exclusions)}</strong></div>
      </div>
      ${statistics ? `<div class="evidence-inference">${esc(statistics)}</div>` : ""}
      ${sourceRows.length ? `<div class="evidence-source-note">${esc(provenance.sourceRowsPolicy)}</div>
        <div class="evidence-source-wrap"><table class="evidence-source-table"><thead><tr><th>Row</th>${headers.map((column) => `<th>${esc(column)}</th>`).join("")}</tr></thead><tbody>
          ${sourceRows.map((source) => `<tr><td>${esc(source.rowNumber)}</td>${headers.map((column) => `<td>${esc(source.values?.[column] ?? "—")}</td>`).join("")}</tr>`).join("")}
        </tbody></table></div>` : ""}
    </details>` : "";
    return `<div class="evidence-item">
      <div class="evidence-head">
        ${strengthScale(e.strength)}
        <span class="evidence-claim">${esc(e.claim)}</span>
      </div>
      <div class="evidence-meta">${esc(e.method)} · n=${esc(e.sampleSize)} · ${esc(e.coverage)}% coverage · engine v${esc(e.engineVersion)}</div>
      ${e.caveat ? `<div class="evidence-caveat">Caveat — ${esc(e.caveat)}</div>` : ""}
      ${drilldown}
    </div>`;
  }).join("");
}

// ─── Target column selector ───────────────────────────────────
function renderTargetBar(data) {
  const { meta, columns, stats } = data;
  // Re-running with a target needs a re-runnable source and a tabular file.
  if (!lastSource || !meta?.isTabular || !columns?.length || allFileResults.length > 1) {
    targetBar.style.display = "none";
    return;
  }
  targetBar.style.display = "";
  const numeric = columns.filter(c => stats?.[c]?.type === "numeric");
  const rest    = columns.filter(c => !numeric.includes(c) && c !== "line");
  targetSelect.innerHTML = `<option value="">No target — dataset-wide evidence</option>` +
    numeric.map(c => `<option value="${esc(c)}">${esc(c)} (numeric)</option>`).join("") +
    rest.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join("");
  targetSelect.value = meta.target || "";
}

targetSelect?.addEventListener("change", () => {
  currentTarget = targetSelect.value || null;
  syncSetupState();
});

// ─── Analysis rail ────────────────────────────────────────────
// Setup changes are staged rather than fired on change. Narrowing a wide file
// takes several edits, and none of them should cost a round trip; the user
// decides when the analysis re-runs.

function railResult() {
  return allFileResults.length === 1 ? allFileResults[0] : null;
}

/**
 * After a run the server is the authority on what actually happened — a target
 * it could not honour comes back null. Re-syncing the staged setup to the
 * result keeps "dirty" meaning real divergence rather than stale intent.
 */
function syncSetupToResult(data) {
  if (allFileResults.length > 1) return;
  currentTarget = data?.meta?.target || null;
  const excluded = data?.meta?.excludedColumns || [];
  currentColumns = excluded.length > 0 ? (data.meta.activeColumns || null) : null;
  const structure = data?.meta?.structure || null;
  currentHeaderRow = structure?.headerSource === "specified" ? structure.headerRow : null;
  currentIncludeRows = (structure?.restored || []).map((entry) => entry.row);
}

/** How many individual setup edits separate the rail from these results. */
function pendingChangeCount() {
  const data = railResult();
  if (!data?.meta) return 0;
  const all = data.columns || [];
  let count = (currentTarget || null) !== (data.meta.target || null) ? 1 : 0;
  const applied = new Set(data.meta.activeColumns || all);
  const pending = new Set(currentColumns || all);
  for (const column of all) {
    if (applied.has(column) !== pending.has(column)) count++;
  }
  return count;
}

function renderRail(data) {
  const usable = Boolean(lastSource) && allFileResults.length === 1;
  workspaceRail.hidden = !usable;
  if (!usable) return;

  const { meta, columns, stats } = data;
  railSource.innerHTML = `<strong>${esc(meta.filename || "Analysis")}</strong>` +
    `<span>${meta.totalRows.toLocaleString()} ${meta.isTabular ? "rows" : "lines"}` +
    `${meta.isTabular ? ` · ${meta.columns} columns` : ""}</span>`;

  const tabular = Boolean(meta.isTabular && columns?.length);
  railColumns.style.display = tabular ? "" : "none";
  if (tabular) {
    const included = new Set(currentColumns || columns);
    railColumnList.innerHTML = columns.map((column) => {
      const type = stats?.[column]?.type || "";
      return `<label class="rail-column">
        <input type="checkbox" data-column-toggle="${esc(column)}"${included.has(column) ? " checked" : ""} />
        <span class="rail-column-name">${esc(column)}</span>
        ${type ? `<span class="rail-column-type">${esc(type)}</span>` : ""}
      </label>`;
    }).join("");
  }
  syncSetupState();
}

/**
 * Stale results get three simultaneous signals — button, banner and a rule on
 * the canvas. None of them reduce contrast: degrading legibility to convey
 * state would fail exactly the readers most likely to misread it.
 */
function syncSetupState() {
  const data = railResult();
  const all = data?.columns || [];
  const included = currentColumns || all;
  railColumnsCount.textContent = all.length ? `${included.length} of ${all.length} columns included` : "";

  const changes = pendingChangeCount();
  const dirty = changes > 0;
  rerunBtn.classList.toggle("is-dirty", dirty);
  rerunBtn.textContent = dirty ? `Re-run · ${changes} change${changes === 1 ? "" : "s"}` : "Re-run analysis";
  rerunHint.textContent = dirty
    ? "These results were computed with the previous setup."
    : "Setup matches these results.";

  workspaceCanvas.classList.toggle("is-stale", dirty);
  staleBanner.hidden = !dirty;
  if (dirty) {
    const appliedCount = (data?.meta?.activeColumns || all).length;
    staleBanner.textContent = all.length
      ? `Showing results computed from ${appliedCount} of ${all.length} columns. Your setup has changed — re-run to update.`
      : "Your setup has changed — re-run to update these results.";
  }
}

function structureRowLine(entry) {
  const cells  = (entry.cells || []).join(" | ");
  const action = entry.reason !== "aggregate" ? ""
    : entry.restoredBy
      ? `<button type="button" class="structure-fix" data-structure-exclude="${esc(entry.row)}">Exclude again</button>`
      : `<button type="button" class="structure-fix" data-structure-include="${esc(entry.row)}">Put back</button>`;
  return `<li><strong>Row ${esc(entry.row)}</strong> — ${esc(entry.reason)}${
    entry.confidence ? ` · ${esc(entry.confidence)}` : ""}${
    entry.detail ? `: ${esc(entry.detail)}` : ""}${action}${
    cells ? `<br><code>${esc(cells)}</code>` : ""}</li>`;
}

/**
 * What the file's shape was taken to be, stated above every number that depends
 * on it, and left correctable.
 *
 * A missing `structure` is an analysis saved before inference existed. That is
 * unknown, not "nothing was set aside" — so the note stays hidden rather than
 * claiming a clean read the engine of the day never performed.
 */
function renderStructureNote(data) {
  const structure = data?.meta?.structure;
  // An analysis saved before inference existed has nothing to report. That is
  // unknown, not a clean read, so the note stays hidden rather than confirming
  // something the engine of the day never checked.
  const worthShowing = Boolean(structure);
  structureNote.hidden = !worthShowing;
  if (!worthShowing) return;

  const excluded     = structure.excluded || [];
  const restored     = structure.restored || [];
  const unapplied    = structure.unapplied || [];
  const alternatives = structure.alternatives || [];
  const warnings     = structure.warnings || [];
  const uncertain    = structure.confidence === "uncertain";
  const specified    = structure.headerSource === "specified";
  const clean        = structure.confidence === "none";

  structureNote.classList.toggle("structure-note--uncertain", uncertain);
  structureNote.classList.toggle("structure-note--clean", clean);

  // A clean read still gets said. Hiding it made a checked file and an
  // unchecked one look identical, so the one piece of information the reader
  // needed — that the question was asked at all — was the one never given.
  if (clean) {
    structureSummary.textContent =
      `Read as-is · header on row ${structure.headerRow} · ${structure.observations} observation${structure.observations === 1 ? "" : "s"}`;
    structureDetail.innerHTML =
      `<p>Every row below the header was read as an observation. Ridge found no title block above the header, no total or subtotal rows, and no second table sharing the sheet.</p>`;
    return;
  }

  const counts = [];
  if (structure.headerRow) counts.push(`Header on row ${structure.headerRow}`);
  counts.push(`${structure.observations} observation${structure.observations === 1 ? "" : "s"}`);
  if (excluded.length > 0) counts.push(`${excluded.length} row${excluded.length === 1 ? "" : "s"} excluded`);
  if (restored.length > 0) counts.push(`${restored.length} put back`);
  if (unapplied.length > 0) counts.push(`${unapplied.length} correction${unapplied.length === 1 ? "" : "s"} not applied`);
  if (warnings.some((warning) => warning.kind === "possible-transpose")) counts.push("possibly transposed");
  structureSummary.textContent = `${uncertain ? "Check how this file was read — " : ""}${counts.join(" · ")}`;

  structureDetail.innerHTML = `
    ${uncertain ? `<p class="structure-warning">Ridge could not settle this from the file alone. Confirm it before relying on the numbers below.</p>` : ""}
    ${warnings.map((warning) => `<p class="structure-warning">${esc(warning.detail)}</p>`).join("")}
    ${excluded.length > 0 ? `<p>Left out of every statistic below:</p><ul>${excluded.map(structureRowLine).join("")}</ul>` : ""}
    ${restored.length > 0 ? `<p>Put back at your request:</p><ul>${restored.map(structureRowLine).join("")}</ul>` : ""}
    ${unapplied.length > 0 ? `<p>Asked for, but could not be applied:</p><ul>${unapplied.map((entry) =>
      `<li><strong>Row ${esc(entry.row)}</strong> — ${esc(entry.reason)}</li>`).join("")}</ul>` : ""}
    ${alternatives.length > 0 ? `<p>The header might instead be:</p><ul>${alternatives.map((alt) =>
      `<li>Row ${esc(alt.headerRow)} — <code>${esc((alt.cells || []).join(" | "))}</code>
        <button type="button" class="structure-fix" data-structure-header="${esc(alt.headerRow)}">Use this row</button></li>`).join("")}</ul>` : ""}
    ${specified ? `<p>You chose this header row.<button type="button" class="structure-fix" data-structure-header="auto">Detect it again</button></p>` : ""}`;
}

// A correction re-submits the file rather than editing the result: the file
// never left this tab, and re-reading it is the only way the numbers can change
// honestly.
structureDetail?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-structure-include],[data-structure-exclude],[data-structure-header]");
  if (!button) return;
  const { structureInclude, structureExclude, structureHeader } = button.dataset;
  if (structureInclude) {
    const row = Number.parseInt(structureInclude, 10);
    if (!currentIncludeRows.includes(row)) currentIncludeRows.push(row);
  } else if (structureExclude) {
    const row = Number.parseInt(structureExclude, 10);
    currentIncludeRows = currentIncludeRows.filter((value) => value !== row);
  } else if (structureHeader) {
    currentHeaderRow = structureHeader === "auto" ? null : Number.parseInt(structureHeader, 10);
    // A different header row means different data rows; row numbers chosen
    // against the old reading no longer point at the same things.
    currentIncludeRows = [];
  }
  rerunAnalysis();
});

/** An exclusion changes what every number was computed over, so it is stated
 *  with the findings rather than left for the record to reveal. */
function renderExclusionNote(data) {
  const excluded = data?.meta?.excludedColumns || [];
  const all = data?.columns || [];
  exclusionNote.hidden = excluded.length === 0;
  if (excluded.length === 0) return;
  exclusionSummary.textContent = `Computed from ${all.length - excluded.length} of ${all.length} columns`;
  exclusionList.innerHTML = `<p>Excluded from every statistic below:</p><ul>${
    excluded.map((column) => `<li>${esc(column)}</li>`).join("")}</ul>`;
}

railColumnList?.addEventListener("change", (event) => {
  const input = event.target.closest("[data-column-toggle]");
  if (!input) return;
  const all = railResult()?.columns || [];
  const included = new Set(currentColumns || all);
  if (input.checked) included.add(input.dataset.columnToggle);
  else included.delete(input.dataset.columnToggle);
  if (included.size === 0) {
    // Analyzing nothing is not a state the user can be left in.
    input.checked = true;
    return;
  }
  currentColumns = all.filter((column) => included.has(column));
  syncSetupState();
});

railColumnsReset?.addEventListener("click", () => {
  currentColumns = null;
  const data = railResult();
  if (data) renderRail(data);
});

railToggle?.addEventListener("click", () => {
  const open = workspaceRail.classList.toggle("is-open");
  railToggle.setAttribute("aria-expanded", String(open));
  railToggle.textContent = open ? "Hide" : "Show";
});

function rerunAnalysis() {
  if (!lastSource) return;
  if (lastSource.kind === "url") runUrlAnalysis(lastSheet);
  else runAnalysis(lastSheet);
}

rerunBtn?.addEventListener("click", rerunAnalysis);

// ─── Exports ──────────────────────────────────────────────────
function activeResult() {
  return currentComparison || allFileResults[activeTabIdx] || allFileResults[0] || null;
}

function exportBaseName() {
  const name = activeResult()?.meta?.filename || "analysis";
  return name.replace(/\.[^.]+$/, "").replace(/[^\w-]+/g, "_").slice(0, 60) || "analysis";
}

exportJsonBtn?.addEventListener("click", () => {
  const current = activeResult();
  if (!current) return;
  const payload = { exportedAt: new Date().toISOString(), ...current };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${exportBaseName()}-analysis.json`;
  link.click();
  URL.revokeObjectURL(link.href);
});

exportReportBtn?.addEventListener("click", () => {
  const current = activeResult();
  if (!current || current.error) return;
  const win = window.open("", "_blank");
  if (!win) { alert("Allow pop-ups to export the printable report."); return; }
  win.document.write(buildReportHtml(current));
  win.document.close();
});

function buildReportHtml(data) {
  if (data.kind === "comparison") return buildComparisonReportHtml(data);
  const { meta = {}, stats = {}, correlations = [], evidence = [], profile, analysis } = data;
  const statRows = Object.entries(stats).map(([col, s]) => {
    const detail = s.type === "numeric"
      ? `mean ${s.mean} · median ${s.median} · min ${s.min} · max ${s.max} · std ${s.std} · ${s.coverage}% coverage${s.invalid ? ` · ${s.invalid} invalid` : ""}${s.formats?.length ? ` · read through ${s.formats.join(", ")}` : ""}`
      : s.type === "date"
        ? `${s.earliest || "—"} → ${s.latest || "—"} · ${s.validCount} valid${s.trend ? ` · trend ${s.trend}` : ""}`
        : `${s.unique} unique · top: ${(s.top || []).slice(0, 3).map(t => `${t.value} (${t.percentage}%)`).join(", ")}`;
    return `<tr><td>${esc(col)}</td><td>${esc(s.type)}</td><td>${esc(s.missing ?? 0)}</td><td>${esc(detail)}</td></tr>`;
  }).join("");
  const evidenceRows = evidence.map(e => `
    <div class="ev"><strong>[${esc(e.strength)}]</strong> ${esc(e.claim)}
      <div class="muted">${esc(e.method)} · n=${esc(e.sampleSize)} · ${esc(e.coverage)}% coverage</div>
      ${evidenceStatisticsText(e) ? `<div class="muted">Inference: ${esc(evidenceStatisticsText(e))}</div>` : ""}
      ${e.provenance ? `<div class="muted">Formula: ${esc(e.provenance.formula)} · included ${esc(e.provenance.includedRows)}/${esc(e.provenance.inputRows)} rows · source rows ${esc(e.provenance.sourceRows.map((row) => row.rowNumber).join(", ") || "none")}</div>` : ""}
      ${e.caveat ? `<div class="muted">Caveat — ${esc(e.caveat)}</div>` : ""}</div>`).join("") || `<p class="muted">None met the reporting thresholds.</p>`;
  const corrRows = correlations.map(c =>
    `<tr><td>${esc(c.columnA ?? c.colA)} ↔ ${esc(c.columnB ?? c.colB)}</td><td>${esc(c.coefficient ?? c.r)}</td><td>${esc(c.method || "pearson")}</td><td>${esc(c.n ?? "—")}</td><td>${esc(c.coverage ?? "—")}%</td></tr>`).join("");
  const issues = (profile?.issues || []).map(i => `<li>[${esc(i.severity)}] ${esc(i.message)}</li>`).join("");
  // How the file was read qualifies every number in this report, so it is
  // printed before them. Absent on analyses saved before inference existed —
  // in which case the report says nothing rather than implying a clean read.
  const structure = meta.structure;
  const structureRows = structure
    ? [
        ...[...(structure.excluded || []), ...(structure.restored || [])].map(entry =>
          `<li>Row ${esc(entry.row)} — ${esc(entry.reason)}${entry.restoredBy ? " (put back on request)" : ""}${
            entry.confidence ? ` · ${esc(entry.confidence)}` : ""}${entry.detail ? `: ${esc(entry.detail)}` : ""}</li>`),
        ...(structure.unapplied || []).map(entry =>
          `<li>Row ${esc(entry.row)} — requested, not applied: ${esc(entry.reason)}</li>`),
        ...(structure.warnings || []).map(warning =>
          `<li>Shape warning — ${esc(warning.detail)}</li>`),
      ].join("")
    : "";
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Analysis report — ${esc(meta.filename || "dataset")}</title>
  <style>
    body { font-family: Georgia, serif; max-width: 800px; margin: 32px auto; padding: 0 24px; color: #1a1916; line-height: 1.55; }
    h1 { font-size: 22px; margin-bottom: 2px; } h2 { font-size: 15px; margin: 26px 0 8px; border-bottom: 1px solid #ddd; padding-bottom: 3px; }
    table { border-collapse: collapse; width: 100%; font-size: 12px; } td, th { border: 1px solid #ddd; padding: 5px 8px; text-align: left; vertical-align: top; }
    .muted { color: #6b6960; font-size: 11.5px; } .ev { margin-bottom: 10px; font-size: 13px; }
    .meta { color: #6b6960; font-size: 12px; margin-bottom: 4px; }
    .badge { display: inline-block; border: 1px solid #ccc; border-radius: 4px; padding: 0 6px; font-size: 10.5px; color: #6b6960; margin-left: 6px; }
    .noprint { margin: 18px 0; } @media print { .noprint { display: none; } }
    h2.written { border-left: 4px solid #1a1916; padding-left: 10px; border-bottom: 0; }
  </style></head><body>
  <h1>Analysis report — ${esc(meta.filename || "dataset")}</h1>
  <div class="meta">${esc(meta.totalRows ?? "—")} rows · ${esc(meta.columns ?? "—")} columns${meta.target ? ` · target: ${esc(meta.target)}` : ""} · analysis schema v${esc(meta.schemaVersion || "—")} · evidence engine v${esc(meta.evidenceEngine || "—")}</div>
  <div class="noprint"><button onclick="window.print()">Print or save as PDF</button></div>
  ${structure ? `<h2>How this file was read <span class="badge">Computed</span></h2>
  <p>Header on row ${esc(structure.headerRow ?? "—")}${structure.headerSource === "specified" ? " (you specified this)" : ""} · ${esc(structure.observations ?? "—")} observations analyzed${structure.confidence === "uncertain" ? " · <strong>this reading was not certain</strong>" : ""}</p>
  ${structureRows ? `<ul class="muted">${structureRows}</ul>` : `<p class="muted">No rows were set aside.</p>`}` : ""}
  <h2>Evidence <span class="badge">Derived</span></h2>${evidenceRows}
  ${profile ? `<h2>Data quality <span class="badge">Derived</span></h2>
  <p>Health ${esc(profile.healthGrade)} (${esc(profile.healthScore)}/100) · completeness ${esc(profile.completeness)}% · ${esc(profile.duplicateRows)} duplicate rows</p>
  ${issues ? `<ul class="muted">${issues}</ul>` : ""}` : ""}
  <h2>Column statistics <span class="badge">Computed</span></h2>
  <table><tr><th>Column</th><th>Type</th><th>Missing</th><th>Detail</th></tr>${statRows}</table>
  ${corrRows ? `<h2>Correlations <span class="badge">Derived</span></h2>
  <table><tr><th>Pair</th><th>Coefficient</th><th>Method</th><th>n</th><th>Coverage</th></tr>${corrRows}</table>` : ""}
  ${analysis ? `<h2 class="written">Interpretation <span class="badge">Written</span></h2>
  <p>${esc(analysis.summary || "")}</p>
  ${(analysis.insights || []).map(i => `<div class="ev"><strong>${esc(i.title)}</strong><div>${esc(i.detail)}</div></div>`).join("")}
  <p>${esc(analysis.conclusion || "")}</p>` : `<h2>AI interpretation</h2><p class="muted">Not included — this analysis ran deterministically without an API key.</p>`}
  <p class="muted">Generated ${new Date().toISOString().slice(0, 10)}. <b>Computed</b> is measured from the file; <b>Derived</b> is calculated from those measurements; <b>Written</b> is model prose quoting them. No number in this report was produced by a model.</p>
  </body></html>`;
}

function buildComparisonReportHtml(data) {
  const { comparison = {}, meta = {} } = data;
  const summary = comparison.summary || {};
  const schema = comparison.schema || {};
  const findings = (comparison.findings || []).map((finding) => `<li><strong>${esc(finding.title)}</strong> — ${esc(finding.detail)}</li>`).join("");
  const rows = (comparison.columns || []).map((column) => `<tr><td>${esc(column.column)}</td><td>${esc(column.type)}</td><td>${esc(comparisonColumnValue(column.baseline, column.type))}</td><td>${esc(comparisonColumnValue(column.current, column.type))}</td><td>${esc(comparisonColumnChange(column))}</td></tr>`).join("");
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Comparison report</title><style>
    body { font-family: Georgia, serif; max-width: 900px; margin: 32px auto; padding: 0 24px; color: #1a1916; line-height: 1.55; }
    h1 { font-size: 22px; } h2 { font-size: 15px; margin: 26px 0 8px; border-bottom: 1px solid #ddd; padding-bottom: 3px; }
    table { border-collapse: collapse; width: 100%; font-size: 12px; } td, th { border: 1px solid #ddd; padding: 6px 8px; text-align: left; vertical-align: top; }
    .meta { color: #6b6960; font-size: 12px; } .noprint { margin: 18px 0; } @media print { .noprint { display: none; } }
  </style></head><body>
  <h1>${esc(comparison.labels?.baseline || "Baseline")} → ${esc(comparison.labels?.current || "Current")}</h1>
  <p class="meta">Deterministic comparison v${esc(comparison.version || "—")} · analysis schema v${esc(meta.schemaVersion || "—")} · request ${esc(meta.requestId || "—")}</p>
  <div class="noprint"><button onclick="window.print()">Print or save as PDF</button></div>
  <h2>Overview</h2><p>Rows: ${esc(summary.baselineRows ?? 0)} → ${esc(summary.currentRows ?? 0)} (${esc(signed(summary.rowDelta))}). Columns: ${esc(summary.baselineColumns ?? 0)} → ${esc(summary.currentColumns ?? 0)} (${esc(signed(summary.columnDelta))}). Health score change: ${esc(signed(summary.healthScoreDelta, " points"))}. Completeness change: ${esc(signed(summary.completenessDelta, " points"))}.</p>
  <h2>Schema</h2><p>Added: ${esc((schema.added || []).join(", ") || "none")}. Removed: ${esc((schema.removed || []).join(", ") || "none")}. Type changes: ${esc((schema.typeChanges || []).map((change) => `${change.column}: ${change.baseline} to ${change.current}`).join("; ") || "none")}.</p>
  <h2>Material changes</h2><ul>${findings}</ul>
  <h2>Shared column deltas</h2><table><tr><th>Column</th><th>Type</th><th>Baseline</th><th>Current</th><th>Change</th></tr>${rows || `<tr><td colspan="5">No directly comparable shared columns.</td></tr>`}</table>
  <p class="meta">Generated ${new Date().toISOString().slice(0, 10)}. All numeric values in this report were computed deterministically.</p>
  </body></html>`;
}

// ─── Try sample data ──────────────────────────────────────────
sampleBtn?.addEventListener("click", async () => {
  try {
    sampleBtn.disabled = true;
    const res = await fetch("/samples/team-sales.csv");
    if (!res.ok) throw new Error("Sample data is unavailable right now.");
    const blob = await res.blob();
    selectedFiles = [new File([blob], "team-sales-sample.csv", { type: "text/csv" })];
    renderFileList();
    currentTarget = null;
    currentColumns = null;
    currentHeaderRow = null;
    currentIncludeRows = [];
    runAnalysis();
  } catch (err) {
    showError(err.message);
  } finally {
    sampleBtn.disabled = false;
  }
});

const startupParams = new URLSearchParams(location.search);
if (!sharedId && startupParams.get("sample") === "1") {
  settingsReady.finally(() => sampleBtn.click());
}


const askSection = document.getElementById("askSection");
const askThread  = document.getElementById("askThread");
const askInput   = document.getElementById("askInput");
const askBtn     = document.getElementById("askBtn");
let askQA   = [];
let askData = null;

function resetAsk(data, visible) {
  askQA = [];
  askData = data;
  askThread.innerHTML = "";
  askInput.value = "";
  askSection.style.display = visible ? "" : "none";
}

function renderAskThread(pendingQ, errorMsg) {
  const items = askQA.map(p => `
    <div class="ask-item">
      <div class="ask-q">${esc(p.q)}</div>
      <div class="ask-a">${esc(p.a)}</div>
    </div>`);
  if (pendingQ) {
    items.push(`
    <div class="ask-item">
      <div class="ask-q">${esc(pendingQ)}</div>
      <div class="ask-a ${errorMsg ? "error" : "pending"}">${esc(errorMsg || "Thinking…")}</div>
    </div>`);
  }
  askThread.innerHTML = items.join("");
}

async function submitAsk() {
  const question = askInput.value.trim();
  if (!question || !askData) return;
  if (keyMissing()) {
    settingsPanel.style.display = "";
    renderAskThread(question, "Follow-up questions need an Anthropic API key — add yours in AI settings. It is sent only with your requests and never stored on the server.");
    return;
  }
  askBtn.disabled = true;
  askInput.value = "";
  renderAskThread(question);

  try {
    const response = await fetch("/api/ask", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-ridge-session": getSessionId(),
        ...(getApiKey() ? { "x-anthropic-key": getApiKey() } : {}),
      },
      body: JSON.stringify({
        question,
        model: getModel() || modelSelect.value || "",
        priorQA: askQA.slice(-6),
        context: {
          filename: askData.meta?.filename,
          columns: askData.columns || [],
          stats: askData.stats || {},
          correlations: askData.correlations || [],
          profile: askData.profile || null,
          sampleRows: (askData.chartData || []).slice(0, 20),
          rawText: askData.rawText || undefined,
        },
      }),
    });
    const data = await response.json()
      .catch(() => ({ error: `The server returned an unexpected response (HTTP ${response.status}).` }));
    if (!response.ok) throw new Error(apiErrorMessage(data, "Could not answer that."));
    askQA.push({ q: question, a: data.answer });
    renderAskThread();
  } catch (err) {
    renderAskThread(question, err.message);
  } finally {
    askBtn.disabled = false;
  }
}

askBtn.addEventListener("click", submitAsk);

// ─── Explain with Claude (adds AI to a keyless analysis) ─────────
explainBtn?.addEventListener("click", async () => {
  if (keyMissing()) { settingsPanel.style.display = ""; return; }
  const current = allFileResults[activeTabIdx] || allFileResults[0];
  if (!current || current.error) return;
  explainBtn.disabled = true;
  explainBtn.textContent = "Explaining…";
  try {
    const response = await fetch("/api/explain", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-ridge-session": getSessionId(),
        "x-anthropic-key": getApiKey(),
      },
      body: JSON.stringify({
        model: getModel() || modelSelect.value || "",
        question: questionInput.value.trim(),
        context: {
          filename: current.meta?.filename,
          fileType: current.meta?.fileType,
          columns: current.columns || [],
          stats: current.stats || {},
          correlations: current.correlations || [],
          evidence: current.evidence || [],
          profile: current.profile || null,
          sampleRows: (current.chartData || []).slice(0, 20),
          rawText: current.rawText || undefined,
        },
      }),
    });
    const data = await response.json().catch(() => ({ error: "Unexpected response." }));
    if (!response.ok) throw new Error(apiErrorMessage(data, "Explanation failed."));
    current.analysis = data.analysis;
    if (current.meta) current.meta.aiIncluded = true;
    renderSingleFile(current, allFileResults.length > 1);
  } catch (err) {
    explainSub.textContent = err.message;
  } finally {
    explainBtn.disabled = false;
    explainBtn.textContent = "Explain with Claude →";
  }
});
askInput.addEventListener("keydown", (e) => { if (e.key === "Enter") submitAsk(); });

// ─── Data quality card ────────────────────────────────────────
function renderQuality(data) {
  const profile = data?.profile;
  if (!profile) { qualitySection.style.display = "none"; return; }
  qualitySection.style.display = "";

  const tone = ["A", "B"].includes(profile.healthGrade) ? "good" : profile.healthGrade === "C" ? "fair" : "poor";
  qualityGrade.className = `quality-grade ${tone}`;
  qualityGrade.textContent = `${profile.healthGrade} · ${profile.healthScore}/100`;
  qualityMeta.textContent = `${profile.completeness}% complete · ${profile.duplicateRows} duplicate rows`;

  qualityIssues.innerHTML = profile.issues.length === 0
    ? `<div class="quality-clean">✓ No quality issues detected</div>`
    : profile.issues.map(i => `
      <div class="quality-issue ${esc(i.severity)}">
        <span class="dot"></span><span>${esc(i.message)}</span>
      </div>`).join("");

  // Each column's completeness, drawn instead of abbreviated. Valid, missing
  // and unparseable are states, so they wear the status colours — and the
  // counts ride along in text and on hover, so colour never stands alone.
  qualityColumns.innerHTML = Object.entries(profile.columns).map(([name, c]) => {
    const field = data?.stats?.[name];
    const rows = profile.rows ?? data?.meta?.totalRows ?? 0;
    const valid = field?.validCount ?? Math.max(0, Math.round((100 - c.missingPct) / 100 * rows));
    const invalid = field?.invalid ?? 0;
    const missing = field?.missing ?? Math.max(0, rows - valid - invalid);
    const total = Math.max(1, valid + missing + invalid);
    const pct = (n) => +(n / total * 100).toFixed(2);
    const detail = `${name}: ${valid.toLocaleString()} valid · ${missing.toLocaleString()} missing${invalid ? ` · ${invalid.toLocaleString()} unparseable` : ""} of ${total.toLocaleString()} rows`;
    return `<div class="quality-col" title="${esc(detail)}">
      <span class="quality-col-name">${esc(name)}</span>
      <span class="quality-col-info">${esc(c.type)}</span>
      <span class="quality-col-track" role="img" aria-label="${esc(detail)}">
        <i class="q-valid" style="width:${pct(valid)}%"></i><i class="q-missing" style="width:${pct(missing)}%"></i><i class="q-invalid" style="width:${pct(invalid)}%"></i>
      </span>
      <span class="quality-col-pct">${esc(Math.round(pct(valid)))}%</span>
    </div>`;
  }).join("");
}

// ─── Chart rendering ──────────────────────────────────────────
// A chart is built the first time its canvas approaches the viewport, not when
// the dashboard renders. Tier ③ arrives collapsed, so a wide file's dozen
// histograms cost nothing until someone actually opens them.
let chartObserver = null;
const pendingCharts = new Map();

function resetPendingCharts() {
  chartObserver?.disconnect();
  chartObserver = null;
  pendingCharts.clear();
}

function scheduleChartRender(canvasId, render) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  if (!("IntersectionObserver" in window)) { render(); return; }
  if (!chartObserver) {
    chartObserver = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const draw = pendingCharts.get(entry.target.id);
        pendingCharts.delete(entry.target.id);
        chartObserver.unobserve(entry.target);
        if (draw) draw();
      }
    }, { rootMargin: "160px 0px" });
  }
  pendingCharts.set(canvasId, render);
  chartObserver.observe(canvas);
}

// Charts take their colours from the same tokens as everything else, read at
// render time so a palette edit in :root cannot leave the charts behind — the
// drift that left them wearing the pre-Ridge palette.
function chartTheme() {
  const styles = getComputedStyle(document.documentElement);
  const token = (name, fallback) => (styles.getPropertyValue(name) || "").trim() || fallback;
  return {
    accent:  token("--accent", "#315ee7"),
    grid:    token("--border", "#e0e3e8"),
    label:   token("--text-3", "#636b78"),
    surface: token("--surface", "#ffffff"),
    // Fixed categorical order for the legacy AI-spec fallback charts.
    series: [
      token("--accent", "#315ee7"), token("--green", "#177245"),
      token("--amber", "#a1500b"), token("--red", "#b91c1c"),
      token("--purple", "#7c3aed"), token("--teal", "#0e7490"),
    ],
  };
}

function renderAggregateChart(canvasId, spec) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const theme = chartTheme();
  const isTrend = spec.kind === "trend";
  const cfg = {
    type: isTrend ? "line" : "bar",
    data: {
      labels: spec.labels,
      datasets: [{
        data: spec.values,
        borderColor: theme.accent,
        backgroundColor: isTrend ? `${theme.accent}11` : `${theme.accent}22`,
        borderWidth: isTrend ? 2 : 1.5,
        borderRadius: isTrend ? 0 : 4,
        pointRadius: isTrend ? 3 : 0,
        fill: isTrend,
        tension: isTrend ? 0.25 : 0,
      }],
    },
    options: chartOptions(spec.xLabel, spec.yLabel),
  };
  chartInstances.push(new Chart(canvas.getContext("2d"), cfg));
}

/** Strips drawn before the panel stops and says so. */
const MAX_SPREAD_STRIPS = 12;

/**
 * Every numeric column's five-number summary as a strip: a thin line from the
 * 5th to the 95th percentile, a box across the middle 50%, a tick at the
 * median and a dot at the mean. Each strip is scaled to its own min–max —
 * the panel compares shapes, not magnitudes, and says so. Every value drawn
 * is already in the payload; nothing here is computed in the browser.
 */
function buildSpreadStripsHtml(stats) {
  const numeric = Object.entries(stats || {}).filter(([, field]) =>
    field.type === "numeric" && field.quantiles && Number.isFinite(field.min) && Number.isFinite(field.max));
  if (numeric.length < 2) return "";

  const shown = numeric.slice(0, MAX_SPREAD_STRIPS);
  const rows = shown.map(([column, field]) => {
    const { min, max, mean, median, quantiles: q, outliers } = field;
    if (max === min) {
      return `<div class="spread-row"><span class="spread-name">${esc(column)}</span>
        <span class="spread-constant">constant at ${esc(min)}</span></div>`;
    }
    const pos = (value) => Math.max(0, Math.min(100, (value - min) / (max - min) * 100));
    const outlierNote = outliers?.applied && outliers.count > 0
      ? `<span class="spread-outliers">${esc(outliers.count)} outside fences</span>` : "";
    const detail = `${column}: min ${min} · p05 ${q.p05} · q1 ${q.q1} · median ${median} · q3 ${q.q3} · p95 ${q.p95} · max ${max} · mean ${mean}`;
    return `<div class="spread-row" title="${esc(detail)}">
      <span class="spread-name">${esc(column)}</span>
      <span class="spread-end">${esc(min)}</span>
      <span class="spread-track" role="img" aria-label="${esc(detail)}">
        <i class="spread-range" style="left:${pos(q.p05)}%;width:${Math.max(0.5, pos(q.p95) - pos(q.p05))}%"></i>
        <i class="spread-box" style="left:${pos(q.q1)}%;width:${Math.max(0.75, pos(q.q3) - pos(q.q1))}%"></i>
        <i class="spread-median" style="left:${pos(median)}%"></i>
        <i class="spread-mean" style="left:${pos(mean)}%"></i>
      </span>
      <span class="spread-end">${esc(max)}</span>
      ${outlierNote}
    </div>`;
  }).join("");

  const capNote = numeric.length > shown.length
    ? `<p class="spread-note">Showing the first ${shown.length} of ${numeric.length} numeric columns — the rest keep their full profiles below.</p>` : "";
  return `<div class="spread-head">
      <h3>Numeric spread</h3>
      <p>box = middle 50% · line = 5th–95th percentile · <i class="spread-key-median"></i> median · <i class="spread-key-mean"></i> mean · each strip on its own scale</p>
    </div>${rows}${capNote}`;
}

/** Cells per side before the matrix stops and says so. */
const MAX_MATRIX_COLUMNS = 8;

/**
 * Every numeric column against every other, as one glanceable grid. Reported
 * coefficients tint their cell — blue rising together, red moving apart,
 * deeper meaning stronger — with the number printed in every tinted cell so
 * colour never carries the value alone. A pair the engine did not report is a
 * dot, not a zero: "below the reporting bar" and "measured as none" are
 * different statements.
 */
function buildCorrMatrixHtml(stats, correlations) {
  const numeric = Object.entries(stats || {})
    .filter(([, field]) => field.type === "numeric")
    .map(([column]) => column);
  if (numeric.length < 3) return "";

  const shown = numeric.slice(0, MAX_MATRIX_COLUMNS);
  const byPair = new Map();
  for (const c of correlations) {
    const a = c.columnA ?? c.colA;
    const b = c.columnB ?? c.colB;
    byPair.set(`${a} ${b}`, c);
    byPair.set(`${b} ${a}`, c);
  }

  const theme = chartTheme();
  const alphaHex = (r) => Math.round(Math.abs(r) * 0.45 * 255).toString(16).padStart(2, "0");
  const body = shown.map((rowCol) => {
    const cells = shown.map((colCol) => {
      if (rowCol === colCol) return `<td class="corr-matrix-diag" aria-hidden="true"></td>`;
      const pair = byPair.get(`${rowCol} ${colCol}`);
      if (!pair) {
        return `<td class="corr-matrix-none" title="${esc(`${rowCol} ↔ ${colCol}: not reported — below the |0.3| bar or too few complete pairs`)}">·</td>`;
      }
      const r = pair.coefficient ?? pair.r;
      const tint = r >= 0 ? theme.accent : theme.series[3];
      const title = `${rowCol} ↔ ${colCol}: ${r > 0 ? "+" : ""}${r} (${pair.method || "pearson"}, n=${pair.n ?? "—"})`;
      return `<td class="corr-matrix-cell" style="background:${tint}${alphaHex(r)}" title="${esc(title)}">${r > 0 ? "+" : ""}${esc(r)}</td>`;
    }).join("");
    return `<tr><th scope="row">${esc(rowCol)}</th>${cells}</tr>`;
  }).join("");

  const capNote = numeric.length > shown.length
    ? `<p class="corr-matrix-note">Showing the first ${shown.length} of ${numeric.length} numeric columns. Every reported pair is still listed below.</p>`
    : "";
  return `<div class="corr-matrix-head"><h3>Correlation matrix</h3><p>Blue rise together · red move apart · a dot is a pair below the reporting bar, not a zero</p></div>
    <div class="corr-matrix-wrap"><table class="corr-matrix-table">
      <thead><tr><td></td>${shown.map((column) => `<th scope="col"><span>${esc(column)}</span></th>`).join("")}</tr></thead>
      <tbody>${body}</tbody>
    </table></div>${capNote}`;
}

/**
 * The pairing behind a reported correlation, drawn as the server shipped it:
 * every pair verbatim when small, a density grid when large. Both aggregate
 * the full pairing — this is never a preview-row sample.
 */
function renderCorrScatter(canvasId, corr) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const theme = chartTheme();
  const scatter = corr.scatter;
  const xLabel = corr.columnA ?? corr.colA;
  const yLabel = corr.columnB ?? corr.colB;
  const options = chartOptions(xLabel, yLabel);

  let cfg;
  if (scatter.kind === "points") {
    cfg = {
      type: "scatter",
      data: { datasets: [{
        data: scatter.points.map(([x, y]) => ({ x, y })),
        backgroundColor: `${theme.accent}55`,
        borderColor: theme.accent,
        borderWidth: 1,
        pointRadius: 2.5,
        pointHoverRadius: 6,
      }] },
      options,
    };
  } else {
    // Grid cells become bubbles at their cell centres, area ∝ pair count.
    const stepX = (scatter.x.max - scatter.x.min) / scatter.bins;
    const stepY = (scatter.y.max - scatter.y.min) / scatter.bins;
    const maxCount = Math.max(1, ...scatter.cells.map(([, , count]) => count));
    cfg = {
      type: "bubble",
      data: { datasets: [{
        data: scatter.cells.map(([xi, yi, count]) => ({
          x: scatter.x.min + (xi + 0.5) * stepX,
          y: scatter.y.min + (yi + 0.5) * stepY,
          r: 2 + 8 * Math.sqrt(count / maxCount),
          count,
        })),
        backgroundColor: `${theme.accent}44`,
        borderColor: theme.accent,
        borderWidth: 1,
      }] },
      options: {
        ...options,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (item) => `${item.raw.count} pair${item.raw.count === 1 ? "" : "s"}` } },
        },
      },
    };
  }
  chartInstances.push(new Chart(canvas.getContext("2d"), cfg));
}

function renderChart(canvasId, spec, data, stats) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const { x: xCol, y: yCol, type } = spec;
  const theme = chartTheme();
  const colors = theme.series;
  const accent = theme.accent;

  try {
    let cfg;
    if (type === "pie") {
      const counts = {};
      data.forEach(r => { const v = String(r[xCol]??"null"); counts[v]=(counts[v]||0)+1; });
      const labels = Object.keys(counts).slice(0,8);
      cfg = { type:"doughnut", data:{ labels, datasets:[{ data:labels.map(l=>counts[l]), backgroundColor:colors, borderWidth:2, borderColor:theme.surface }] }, options:{ plugins:{legend:{position:"bottom",labels:{font:{size:11},boxWidth:12}}}, responsive:true } };
    } else if (type === "bar") {
      const isNumX = stats[xCol]?.type === "numeric";
      if (isNumX && yCol) {
        const vals = data.map(r=>[Number(r[xCol]),Number(r[yCol])]).filter(([a,b])=>!isNaN(a)&&!isNaN(b));
        const xv = vals.map(([x])=>x), mn=Math.min(...xv), mx=Math.max(...xv), bins=10, step=(mx-mn)/bins;
        const bkts = Array.from({length:bins},(_,i)=>({label:`${(mn+i*step).toFixed(1)}`,sum:0,cnt:0}));
        vals.forEach(([x,y])=>{ const i=Math.min(Math.floor((x-mn)/step),bins-1); bkts[i].sum+=y; bkts[i].cnt++; });
        cfg = { type:"bar", data:{ labels:bkts.map(b=>b.label), datasets:[{label:yCol,data:bkts.map(b=>b.cnt>0?+(b.sum/b.cnt).toFixed(2):0),backgroundColor:`${accent}22`,borderColor:accent,borderWidth:1.5,borderRadius:4}] }, options:chartOptions(xCol,yCol) };
      } else {
        const counts={};
        data.forEach(r=>{ const v=String(r[xCol]??"null"); counts[v]=(counts[v]||0)+(yCol?Number(r[yCol])||1:1); });
        const sorted=Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,12);
        cfg = { type:"bar", data:{ labels:sorted.map(([k])=>k), datasets:[{label:yCol||"count",data:sorted.map(([,v])=>v),backgroundColor:`${accent}22`,borderColor:accent,borderWidth:1.5,borderRadius:4}] }, options:chartOptions(xCol,yCol||"count") };
      }
    } else if (type === "scatter" && yCol) {
      const pts=data.map(r=>({x:Number(r[xCol]),y:Number(r[yCol])})).filter(p=>!isNaN(p.x)&&!isNaN(p.y)).slice(0,200);
      cfg = { type:"scatter", data:{ datasets:[{label:`${xCol} vs ${yCol}`,data:pts,backgroundColor:`${accent}44`,borderColor:accent,borderWidth:1,pointRadius:4}] }, options:chartOptions(xCol,yCol) };
    } else if (type === "line" && yCol) {
      const dateX = xCol && data.some(r => /^\d{4}-\d{2}-\d{2}/.test(String(r[xCol] ?? "")));
      let labels, values, xLabel;
      if (dateX) {
        const pts = data.map(r => ({ x: String(r[xCol]), y: Number(r[yCol]) }))
          .filter(p => /^\d{4}-\d{2}-\d{2}/.test(p.x) && !isNaN(p.y))
          .sort((a, b) => a.x.localeCompare(b.x)).slice(0, 100);
        labels = pts.map(p => p.x); values = pts.map(p => p.y); xLabel = xCol;
      } else {
        const pts = data.map((r, i) => ({ x: i, y: Number(r[yCol]) })).filter(p => !isNaN(p.y)).slice(0, 100);
        labels = pts.map(p => p.x); values = pts.map(p => p.y); xLabel = "index";
      }
      cfg = { type:"line", data:{ labels, datasets:[{label:yCol,data:values,borderColor:accent,backgroundColor:`${accent}11`,borderWidth:2,pointRadius:2,fill:true,tension:0.3}] }, options:chartOptions(xLabel,yCol) };
    }
    if (cfg) chartInstances.push(new Chart(ctx, cfg));
  } catch (e) {
    console.warn("Chart error:", e);
    canvas.parentElement.innerHTML += `<p style="font-size:12px;color:var(--text-3);text-align:center;">Could not render chart.</p>`;
  }
}

// Any chart leaves as a PNG: the live canvas composited onto an opaque
// surface, so the image survives dark viewers and slide decks. The filename
// carries the file and the chart it came from.
chartsGrid.addEventListener("click", (event) => {
  const button = event.target.closest(".chart-download");
  if (!button) return;
  const canvas = document.getElementById(button.dataset.canvas);
  const chart = canvas && typeof Chart !== "undefined" ? Chart.getChart(canvas) : null;
  if (!chart) return;
  const copy = document.createElement("canvas");
  copy.width = chart.canvas.width;
  copy.height = chart.canvas.height;
  const context = copy.getContext("2d");
  context.fillStyle = chartTheme().surface;
  context.fillRect(0, 0, copy.width, copy.height);
  context.drawImage(chart.canvas, 0, 0);
  const link = document.createElement("a");
  link.href = copy.toDataURL("image/png");
  link.download = `${exportBaseName()}-${(button.dataset.title || "chart").replace(/[^\w-]+/g, "_").slice(0, 60)}.png`;
  link.click();
});

function chartOptions(xLabel, yLabel) {
  const theme = chartTheme();
  return { responsive:true, plugins:{legend:{display:false}}, scales:{
    x:{ ticks:{font:{size:10},maxTicksLimit:8}, grid:{color:theme.grid}, title:{display:true,text:xLabel,font:{size:11},color:theme.label} },
    y:{ ticks:{font:{size:10}}, grid:{color:theme.grid}, title:{display:!!yLabel,text:yLabel||"",font:{size:11},color:theme.label} },
  }};
}

function statRow(key, val) { return `<div class="stat-row"><span class="stat-key">${esc(key)}</span><span class="stat-val">${esc(val)}</span></div>`; }

function showScreen(name) {
  uploadScreen.style.display    = name==="upload"    ? "" : "none";
  loadingScreen.style.display   = name==="loading"   ? "" : "none";
  dashboardScreen.style.display = name==="dashboard" ? "" : "none";
  if (name === "dashboard") requestAnimationFrame(() => dashTitle.focus({ preventScroll: true }));
}

function showError(msg) { errorBox.textContent=msg; errorBox.style.display=""; }
function hideError()    { errorBox.style.display="none"; errorBox.textContent=""; }
function apiErrorMessage(data, fallback) {
  const message = data?.error || fallback;
  return data?.requestId ? `${message} Reference: ${data.requestId}.` : message;
}

function resetDashboard() {
  selectedFiles=[]; fileInput.value=""; allFileResults=[]; activeTabIdx=0;
  currentComparison=null; compareSection.style.display="none"; fileDashboard.style.display="";
  overviewSection.style.display="none";
  resultNavObserver?.disconnect();
  if (columnInspector.open) columnInspector.close();
  fileListEl.style.display="none"; dropzoneIcon.textContent="↑";
  questionInput.value=""; urlInput.value="";
  renderFileList();
  chartInstances.forEach(c=>c.destroy()); chartInstances=[];
  resetPendingCharts();
  currentAnalysisId=null; updateShareBtn();
  lastSource=null; sheetBar.style.display="none";
  currentTarget=null; currentColumns=null; workspaceRail.hidden=true;
  if (location.search) history.replaceState(null, "", location.pathname);
  hideError(); showScreen("upload");
}

function delay(ms) { return new Promise(r=>setTimeout(r,ms)); }
