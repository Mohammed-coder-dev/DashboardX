import { normalizeError } from "../errors.js";

export function errorHandler(err, req, res, next) {
  const normalized = normalizeError(err);
  if (normalized.status >= 500) console.error(err);
  res.status(normalized.status).json({ error: normalized.message, code: normalized.code });
}

export function notFound(req, res) {
  res.status(404).json({ error: "Not found.", code: "not_found" });
}
