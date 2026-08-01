import { normalizeError } from "../errors.js";

export function errorHandler(err, req, res, next) {
  const normalized = normalizeError(err);
  if (normalized.status >= 500) console.error(`[${req.requestId}]`, err);
  res.status(normalized.status).json({
    error: normalized.message,
    code: normalized.code,
    requestId: req.requestId,
  });
}

export function notFound(req, res) {
  res.status(404).json({ error: "Not found.", code: "not_found", requestId: req.requestId });
}
