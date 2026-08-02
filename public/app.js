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
const chartsGrid        = document.getElementById("chartsGrid");
const chartsSection     = document.getElementById("chartsSection");
const corrSection       = document.getElementById("corrSection");
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
  settingsBtn.textContent = keyMissing() ? "⚙ Add API key for AI" : "⚙ AI settings";
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
  settingsPanel.style.display = settingsPanel.style.display === "none" ? "" : "none";
});

saveSettingsBtn.addEventListener("click", () => {
  storeApiKey(apiKeyInput.value.trim(), rememberKeyToggle?.checked === true);
  localStorage.setItem(MODEL_STORAGE, modelSelect.value);
  updateSettingsBtn();
  settingsStatus.textContent = "Saved ✓";
  setTimeout(() => { settingsStatus.textContent = ""; settingsPanel.style.display = "none"; }, 900);
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
      const icon = item.kind === "comparison" ? "↔" : (item.kind === "multi" ? "🗂️" : (FILE_ICONS[item.filename.split(".").pop().toLowerCase()] || "📄"));
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
  setTimeout(() => { shareBtn.textContent = "🔗 Share"; }, 1500);
});

loadHistory();
const sharedId = new URLSearchParams(location.search).get("a");
if (sharedId) openSaved(sharedId);

const FILE_ICONS = {
  xlsx:"📊",xls:"📊",csv:"📋",json:"🗂️",pdf:"📄",
  pptx:"📑",ppt:"📑",docx:"📝",doc:"📝",txt:"🔤",md:"🔤",
};
const MAX_FILES = 10;

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

document.querySelectorAll("[data-analysis-mode]").forEach((button) => {
  button.addEventListener("click", () => {
    analysisMode = button.dataset.analysisMode;
    document.querySelectorAll("[data-analysis-mode]").forEach((candidate) => candidate.classList.toggle("active", candidate === button));
    const comparing = analysisMode === "compare";
    analysisModeHint.textContent = comparing
      ? "Choose exactly two tabular files. File 1 is the baseline; file 2 is the current version."
      : "Profile one file or explore several files side by side.";
    urlInputWrap.style.display = comparing ? "none" : "";
    questionInputWrap.style.display = comparing ? "none" : "";
    sampleBtn.style.display = comparing ? "none" : "";
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
  for (const f of incoming) {
    if (combined.length >= limit) break;
    if (!combined.find(x => x.name === f.name && x.size === f.size)) combined.push(f);
  }
  selectedFiles = combined;
  renderFileList();
}

function urlValue() { return urlInput.value.trim(); }

urlInput.addEventListener("input", () => { if (selectedFiles.length === 0) renderFileList(); });

function renderFileList() {
  const comparing = analysisMode === "compare";
  if (selectedFiles.length === 0) {
    fileListEl.style.display = "none";
    dropzoneIcon.textContent = "📁";
    analyzeBtn.disabled = comparing || !urlValue();
    analyzeBtn.textContent = comparing ? "Select two files to compare" : (urlValue() ? "Analyze link →" : "Analyze data →");
    return;
  }

  dropzoneIcon.textContent = selectedFiles.length === 1
    ? (FILE_ICONS[selectedFiles[0].name.split(".").pop().toLowerCase()] || "📁")
    : "📁";

  fileListEl.style.display = "flex";
  fileListEl.innerHTML = selectedFiles.map((f, i) => {
    const ext  = f.name.split(".").pop().toLowerCase();
    const icon = FILE_ICONS[ext] || "📄";
    const size = f.size > 1024*1024 ? `${(f.size/1024/1024).toFixed(1)}MB` : `${(f.size/1024).toFixed(0)}KB`;
    return `<div class="file-chip">
      <span class="file-chip-icon">${icon}</span>
      <span class="file-chip-name">${esc(f.name)}</span>
      <span class="file-chip-size">${size}</span>
      <button class="file-chip-remove" data-idx="${i}" type="button">×</button>
    </div>`;
  }).join("");

  if (selectedFiles.length < (comparing ? 2 : MAX_FILES)) {
    fileListEl.innerHTML += `<label class="add-more-btn" for="fileInput">+ Add more</label>`;
  }

  analyzeBtn.disabled = comparing && selectedFiles.length !== 2;
  analyzeBtn.textContent = comparing
    ? (selectedFiles.length === 2 ? "Compare baseline to current →" : "Add one current file")
    : (selectedFiles.length === 1 ? "Analyze data →" : `Analyze ${selectedFiles.length} files →`);
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
});
tabsBar.addEventListener("click", (e) => {
  const tab = e.target.closest(".tab-btn");
  if (tab) switchTab(Number(tab.dataset.idx));
});

// ─── Analyze ──────────────────────────────────────────────────
analyzeBtn.addEventListener("click", () => { currentTarget = null; runAnalysis(); });
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
  showScreen("loading");
  hideError();
  animateLoadingSteps();

  const isMulti  = selectedFiles.length > 1 && !isComparison;
  const question = questionInput.value.trim();

  if (isComparison) {
    loadingFileCount.textContent = "Comparing baseline to current file...";
  } else if (isMulti) {
    loadingFileCount.textContent = `Analyzing ${selectedFiles.length} files in parallel...`;
  }

  lastSheet = sheet || null;
  const formData = new FormData();
  formData.append("question", isComparison ? "" : question);
  if (!isComparison) formData.append("model", getModel() || modelSelect.value || "");
  if (sheet && !isMulti) formData.append("sheet", sheet);
  if (currentTarget && !isComparison) formData.append("target", currentTarget);

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
    const response = await fetch(endpoint, { method:"POST", headers, body:formData });
    const data     = await response.json()
      .catch(() => ({ error: `The server returned an unexpected response (HTTP ${response.status}) — the upload may be too large.` }));
    if (!response.ok) throw new Error(apiErrorMessage(data, "Analysis failed."));
    await delay(500);

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
    showScreen("upload");
    showError(err.message);
  }
}

