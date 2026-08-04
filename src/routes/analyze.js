import { Router } from "express";
import path from "path";
import multer from "multer";
import { ALLOWED_EXTENSIONS, getFileType, parseFile } from "../parsers/index.js";
import { computeStats } from "../analytics/stats.js";
import { computeCorrelations } from "../analytics/correlations.js";
import { ANALYSIS_SCHEMA_VERSION, buildEvidence, EVIDENCE_ENGINE_VERSION } from "../analytics/evidence.js";
import { profileDataset, profileSummaryForPrompt } from "../analytics/profile.js";
import { compareAnalyses, COMPARISON_VERSION } from "../analytics/compare.js";
import { buildTabularPrompt, buildTextPrompt, buildCrossSummaryPrompt } from "../prompts.js";
import { runAnalysis, resolveApiKey, resolveModel } from "../services/anthropic.js";
import { ANALYSIS_SCHEMA, CROSS_SUMMARY_SCHEMA } from "../schemas.js";
import { fetchRemoteFile } from "../services/remoteFile.js";
import { saveAnalysis, validSessionId } from "../services/history.js";
import { AppError, normalizeError } from "../errors.js";
import { rateLimit } from "../middleware/rateLimit.js";

const MAX_QUESTION_LENGTH = 2000;
const MAX_COLUMN_SELECTION = 512;

function analysisRecord(req, startedAt, analysis) {
  return {
    requestId: req.requestId,
    generatedAt: new Date().toISOString(),
    processingMs: Math.max(0, Date.now() - startedAt),
    aiIncluded: Boolean(analysis),
  };
}

// Vercel rejects serverless request bodies over ~4.5 MB before the function
// runs, so the aggregate budget — not just the per-file limit — is what
// actually matters. Multer caps each file; this caps the whole request so a
// 10-file upload of 4 MB each cannot slip past a per-file check.
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

export function assertAggregateUploadSize(files) {
  const total = (files || []).reduce((sum, f) => sum + (f?.size || 0), 0);
  if (total > MAX_UPLOAD_BYTES) {
    throw new AppError(
      `Uploads are limited to ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB per request in total. Analyze a larger file by pasting a link instead.`,
      { status: 413, code: "upload_too_large" },
    );
  }
  return total;
}

// Per-file limit; the aggregate guard above is what protects the request
// budget. Larger files go through the URL path, which fetches server-side.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    ALLOWED_EXTENSIONS.includes(ext)
      ? cb(null, true)
      : cb(new AppError(`Unsupported file type: ${ext}`, { status: 400, code: "unsupported_file_type" }));
  },
});

export function validateSheet(raw) {
  if (raw === undefined || raw === null || raw === "") return undefined;
  if (typeof raw !== "string" || raw.length > 128) {
    throw new AppError("Invalid sheet name.", { status: 400, code: "invalid_sheet" });
  }
  return raw;
}

export function validateTarget(raw) {
  if (raw === undefined || raw === null || raw === "") return null;
  if (typeof raw !== "string" || raw.length > 200) {
    throw new AppError("Invalid target column.", { status: 400, code: "invalid_target" });
  }
  return raw;
}

/**
 * Persistence is opt-in per request. Absent, blank or anything other than an
 * explicit affirmative means "do not store" — a configured Supabase is
 * capability, not consent.
 */
export function persistRequested(raw) {
  return raw === true || raw === "true" || raw === "1" || raw === "on";
}

/** The target must name a real column of the parsed file. */
function resolveTarget(target, columns) {
  if (target === null) return null;
  if (!columns.includes(target)) {
    throw new AppError(`Target column "${target}" is not in this file.`, { status: 400, code: "unknown_target" });
  }
  return target;
}

/**
 * Column selection arrives as a JSON array, never a delimited string. Header
 * names in real spreadsheets contain commas ("Revenue, USD"), so splitting on
 * one would silently analyze columns the user never named.
 */
export function validateColumns(raw) {
  if (raw === undefined || raw === null || raw === "") return null;
  let list = raw;
  if (typeof raw === "string") {
    try {
      list = JSON.parse(raw);
    } catch {
      throw new AppError("Column selection must be a JSON array of column names.", { status: 400, code: "invalid_columns" });
    }
  }
  if (!Array.isArray(list)) {
    throw new AppError("Column selection must be a JSON array of column names.", { status: 400, code: "invalid_columns" });
  }
  if (list.length > MAX_COLUMN_SELECTION) {
    throw new AppError(`Column selection is too long (max ${MAX_COLUMN_SELECTION}).`, { status: 400, code: "invalid_columns" });
  }
  if (list.some((name) => typeof name !== "string")) {
    throw new AppError("Column selection must contain only column names.", { status: 400, code: "invalid_columns" });
  }
  const unique = [...new Set(list.map((name) => name.trim()).filter(Boolean))];
  return unique.length > 0 ? unique : null;
}

