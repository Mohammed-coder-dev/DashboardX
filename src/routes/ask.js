import { Router } from "express";
import { RateLimiterMemory } from "rate-limiter-flexible";
import { runFollowUp, resolveApiKey, resolveModel } from "../services/anthropic.js";
import { buildFollowUpPrompt } from "../prompts.js";
import { profileSummaryForPrompt } from "../analytics/profile.js";
import { rateLimit } from "../middleware/rateLimit.js";
import { AppError } from "../errors.js";
import { validateQuestion } from "./analyze.js";

// Follow-ups are cheaper than full analyses, so they get their own
// more generous limiter.
const askLimiter = new RateLimiterMemory({ points: 20, duration: 60 });

export function validateContext(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new AppError("Missing dataset context.", { status: 400, code: "invalid_context" });
  }
  const columns = Array.isArray(raw.columns) ? raw.columns.slice(0, 200).map(String) : [];
  const rawText = typeof raw.rawText === "string" ? raw.rawText.slice(0, 4000) : "";
  if (columns.length === 0 && !rawText) {
    throw new AppError("Context must include the dataset columns or a document excerpt.", { status: 400, code: "invalid_context" });
  }
  return {
    filename: typeof raw.filename === "string" ? raw.filename.slice(0, 200) : "dataset",
    columns,
    stats: raw.stats && typeof raw.stats === "object" && !Array.isArray(raw.stats) ? raw.stats : {},
    correlations: Array.isArray(raw.correlations) ? raw.correlations.slice(0, 10) : [],
    profile: raw.profile && typeof raw.profile === "object" && !Array.isArray(raw.profile) ? raw.profile : null,
    sampleRows: Array.isArray(raw.sampleRows) ? raw.sampleRows.slice(0, 20) : [],
    rawText,
  };
}

export function validatePriorQA(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.slice(-6)
    .map(p => ({ q: String(p?.q ?? "").slice(0, 2000), a: String(p?.a ?? "").slice(0, 4000) }))
    .filter(p => p.q && p.a);
}

const router = Router();

router.post("/ask", rateLimit(askLimiter), async (req, res) => {
  const question = validateQuestion(req.body?.question);
  if (!question) throw new AppError("Ask a question about the data.", { status: 400, code: "missing_question" });
  const apiKey  = resolveApiKey(req);
  const model   = resolveModel(req.body?.model);
  const context = validateContext(req.body?.context);
  const priorQA = validatePriorQA(req.body?.priorQA);

  let profileSummary = null;
  if (context.profile) {
    try { profileSummary = profileSummaryForPrompt(context.profile); } catch { profileSummary = null; }
  }

  const answer = await runFollowUp({
    apiKey, model,
    prompt: buildFollowUpPrompt({ ...context, profileSummary }, question, priorQA),
  });
  res.json({ answer, model });
});

export default router;
