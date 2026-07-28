import { Router } from "express";
import path from "path";
import multer from "multer";
import { ALLOWED_EXTENSIONS, getFileType, parseFile } from "../parsers/index.js";
import { computeStats } from "../analytics/stats.js";
import { computeCorrelations } from "../analytics/correlations.js";
import { profileDataset, profileSummaryForPrompt } from "../analytics/profile.js";
import { buildTabularPrompt, buildTextPrompt, buildCrossSummaryPrompt } from "../prompts.js";
import { runAnalysis, resolveApiKey, resolveModel } from "../services/anthropic.js";
import { ANALYSIS_SCHEMA, CROSS_SUMMARY_SCHEMA } from "../schemas.js";
import { fetchRemoteFile } from "../services/remoteFile.js";
import { saveAnalysis, validSessionId } from "../services/history.js";
import { AppError, normalizeError } from "../errors.js";
import { rateLimit } from "../middleware/rateLimit.js";

const MAX_QUESTION_LENGTH = 2000;

// Vercel rejects serverless request bodies over ~4.5 MB before the function
// runs, so the upload cap must sit under that; larger files go through the
// URL path, which fetches server-side and allows 25 MB.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 4 * 1024 * 1024 },
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

async function analyzeParsedFile(parsed, question, { apiKey, model }) {
  const { rows, columns, isTabular, rawText } = parsed;
  // columns.length > 0, not > 1: a single-column sheet is still tabular —
  // the old > 1 check routed it to the text prompt, whose r.content lookup
  // came back undefined for every row and produced an empty prompt.
  const tabular      = isTabular && columns.length > 0;
  const stats        = tabular ? computeStats(rows, columns) : {};
  const correlations = tabular ? computeCorrelations(rows, columns, stats) : [];
  const profile      = tabular ? profileDataset(rows, columns) : null;
  const fallbackText = rawText || rows.map(r => typeof r.content === "string" ? r.content : JSON.stringify(r)).join("\n");
  const prompt       = tabular
    ? buildTabularPrompt(columns, stats, correlations, rows, question, profileSummaryForPrompt(profile))
    : buildTextPrompt(parsed.fileType, fallbackText, question);
  const analysis = await runAnalysis({ apiKey, model, prompt, schema: ANALYSIS_SCHEMA });
  return { stats, correlations, profile, analysis };
}

const router = Router();

router.post("/analyze", rateLimit(), upload.single("file"), async (req, res) => {
  if (!req.file) throw new AppError("No file uploaded.", { status: 400, code: "no_file" });
  const question = validateQuestion(req.body.question);
  const apiKey   = resolveApiKey(req);
  const model    = resolveModel(req.body.model);
  const sheet    = validateSheet(req.body.sheet);
  const parsed   = await parseFile(req.file, { sheet });
  const { rows, columns, sheetName, totalRows, isTabular, rawText, pages } = parsed;

  if (rows.length === 0 && !rawText) throw new AppError("File appears empty.", { status: 400, code: "empty_file" });

  const { stats, correlations, profile, analysis } = await analyzeParsedFile(parsed, question, { apiKey, model });

  const body = {
    meta: { sheetName, sheets:parsed.sheets, totalRows, columns:columns.length, fileType:parsed.fileType, isTabular, pages, filename:req.file.originalname, size:req.file.size, model },
    stats, correlations, profile, analysis, chartData:isTabular ? rows.slice(0,100) : [], columns,
    rawText: isTabular ? null : (rawText||"").slice(0,2000),
  };
  body.analysisId = await saveAnalysis({
    sessionId: validSessionId(req.get("x-dx-session")), kind: "single",
    filename: req.file.originalname, fileType: parsed.fileType, model, question, payload: body,
  });
  res.json(body);
});

router.post("/analyze-url", rateLimit(), async (req, res) => {
  const question = validateQuestion(req.body?.question);
  const apiKey   = resolveApiKey(req);
  const model    = resolveModel(req.body?.model);
  const sheet    = validateSheet(req.body?.sheet);
  const file     = await fetchRemoteFile(req.body?.url);
  const parsed   = await parseFile(file, { sheet });
  const { rows, columns, sheetName, totalRows, isTabular, rawText, pages } = parsed;

  if (rows.length === 0 && !rawText) throw new AppError("File appears empty.", { status: 400, code: "empty_file" });

  const { stats, correlations, profile, analysis } = await analyzeParsedFile(parsed, question, { apiKey, model });

  const body = {
    meta: { sheetName, sheets:parsed.sheets, totalRows, columns:columns.length, fileType:parsed.fileType, isTabular, pages,
      filename:file.originalname, size:file.size, model, sourceUrl:file.sourceUrl },
    stats, correlations, profile, analysis, chartData:isTabular ? rows.slice(0,100) : [], columns,
    rawText: isTabular ? null : (rawText||"").slice(0,2000),
  };
  body.analysisId = await saveAnalysis({
    sessionId: validSessionId(req.get("x-dx-session")), kind: "url",
    filename: file.originalname, fileType: parsed.fileType, model, question, payload: body,
  });
  res.json(body);
});

router.post("/analyze-multi", rateLimit(), upload.array("files", 10), async (req, res) => {
  if (!req.files || req.files.length === 0) throw new AppError("No files uploaded.", { status: 400, code: "no_file" });
  const question = validateQuestion(req.body.question);
  const apiKey   = resolveApiKey(req);
  const model    = resolveModel(req.body.model);

  const fileResults = await Promise.all(req.files.map(async (file) => {
    try {
      const parsed = await parseFile(file);
      const { rows, columns, isTabular, rawText } = parsed;
      const { stats, correlations, profile, analysis } = await analyzeParsedFile(parsed, question, { apiKey, model });

      return {
        filename: file.originalname,
        fileType: parsed.fileType,
        meta: { sheetName:parsed.sheetName, totalRows:parsed.totalRows, columns:columns.length,
          fileType:parsed.fileType, isTabular, pages:parsed.pages, filename:file.originalname, size:file.size, model },
        stats, correlations, profile, analysis,
        chartData: isTabular ? rows.slice(0,100) : [],
        columns,
        rawText: isTabular ? null : (rawText||"").slice(0,2000),
        error: null,
      };
    } catch (err) {
      return { filename: file.originalname, fileType: getFileType(file.originalname), error: normalizeError(err).message, meta:{}, stats:{}, correlations:[], analysis:null, chartData:[], columns:[] };
    }
  }));

  const successful = fileResults.filter(r => r.analysis !== null);
  let crossSummary = null;
  if (successful.length > 1) {
    try {
      crossSummary = await runAnalysis({ apiKey, model, prompt: buildCrossSummaryPrompt(successful, question), schema: CROSS_SUMMARY_SCHEMA });
    } catch (err) {
      console.error("Cross-summary failed:", err.message);
    }
  }

  const body = { files: fileResults, crossSummary, totalFiles: req.files.length, successCount: successful.length };
  if (successful.length > 0) {
    body.analysisId = await saveAnalysis({
      sessionId: validSessionId(req.get("x-dx-session")), kind: "multi",
      filename: req.files.map(f => f.originalname).join(", ").slice(0, 200),
      fileType: "multi", model, question, payload: body,
    });
  }
  res.json(body);
});

export default router;