/**
 * Narrows the parsed columns to the requested set. Returns the excluded names
 * alongside the active ones: an exclusion changes what every downstream
 * statistic is computed over, so it has to travel with the result rather than
 * disappear into it.
 */
export function resolveColumns(requested, columns) {
  if (!requested) return { active: columns, excluded: [] };
  const known = new Set(columns);
  const unknown = requested.filter((name) => !known.has(name));
  if (unknown.length > 0) {
    throw new AppError(
      `Unknown column${unknown.length > 1 ? "s" : ""}: ${unknown.slice(0, 5).join(", ")}.`,
      { status: 400, code: "unknown_column" },
    );
  }
  // Filter the parsed order rather than adopting request order, so identical
  // selections always produce identical output regardless of how they arrived.
  const wanted = new Set(requested);
  const active = columns.filter((name) => wanted.has(name));
  if (active.length === 0) {
    throw new AppError("Select at least one column to analyze.", { status: 400, code: "no_columns_selected" });
  }
  return { active, excluded: columns.filter((name) => !wanted.has(name)) };
}

export function validateQuestion(raw) {
  if (raw === undefined || raw === null || raw === "") return "";
  if (typeof raw !== "string") {
    throw new AppError("Question must be a string.", { status: 400, code: "invalid_question" });
  }
  if (raw.length > MAX_QUESTION_LENGTH) {
    throw new AppError(`Question is too long (max ${MAX_QUESTION_LENGTH} characters).`, { status: 400, code: "question_too_long" });
  }
  return raw.trim();
}

async function analyzeParsedFile(parsed, question, { apiKey, model, target = null, includeColumns = null }) {
  const { rows, columns: parsedColumns, isTabular, rawText } = parsed;
  // columns.length > 0, not > 1: a single-column sheet is still tabular —
  // the old > 1 check routed it to the text prompt, whose r.content lookup
  // came back undefined for every row and produced an empty prompt.
  const tabular      = isTabular && parsedColumns.length > 0;
  // Narrowing happens once, here, so every downstream computation sees the
  // same column set. Rows are never filtered — excluding a column removes a
  // measurement, not an observation.
  const { active: columns, excluded: excludedColumns } = tabular
    ? resolveColumns(includeColumns, parsedColumns)
    : { active: parsedColumns, excluded: [] };
  const stats        = tabular ? computeStats(rows, columns) : {};
  const correlations = tabular ? computeCorrelations(rows, columns, stats) : [];
  const profile      = tabular ? profileDataset(rows, columns) : null;
  // Multi-file requests reuse one target across files, so a file without that
  // column falls back to untargeted evidence instead of failing the batch.
  const effectiveTarget = tabular && target && columns.includes(target) ? target : null;
  const evidence     = tabular ? buildEvidence(rows, columns, stats, { target: effectiveTarget }) : [];

  // The deterministic pipeline above is the product; AI interpretation is an
  // optional layer that only runs when a key accompanied the request.
  let analysis = null;
  if (apiKey) {
    const fallbackText = rawText || rows.map(r => typeof r.content === "string" ? r.content : JSON.stringify(r)).join("\n");
    const prompt = tabular
      ? buildTabularPrompt(columns, stats, correlations, rows, question, profileSummaryForPrompt(profile), evidence)
      : buildTextPrompt(parsed.fileType, fallbackText, question);
    analysis = await runAnalysis({ apiKey, model, prompt, schema: ANALYSIS_SCHEMA });
  }
  return { stats, correlations, profile, evidence, target: effectiveTarget, analysis, activeColumns: columns, excludedColumns };
}

const router = Router();

