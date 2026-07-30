import { Router } from "express";
import { config } from "../config.js";
import { SUPPORTED_MODELS, DEFAULT_MODEL } from "../services/anthropic.js";

const router = Router();

router.get("/health", (req, res) => {
  res.json({
    status: "ok",
    serverKey: Boolean(config.anthropicApiKey),
    models: Object.entries(SUPPORTED_MODELS).map(([id, m]) => ({ id, label: m.label, note: m.note })),
    defaultModel: DEFAULT_MODEL,
  });
});

export default router;
