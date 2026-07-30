import { Router } from "express";
import { deleteAnalysis, historyEnabled, validSessionId, listAnalyses, getAnalysis } from "../services/history.js";
import { AppError } from "../errors.js";

const router = Router();

router.get("/history", async (req, res) => {
  if (!historyEnabled()) return res.json({ enabled: false, items: [] });
  const sessionId = validSessionId(req.query.session);
  if (!sessionId) return res.json({ enabled: true, items: [] });
  res.json({ enabled: true, items: await listAnalyses(sessionId) });
});

router.get("/analysis/:id", async (req, res) => {
  if (!historyEnabled()) throw new AppError("History is not configured.", { status: 404, code: "history_disabled" });
  res.json(await getAnalysis(req.params.id));
});

router.delete("/history/:id", async (req, res) => {
  if (!historyEnabled()) throw new AppError("History is not configured.", { status: 404, code: "history_disabled" });
  const sessionId = validSessionId(req.get("x-dx-session"));
  await deleteAnalysis(req.params.id, sessionId);
  res.json({ deleted: true });
});

export default router;