async function runUrlAnalysis(sheet) {
  showScreen("loading");
  hideError();
  animateLoadingSteps();
  loadingFileCount.textContent = "Fetching file from URL...";

  try {
    const headers = { "Content-Type": "application/json", "x-ridge-session": getSessionId() };
    if (getApiKey()) headers["x-anthropic-key"] = getApiKey();
    const response = await fetch("/api/analyze-url", {
      method: "POST",
      headers,
      body: JSON.stringify({
        url: urlValue(),
        question: questionInput.value.trim(),
        model: getModel() || modelSelect.value || "",
        sheet: sheet || undefined,
        target: currentTarget || undefined,
        save: saveToggle?.checked === true,
      }),
    });
    const data = await response.json()
      .catch(() => ({ error: `The server returned an unexpected response (HTTP ${response.status}).` }));
    if (!response.ok) throw new Error(apiErrorMessage(data, "Analysis failed."));
    await delay(500);
    lastSource = { kind: "url" };
    allFileResults = [data];
    renderSingleFile(data, false);
    renderSheetBar(data.meta);
    currentAnalysisId = data.analysisId || null;
    updateShareBtn();
    loadHistory();
    showScreen("dashboard");
  } catch (err) {
    showScreen("upload");
    showError(err.message);
  }
}

function animateLoadingSteps() {
  // Honest step label: no AI runs when no key is configured.
  steps[2].textContent = keyMissing() ? "COMPUTING EVIDENCE" : "RUNNING AI ANALYSIS";
  steps.forEach(s => s.classList.remove("active"));
  steps[0].classList.add("active");
  [900, 1800, 2700].forEach((d, i) => {
    setTimeout(() => {
      steps[i].classList.remove("active");
      if (steps[i+1]) steps[i+1].classList.add("active");
    }, d);
  });
}

// ─── Deterministic comparison dashboard ───────────────────────
function signed(value, suffix = "") {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `${value > 0 ? "+" : ""}${value}${suffix}`;
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
    return `mean ${signed(column.deltas.mean)}${pct}`;
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

  compareFindings.innerHTML = (comparison.findings || []).map((finding) => `
    <div class="compare-finding ${esc(finding.severity || "neutral")}"><strong>${esc(finding.title)}</strong><p>${esc(finding.detail)}</p></div>`).join("");

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
      col.innerHTML = `<div class="cross-col-title">🔗 Common Themes</div>` +
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
    const icon = FILE_ICONS[ext] || "📄";
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
  renderSingleFile(allFileResults[idx], true);
}