router.post("/analyze", rateLimit(), upload.single("file"), async (req, res) => {
  const startedAt = Date.now();
  if (!req.file) throw new AppError("No file uploaded.", { status: 400, code: "no_file" });
  assertAggregateUploadSize([req.file]);
  const question = validateQuestion(req.body.question);
  const apiKey   = resolveApiKey(req, { required: false });
  const model    = resolveModel(req.body.model);
  const sheet    = validateSheet(req.body.sheet);
  const parsed   = await parseFile(req.file, { sheet });
  const { rows, columns, sheetName, totalRows, isTabular, rawText, pages } = parsed;

  if (rows.length === 0 && !rawText) throw new AppError("File appears empty.", { status: 400, code: "empty_file" });
  const target = isTabular ? resolveTarget(validateTarget(req.body.target), columns) : null;
  const includeColumns = validateColumns(req.body.columns);

  const { stats, correlations, profile, evidence, analysis, activeColumns, excludedColumns } =
    await analyzeParsedFile(parsed, question, { apiKey, model, target, includeColumns });

  const body = {
    meta: { sheetName, sheets:parsed.sheets, totalRows, columns:columns.length, fileType:parsed.fileType, isTabular, pages, filename:req.file.originalname, size:req.file.size, model,
      target, activeColumns, excludedColumns, schemaVersion: ANALYSIS_SCHEMA_VERSION, evidenceEngine: EVIDENCE_ENGINE_VERSION,
      ...analysisRecord(req, startedAt, analysis) },
    stats, correlations, profile, evidence, analysis, chartData:isTabular ? rows.slice(0,100) : [], columns,
    rawText: isTabular ? null : (rawText||"").slice(0,2000),
  };
  body.analysisId = persistRequested(req.body.save)
    ? await saveAnalysis({
        sessionId: validSessionId(req.get("x-ridge-session")), kind: "single",
        filename: req.file.originalname, fileType: parsed.fileType, model, question, payload: body,
      })
    : null;
  body.meta.saved = Boolean(body.analysisId);
  res.json(body);
});

router.post("/analyze-url", rateLimit(), async (req, res) => {
  const startedAt = Date.now();
  const question = validateQuestion(req.body?.question);
  const apiKey   = resolveApiKey(req, { required: false });
  const model    = resolveModel(req.body?.model);
  const sheet    = validateSheet(req.body?.sheet);
  const file     = await fetchRemoteFile(req.body?.url);
  const parsed   = await parseFile(file, { sheet });
  const { rows, columns, sheetName, totalRows, isTabular, rawText, pages } = parsed;

  if (rows.length === 0 && !rawText) throw new AppError("File appears empty.", { status: 400, code: "empty_file" });
  const target = isTabular ? resolveTarget(validateTarget(req.body?.target), columns) : null;
  const includeColumns = validateColumns(req.body?.columns);

  const { stats, correlations, profile, evidence, analysis, activeColumns, excludedColumns } =
    await analyzeParsedFile(parsed, question, { apiKey, model, target, includeColumns });

  const body = {
    meta: { sheetName, sheets:parsed.sheets, totalRows, columns:columns.length, fileType:parsed.fileType, isTabular, pages,
      filename:file.originalname, size:file.size, model, sourceUrl:file.sourceUrl,
      target, activeColumns, excludedColumns, schemaVersion: ANALYSIS_SCHEMA_VERSION, evidenceEngine: EVIDENCE_ENGINE_VERSION,
      ...analysisRecord(req, startedAt, analysis) },
    stats, correlations, profile, evidence, analysis, chartData:isTabular ? rows.slice(0,100) : [], columns,
    rawText: isTabular ? null : (rawText||"").slice(0,2000),
  };
  body.analysisId = persistRequested(req.body?.save)
    ? await saveAnalysis({
        sessionId: validSessionId(req.get("x-ridge-session")), kind: "url",
        filename: file.originalname, fileType: parsed.fileType, model, question, payload: body,
      })
    : null;
  body.meta.saved = Boolean(body.analysisId);
  res.json(body);
});

