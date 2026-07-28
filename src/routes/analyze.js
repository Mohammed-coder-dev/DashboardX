import { Router } from "express";
import path from "path";
import multer from "multer";
import { ALLOWED_EXTENSIONS, getFileType, parseFile } from "../parsers/index.js";
import { computeStats } from "../analytics/stats.js";
import { computeCorrelations } from "../analytics/correlations.js";
import { buildTabularPrompt, buildTextPrompt, buildCrossSummaryPrompt } from "../prompts.js";
import { runAnalysis, resolveApiKey, resolveModel } from "../services/anthropic.js";
import { ANALYSIS_SCHEMA, CROSS_SUMMARY_SCHEMA } from "../schemas.js";
import { AppError } from "../errors.js";
import { rateLimit } from "../middleware/rateLimit.js";

const MAX_QUESTION_LENGTH = 2000;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    ALLOWED_EXTENSIONS.includes(ext)
      ? cb(null, true)
      : cb(new AppError(`Unsupported file type: ${ext}`, { status: 400, code: "unsupported_file_type" }));
  },
});

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
  const stats        = isTabular && columns.length > 1 ? computeStats(rows, columns) : {};
  const correlations = isTabular && columns.length > 1 ? computeCorrelations(rows, columns, stats) : [];
  const prompt       = isTabular && columns.length > 1
    ? buildTabularPrompt(columns, stats, correlations, rows, question)
    : buildTextPrompt(parsed.fileType, rawText || rows.map(r=>r.content).join("\n"), question);
  const analysis = await runAnalysis({ apiKey, model, prompt, schema: ANALYSIS_SCHEMA });
  return { stats, correlations, analysis };
}

const router = Router();

router.post("/analyze", rateLimit(), upload.single("file"), async (req, res) => {
  if (!req.file) throw new AppError("No file uploaded.", { status: 400, code: "no_file" });
  const question = validateQuestion(req.body.question);
  const apiKey   = resolveApiKey(req);
  const model    = resolveModel(req.body.model);
  const parsed   = await parseFile(req.file);
  const { rows, columns, sheetName, totalRows, isTabular, rawText, pages } = parsed;

  if (rows.length === 0 && !rawText) throw new AppError("File appears empty.", { status: 400, code: "empty_file" });

  const { stats, correlations, analysis } = await analyzeParsedFile(parsed, question, { apiKey, model });

  res.json({
    meta: { sheetName, totalRows, columns:columns.length, fileType:parsed.fileType, isTabular, pages, filename:req.file.originalname, size:req.file.size, model },
    stats, correlations, analysis, chartData:isTabular ? rows.slice(0,100) : [], columns,
    rawText: isTabular ? null : (rawText||"").slice(0,2000),
  });
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
      const { stats, correlations, analysis } = await analyzeParsedFile(parsed, question, { apiKey, model });

      return {
        filename: file.originalname,
        fileType: parsed.fileType,
        meta: { sheetName:parsed.sheetName, totalRows:parsed.totalRows, columns:columns.length,
          fileType:parsed.fileType, isTabular, pages:parsed.pages, filename:file.originalname, size:file.size, model },
        stats, correlations, analysis,
        chartData: isTabular ? rows.slice(0,100) : [],
        columns,
        rawText: isTabular ? null : (rawText||"").slice(0,2000),
        error: null,
      };
    } catch (err) {
      return { filename: file.originalname, fileType: getFileType(file.originalname), error: err.message, meta:{}, stats:{}, correlations:[], analysis:null, chartData:[], columns:[] };
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

  res.json({ files: fileResults, crossSummary, totalFiles: req.files.length, successCount: successful.length });
});

export default router;
