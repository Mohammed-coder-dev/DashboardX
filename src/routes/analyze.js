import { Router } from "express";
import path from "path";
import multer from "multer";
import { ALLOWED_EXTENSIONS, getFileType, parseFile } from "../parsers/index.js";
import { computeStats } from "../analytics/stats.js";
import { computeCorrelations } from "../analytics/correlations.js";
import { buildTabularPrompt, buildTextPrompt, buildCrossSummaryPrompt } from "../prompts.js";
import { callClaude } from "../services/anthropic.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    ALLOWED_EXTENSIONS.includes(ext) ? cb(null, true) : cb(new Error(`Unsupported file type: ${ext}`));
  },
});

async function analyzeParsedFile(parsed, question) {
  const { rows, columns, isTabular, rawText } = parsed;
  const stats        = isTabular && columns.length > 1 ? computeStats(rows, columns) : {};
  const correlations = isTabular && columns.length > 1 ? computeCorrelations(rows, columns, stats) : [];
  const prompt       = isTabular && columns.length > 1
    ? buildTabularPrompt(columns, stats, correlations, rows, question)
    : buildTextPrompt(parsed.fileType, rawText || rows.map(r=>r.content).join("\n"), question);
  const analysis = await callClaude(prompt);
  return { stats, correlations, analysis };
}

const router = Router();

router.post("/analyze", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded." });
    const question = req.body.question || "";
    const parsed   = await parseFile(req.file);
    const { rows, columns, sheetName, totalRows, isTabular, rawText, pages } = parsed;

    if (rows.length === 0 && !rawText) return res.status(400).json({ error: "File appears empty." });

    const { stats, correlations, analysis } = await analyzeParsedFile(parsed, question);

    res.json({
      meta: { sheetName, totalRows, columns:columns.length, fileType:parsed.fileType, isTabular, pages, filename:req.file.originalname, size:req.file.size },
      stats, correlations, analysis, chartData:isTabular ? rows.slice(0,100) : [], columns,
      rawText: isTabular ? null : (rawText||"").slice(0,2000),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || "Analysis failed." });
  }
});

router.post("/analyze-multi", upload.array("files", 10), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) return res.status(400).json({ error: "No files uploaded." });
    if (req.files.length > 10) return res.status(400).json({ error: "Maximum 10 files allowed." });

    const question = req.body.question || "";

    const fileResults = await Promise.all(req.files.map(async (file) => {
      try {
        const parsed = await parseFile(file);
        const { rows, columns, isTabular, rawText } = parsed;
        const { stats, correlations, analysis } = await analyzeParsedFile(parsed, question);

        return {
          filename: file.originalname,
          fileType: parsed.fileType,
          meta: { sheetName:parsed.sheetName, totalRows:parsed.totalRows, columns:columns.length,
            fileType:parsed.fileType, isTabular, pages:parsed.pages, filename:file.originalname, size:file.size },
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
        crossSummary = await callClaude(buildCrossSummaryPrompt(successful, question));
      } catch (err) {
        console.error("Cross-summary failed:", err);
      }
    }

    res.json({ files: fileResults, crossSummary, totalFiles: req.files.length, successCount: successful.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || "Multi-file analysis failed." });
  }
});

export default router;