// ─── Single file renderer ─────────────────────────────────────
function renderSingleFile(data, isTabbed) {
  currentComparison = null;
  compareSection.style.display = "none";
  fileDashboard.style.display = "";
  chartInstances.forEach(c => c.destroy());
  chartInstances = [];

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
      ? "This document type has limited deterministic analysis (an excerpt is shown below). Adding an Anthropic API key enables full AI reading, insights and follow-up questions."
      : "Statistics, quality checks and evidence below were computed deterministically — no AI involved yet. Add an interpretation when you want one.";
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

  renderEvidence(data.evidence || []);
  renderTargetBar(data);
  renderQuality(data.profile);
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
    statGrid.innerHTML = Object.entries(stats).map(([col, s]) => {
      if (s.type === "numeric") {
        const coverage = s.coverage !== undefined
          ? statRow("coverage", `${s.coverage}%${s.invalid ? ` (${s.invalid} invalid)` : ""}`)
          : "";
        return `<div class="stat-card">
        <div class="stat-col-name">${esc(col)}</div><span class="stat-type-badge numeric">numeric</span>
        ${statRow("mean",s.mean)}${statRow("median",s.median)}${statRow("min",s.min)}${statRow("max",s.max)}${statRow("std",s.std)}${statRow("count",s.count)}${coverage}
      </div>`;
      }
      if (s.type === "date") return `<div class="stat-card">
        <div class="stat-col-name">${esc(col)}</div><span class="stat-type-badge categorical">date</span>
        ${statRow("valid",s.validCount)}${statRow("earliest",s.earliest||"—")}${statRow("latest",s.latest||"—")}${statRow("range",s.rangeDays != null ? s.rangeDays + " days" : "—")}${s.trend ? statRow("trend", s.trend) : ""}
      </div>`;
      // Categorical top values are { value, count, percentage } objects ranked
      // by frequency; render the leading levels with their share.
      const topText = (s.top || [])
        .slice(0, 5)
        .map(t => typeof t === "object" && t !== null ? `${t.value} (${t.percentage}%)` : String(t))
        .join(", ");
      return `<div class="stat-card">
        <div class="stat-col-name">${esc(col)}</div><span class="stat-type-badge categorical">${esc(s.role || "categorical")}</span>
        ${statRow("count",s.count)}${statRow("unique",s.unique)}
        <div class="stat-row"><span class="stat-key">most common</span><span class="stat-val" style="font-size:10px;">${esc(topText)}</span></div>
      </div>`;
    }).join("");
  } else {
    statsSection.style.display = "none";
    if (rawText) { rawTextSection.style.display = ""; rawTextPreview.textContent = rawText; }
    else rawTextSection.style.display = "none";
  }

  if (correlations && correlations.length > 0) {
    corrSection.style.display = "";
    corrList.innerHTML = correlations.map(c => {
      // Support both the current shape (columnA/coefficient/n/coverage) and the
      // legacy colA/r shape still present in previously shared analyses.
      const r = c.coefficient ?? c.r;
      const colA = c.columnA ?? c.colA;
      const colB = c.columnB ?? c.colB;
      const isPos = r >= 0, pct = Math.abs(r) * 100;
      const evidence = c.n !== undefined
        ? `<div class="corr-meta">${esc(c.strength || "")} · ${esc(c.method || "pearson")} · n=${c.n} · ${c.coverage}% coverage${c.smallSample ? " · small sample" : ""}</div>`
        : "";
      const caveat = c.caveat ? `<div class="corr-caveat">⚠ ${esc(c.caveat)}</div>` : "";
      return `<div class="corr-item">
        <div class="corr-cols">${esc(colA)} ↔ ${esc(colB)}</div>
        <div class="corr-bar-wrap"><div class="corr-bar ${isPos?"positive":"negative"}" style="width:${pct}%"></div></div>
        <div class="corr-val ${isPos?"positive":"negative"}">${r>0?"+":""}${r}</div>
        ${evidence}${caveat}
      </div>`;
    }).join("");
  } else corrSection.style.display = "none";

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
    charts.forEach((spec, idx) => {
      const card = document.createElement("div");
      card.className = "chart-card animate";
      card.style.animationDelay = `${idx * 0.08}s`;
      const canvasId = `chart-${idx}`;
      card.innerHTML = `<div class="chart-title">${esc(spec.title)}</div><div class="chart-reason">${esc(spec.reason)}</div><canvas id="${canvasId}" class="chart-canvas" height="220"></canvas>`;
      chartsGrid.appendChild(card);
      setTimeout(() => {
        if (spec.deterministic) renderAggregateChart(canvasId, spec);
        else renderChart(canvasId, spec, chartData, stats);
      }, 50);
    });
  } else chartsSection.style.display = "none";

  conclusionText.textContent = hasAI ? analysis.conclusion : "";
  conclusionSection.style.display = hasAI ? "" : "none";
  renderResultNav();
}