router.post("/compare", rateLimit(), upload.array("files", 2), async (req, res) => {
  const startedAt = Date.now();
  if (!req.files || req.files.length !== 2) {
    throw new AppError("Comparison mode requires exactly two files: baseline first, current second.", { status: 400, code: "comparison_requires_two_files" });
  }
  assertAggregateUploadSize(req.files);
  const question = validateQuestion(req.body.question);
  const parsedFiles = await Promise.all(req.files.map((file) => parseFile(file)));
  const results = parsedFiles.map((parsed, index) => {
    if (!parsed.isTabular || parsed.columns.length === 0) {
      throw new AppError(`Comparison requires tabular files. "${req.files[index].originalname}" could not be read as a table.`, { status: 400, code: "comparison_requires_tabular" });
    }
    if (parsed.rows.length === 0) {
      throw new AppError(`"${req.files[index].originalname}" appears empty.`, { status: 400, code: "empty_file" });
    }
    const stats = computeStats(parsed.rows, parsed.columns);
    const profile = profileDataset(parsed.rows, parsed.columns);
    return {
      filename: req.files[index].originalname,
      meta: {
        filename: req.files[index].originalname,
        fileType: parsed.fileType,
        sheetName: parsed.sheetName,
        totalRows: parsed.totalRows,
        columns: parsed.columns.length,
        size: req.files[index].size,
      },
      columns: parsed.columns,
      stats,
      profile,
    };
  });
  const comparison = compareAnalyses(
    { ...results[0], rows: parsedFiles[0].rows },
    { ...results[1], rows: parsedFiles[1].rows },
  );
  const body = {
    kind: "comparison",
    meta: {
      filename: `${req.files[0].originalname} vs ${req.files[1].originalname}`,
      fileType: "comparison",
      schemaVersion: ANALYSIS_SCHEMA_VERSION,
      comparisonVersion: COMPARISON_VERSION,
      ...analysisRecord(req, startedAt, null),
    },
    files: results,
    comparison,
  };
  body.analysisId = persistRequested(req.body.save)
    ? await saveAnalysis({
        sessionId: validSessionId(req.get("x-ridge-session")), kind: "comparison",
        filename: body.meta.filename.slice(0, 200), fileType: "comparison", model: "deterministic", question, payload: body,
      })
    : null;
  body.meta.saved = Boolean(body.analysisId);
  res.json(body);
});

router.post("/analyze-multi", rateLimit(), upload.array("files", 10), async (req, res) => {
  const startedAt = Date.now();
  if (!req.files || req.files.length === 0) throw new AppError("No files uploaded.", { status: 400, code: "no_file" });
  assertAggregateUploadSize(req.files);
  const question = validateQuestion(req.body.question);
  const apiKey   = resolveApiKey(req, { required: false });
  const model    = resolveModel(req.body.model);
  // One target across files; files lacking that column produce untargeted
  // evidence rather than failing (see analyzeParsedFile).
  const target   = validateTarget(req.body.target);

  const fileResults = await Promise.all(req.files.map(async (file) => {
    try {
      const parsed = await parseFile(file);
      const { rows, columns, isTabular, rawText } = parsed;
      const { stats, correlations, profile, evidence, target: fileTarget, analysis } =
        await analyzeParsedFile(parsed, question, { apiKey, model, target });

      return {
        filename: file.originalname,
        fileType: parsed.fileType,
        meta: { sheetName:parsed.sheetName, totalRows:parsed.totalRows, columns:columns.length,
          fileType:parsed.fileType, isTabular, pages:parsed.pages, filename:file.originalname, size:file.size, model,
          target: fileTarget, schemaVersion: ANALYSIS_SCHEMA_VERSION, evidenceEngine: EVIDENCE_ENGINE_VERSION,
          ...analysisRecord(req, startedAt, analysis) },
        stats, correlations, profile, evidence, analysis,
        chartData: isTabular ? rows.slice(0,100) : [],
        columns,
        rawText: isTabular ? null : (rawText||"").slice(0,2000),
        error: null,
      };
    } catch (err) {
      return { filename: file.originalname, fileType: getFileType(file.originalname), error: normalizeError(err).message, meta:{}, stats:{}, correlations:[], evidence:[], analysis:null, chartData:[], columns:[] };
    }
  }));

  // "Successful" means the file parsed and produced deterministic results —
  // with no key supplied, every successful file simply has analysis: null.
  const successful = fileResults.filter(r => r.error === null);
  const aiAnalyzed = successful.filter(r => r.analysis !== null);
  let crossSummary = null;
  if (apiKey && aiAnalyzed.length > 1) {
    try {
      crossSummary = await runAnalysis({ apiKey, model, prompt: buildCrossSummaryPrompt(aiAnalyzed, question), schema: CROSS_SUMMARY_SCHEMA });
    } catch (err) {
      console.error("Cross-summary failed:", err.message);
    }
  }

  const body = { files: fileResults, crossSummary, totalFiles: req.files.length, successCount: successful.length };
  body.analysisId = successful.length > 0 && persistRequested(req.body.save)
    ? await saveAnalysis({
        sessionId: validSessionId(req.get("x-ridge-session")), kind: "multi",
        filename: req.files.map(f => f.originalname).join(", ").slice(0, 200),
        fileType: "multi", model, question, payload: body,
      })
    : null;
  body.saved = Boolean(body.analysisId);
  for (const result of fileResults) {
    if (result.meta) result.meta.saved = body.saved;
  }
  res.json(body);
});

export default router;