function renderResultNav() {
  const sections = [
    ["evidenceSection", "Evidence"],
    ["qualitySection", "Quality"],
    ["statsSection", "Columns"],
    ["chartsSection", "Charts"],
    ["corrSection", "Relationships"],
    ["askSection", "Ask"],
  ].filter(([id]) => {
    const element = document.getElementById(id);
    return element && element.style.display !== "none";
  });
  if (sections.length < 2) {
    resultNav.style.display = "none";
    return;
  }
  resultNav.style.display = "";
  resultNav.innerHTML = sections.map(([id, label]) => `<a href="#${esc(id)}">${esc(label)}</a>`).join("");
}

function buildDeterministicCharts(stats, target) {
  const entries = Object.entries(stats || {});
  if (target && stats?.[target]) {
    entries.sort(([left], [right]) => left === target ? -1 : right === target ? 1 : 0);
  }

  const charts = [];
  const usedKinds = new Set();
  for (const [column, field] of entries) {
    let chart = null;
    if (field.type === "numeric" && field.histogram?.bins?.length && !usedKinds.has("numeric")) {
      chart = {
        deterministic: true,
        kind: "histogram",
        title: `${column} distribution`,
        reason: `${field.validCount.toLocaleString()} valid values · ${field.coverage}% coverage · ${field.histogram.method === "iqr-tail-aware" ? "outliers separated from central bins" : "equal-width bins"}`,
        labels: field.histogram.bins.map(bin => {
          if (bin.kind === "low-tail") return `< ${bin.end}`;
          if (bin.kind === "high-tail") return `> ${bin.start}`;
          return bin.start === bin.end ? String(bin.start) : `${bin.start}–${bin.end}`;
        }),
        values: field.histogram.bins.map(bin => bin.count),
        xLabel: column,
        yLabel: "rows",
      };
      usedKinds.add("numeric");
    } else if (field.type === "date" && field.periods?.length > 1 && !usedKinds.has("date")) {
      chart = {
        deterministic: true,
        kind: "trend",
        title: `${column} over time`,
        reason: `${field.validCount.toLocaleString()} dated rows · ${field.granularity} buckets · ${field.coverage}% coverage`,
        labels: field.periods.map(period => period.period),
        values: field.periods.map(period => period.count),
        xLabel: column,
        yLabel: "rows",
      };
      usedKinds.add("date");
    } else if (field.type === "categorical" && field.role === "category" && field.top?.length > 1 && !usedKinds.has("category")) {
      chart = {
        deterministic: true,
        kind: "category",
        title: `${column} breakdown`,
        reason: `${field.validCount.toLocaleString()} valid values · top ${field.top.length} of ${field.unique} levels · ${field.coverage}% coverage`,
        labels: field.top.map(item => item.value),
        values: field.top.map(item => item.count),
        xLabel: column,
        yLabel: "rows",
      };
      usedKinds.add("category");
    }
    if (chart) charts.push(chart);
    if (charts.length === 3) break;
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
const STRENGTH_CLASS = { "very strong": "strong", strong: "strong", moderate: "moderate", weak: "weak", negligible: "weak" };

function renderEvidence(evidence) {
  if (!evidence.length) { evidenceSection.style.display = "none"; return; }
  evidenceSection.style.display = "";
  evidenceList.innerHTML = evidence.map(e => {
    const provenance = e.provenance;
    const headers = e.columns || [];
    const sourceRows = provenance?.sourceRows || [];
    const exclusions = (provenance?.exclusionReasons || []).map((reason) => `${reason.count} ${reason.reason}`).join(" · ") || "None";
    const drilldown = provenance ? `<details class="evidence-provenance">
      <summary>Inspect formula and source rows</summary>
      <div class="evidence-provenance-grid">
        <div><span>Formula</span><strong>${esc(provenance.formula)}</strong></div>
        <div><span>Included</span><strong>${esc(provenance.includedRows)} of ${esc(provenance.inputRows)} rows</strong></div>
        <div><span>Rule</span><strong>${esc(provenance.inclusionRule)}</strong></div>
        <div><span>Excluded</span><strong>${esc(provenance.excludedRows)} rows · ${esc(exclusions)}</strong></div>
      </div>
      ${sourceRows.length ? `<div class="evidence-source-note">${esc(provenance.sourceRowsPolicy)}</div>
        <div class="evidence-source-wrap"><table class="evidence-source-table"><thead><tr><th>Row</th>${headers.map((column) => `<th>${esc(column)}</th>`).join("")}</tr></thead><tbody>
          ${sourceRows.map((source) => `<tr><td>${esc(source.rowNumber)}</td>${headers.map((column) => `<td>${esc(source.values?.[column] ?? "—")}</td>`).join("")}</tr>`).join("")}
        </tbody></table></div>` : ""}
    </details>` : "";
    return `<div class="evidence-item">
      <div class="evidence-head">
        <span class="evidence-strength ${STRENGTH_CLASS[e.strength] || "weak"}">${esc(e.strength)}</span>
        <span class="evidence-claim">${esc(e.claim)}</span>
      </div>
      <div class="evidence-meta">${esc(e.method)} · n=${esc(e.sampleSize)} · ${esc(e.coverage)}% coverage · engine v${esc(e.engineVersion)}</div>
      ${e.caveat ? `<div class="evidence-caveat">⚠ ${esc(e.caveat)}</div>` : ""}
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
  if (!lastSource) return;
  currentTarget = targetSelect.value || null;
  if (lastSource.kind === "url") runUrlAnalysis(lastSheet);
  else runAnalysis(lastSheet);
});

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
      ? `mean ${s.mean} · median ${s.median} · min ${s.min} · max ${s.max} · std ${s.std} · ${s.coverage}% coverage${s.invalid ? ` · ${s.invalid} invalid` : ""}`
      : s.type === "date"
        ? `${s.earliest || "—"} → ${s.latest || "—"} · ${s.validCount} valid${s.trend ? ` · trend ${s.trend}` : ""}`
        : `${s.unique} unique · top: ${(s.top || []).slice(0, 3).map(t => `${t.value} (${t.percentage}%)`).join(", ")}`;
    return `<tr><td>${esc(col)}</td><td>${esc(s.type)}</td><td>${esc(s.missing ?? 0)}</td><td>${esc(detail)}</td></tr>`;
  }).join("");
  const evidenceRows = evidence.map(e => `
    <div class="ev"><strong>[${esc(e.strength)}]</strong> ${esc(e.claim)}
      <div class="muted">${esc(e.method)} · n=${esc(e.sampleSize)} · ${esc(e.coverage)}% coverage</div>
      ${e.provenance ? `<div class="muted">Formula: ${esc(e.provenance.formula)} · included ${esc(e.provenance.includedRows)}/${esc(e.provenance.inputRows)} rows · source rows ${esc(e.provenance.sourceRows.map((row) => row.rowNumber).join(", ") || "none")}</div>` : ""}
      ${e.caveat ? `<div class="muted">⚠ ${esc(e.caveat)}</div>` : ""}</div>`).join("") || `<p class="muted">None met the reporting thresholds.</p>`;
  const corrRows = correlations.map(c =>
    `<tr><td>${esc(c.columnA ?? c.colA)} ↔ ${esc(c.columnB ?? c.colB)}</td><td>${esc(c.coefficient ?? c.r)}</td><td>${esc(c.method || "pearson")}</td><td>${esc(c.n ?? "—")}</td><td>${esc(c.coverage ?? "—")}%</td></tr>`).join("");
  const issues = (profile?.issues || []).map(i => `<li>[${esc(i.severity)}] ${esc(i.message)}</li>`).join("");
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Analysis report — ${esc(meta.filename || "dataset")}</title>
  <style>
    body { font-family: Georgia, serif; max-width: 800px; margin: 32px auto; padding: 0 24px; color: #1a1916; line-height: 1.55; }
    h1 { font-size: 22px; margin-bottom: 2px; } h2 { font-size: 15px; margin: 26px 0 8px; border-bottom: 1px solid #ddd; padding-bottom: 3px; }
    table { border-collapse: collapse; width: 100%; font-size: 12px; } td, th { border: 1px solid #ddd; padding: 5px 8px; text-align: left; vertical-align: top; }
    .muted { color: #6b6960; font-size: 11.5px; } .ev { margin-bottom: 10px; font-size: 13px; }
    .meta { color: #6b6960; font-size: 12px; margin-bottom: 4px; }
    .badge { display: inline-block; border: 1px solid #ccc; border-radius: 4px; padding: 0 6px; font-size: 10.5px; color: #6b6960; margin-left: 6px; }
    .noprint { margin: 18px 0; } @media print { .noprint { display: none; } }
  </style></head><body>
  <h1>Analysis report — ${esc(meta.filename || "dataset")}</h1>
  <div class="meta">${esc(meta.totalRows ?? "—")} rows · ${esc(meta.columns ?? "—")} columns${meta.target ? ` · target: ${esc(meta.target)}` : ""} · analysis schema v${esc(meta.schemaVersion || "—")} · evidence engine v${esc(meta.evidenceEngine || "—")}</div>
  <div class="noprint"><button onclick="window.print()">Print or save as PDF</button></div>
  <h2>Evidence <span class="badge">deterministic</span></h2>${evidenceRows}
  ${profile ? `<h2>Data quality <span class="badge">deterministic</span></h2>
  <p>Health ${esc(profile.healthGrade)} (${esc(profile.healthScore)}/100) · completeness ${esc(profile.completeness)}% · ${esc(profile.duplicateRows)} duplicate rows</p>
  ${issues ? `<ul class="muted">${issues}</ul>` : ""}` : ""}
  <h2>Column statistics <span class="badge">deterministic</span></h2>
  <table><tr><th>Column</th><th>Type</th><th>Missing</th><th>Detail</th></tr>${statRows}</table>
  ${corrRows ? `<h2>Correlations <span class="badge">deterministic</span></h2>
  <table><tr><th>Pair</th><th>Coefficient</th><th>Method</th><th>n</th><th>Coverage</th></tr>${corrRows}</table>` : ""}
  ${analysis ? `<h2>AI interpretation <span class="badge">AI-generated</span></h2>
  <p>${esc(analysis.summary || "")}</p>
  ${(analysis.insights || []).map(i => `<div class="ev"><strong>${esc(i.title)}</strong><div>${esc(i.detail)}</div></div>`).join("")}
  <p>${esc(analysis.conclusion || "")}</p>` : `<h2>AI interpretation</h2><p class="muted">Not included — this analysis ran deterministically without an API key.</p>`}
  <p class="muted">Generated ${new Date().toISOString().slice(0, 10)}. Deterministic sections are computed; AI sections are model-generated interpretation of that computed evidence.</p>
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
function renderQuality(profile) {
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

  qualityColumns.innerHTML = Object.entries(profile.columns).map(([name, c]) => `
    <div class="quality-col" title="${esc(name)}">
      <span class="quality-col-name">${esc(name)}</span>
      <span class="quality-col-info">${esc(c.type)}${c.missingPct > 0 ? ` · ${c.missingPct}%∅` : ""}</span>
    </div>`).join("");
}

// ─── Chart rendering ──────────────────────────────────────────
function renderAggregateChart(canvasId, spec) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const isTrend = spec.kind === "trend";
  const cfg = {
    type: isTrend ? "line" : "bar",
    data: {
      labels: spec.labels,
      datasets: [{
        data: spec.values,
        borderColor: "#2563eb",
        backgroundColor: isTrend ? "#2563eb11" : "#2563eb22",
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

function renderChart(canvasId, spec, data, stats) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const { x: xCol, y: yCol, type } = spec;
  const colors = ["#2563eb","#16a34a","#d97706","#dc2626","#7c3aed","#0891b2"];

  try {
    let cfg;
    if (type === "pie") {
      const counts = {};
      data.forEach(r => { const v = String(r[xCol]??"null"); counts[v]=(counts[v]||0)+1; });
      const labels = Object.keys(counts).slice(0,8);
      cfg = { type:"doughnut", data:{ labels, datasets:[{ data:labels.map(l=>counts[l]), backgroundColor:colors, borderWidth:2, borderColor:"#fff" }] }, options:{ plugins:{legend:{position:"bottom",labels:{font:{size:11},boxWidth:12}}}, responsive:true } };
    } else if (type === "bar") {
      const isNumX = stats[xCol]?.type === "numeric";
      if (isNumX && yCol) {
        const vals = data.map(r=>[Number(r[xCol]),Number(r[yCol])]).filter(([a,b])=>!isNaN(a)&&!isNaN(b));
        const xv = vals.map(([x])=>x), mn=Math.min(...xv), mx=Math.max(...xv), bins=10, step=(mx-mn)/bins;
        const bkts = Array.from({length:bins},(_,i)=>({label:`${(mn+i*step).toFixed(1)}`,sum:0,cnt:0}));
        vals.forEach(([x,y])=>{ const i=Math.min(Math.floor((x-mn)/step),bins-1); bkts[i].sum+=y; bkts[i].cnt++; });
        cfg = { type:"bar", data:{ labels:bkts.map(b=>b.label), datasets:[{label:yCol,data:bkts.map(b=>b.cnt>0?+(b.sum/b.cnt).toFixed(2):0),backgroundColor:"#2563eb22",borderColor:"#2563eb",borderWidth:1.5,borderRadius:4}] }, options:chartOptions(xCol,yCol) };
      } else {
        const counts={};
        data.forEach(r=>{ const v=String(r[xCol]??"null"); counts[v]=(counts[v]||0)+(yCol?Number(r[yCol])||1:1); });
        const sorted=Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,12);
        cfg = { type:"bar", data:{ labels:sorted.map(([k])=>k), datasets:[{label:yCol||"count",data:sorted.map(([,v])=>v),backgroundColor:"#2563eb22",borderColor:"#2563eb",borderWidth:1.5,borderRadius:4}] }, options:chartOptions(xCol,yCol||"count") };
      }
    } else if (type === "scatter" && yCol) {
      const pts=data.map(r=>({x:Number(r[xCol]),y:Number(r[yCol])})).filter(p=>!isNaN(p.x)&&!isNaN(p.y)).slice(0,200);
      cfg = { type:"scatter", data:{ datasets:[{label:`${xCol} vs ${yCol}`,data:pts,backgroundColor:"#2563eb44",borderColor:"#2563eb",borderWidth:1,pointRadius:4}] }, options:chartOptions(xCol,yCol) };
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
      cfg = { type:"line", data:{ labels, datasets:[{label:yCol,data:values,borderColor:"#2563eb",backgroundColor:"#2563eb11",borderWidth:2,pointRadius:2,fill:true,tension:0.3}] }, options:chartOptions(xLabel,yCol) };
    }
    if (cfg) chartInstances.push(new Chart(ctx, cfg));
  } catch (e) {
    console.warn("Chart error:", e);
    canvas.parentElement.innerHTML += `<p style="font-size:12px;color:var(--text-3);text-align:center;">Could not render chart.</p>`;
  }
}

function chartOptions(xLabel, yLabel) {
  return { responsive:true, plugins:{legend:{display:false}}, scales:{
    x:{ ticks:{font:{size:10},maxTicksLimit:8}, grid:{color:"#f0ede6"}, title:{display:true,text:xLabel,font:{size:11},color:"#9e9b93"} },
    y:{ ticks:{font:{size:10}}, grid:{color:"#f0ede6"}, title:{display:!!yLabel,text:yLabel||"",font:{size:11},color:"#9e9b93"} },
  }};
}

function statRow(key, val) { return `<div class="stat-row"><span class="stat-key">${esc(key)}</span><span class="stat-val">${esc(val)}</span></div>`; }

function showScreen(name) {
  uploadScreen.style.display    = name==="upload"    ? "" : "none";
  loadingScreen.style.display   = name==="loading"   ? "" : "none";
  dashboardScreen.style.display = name==="dashboard" ? "" : "none";
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
  fileListEl.style.display="none"; dropzoneIcon.textContent="📁";
  questionInput.value=""; urlInput.value="";
  renderFileList();
  chartInstances.forEach(c=>c.destroy()); chartInstances=[];
  currentAnalysisId=null; updateShareBtn();
  lastSource=null; sheetBar.style.display="none";
  if (location.search) history.replaceState(null, "", location.pathname);
  hideError(); showScreen("upload");
}

function delay(ms) { return new Promise(r=>setTimeout(r,ms)); }
