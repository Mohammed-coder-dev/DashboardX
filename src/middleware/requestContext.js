import { randomUUID } from "node:crypto";

const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;

/** Attach a safe correlation ID to every response and downstream error. */
export function requestContext(req, res, next) {
  const supplied = req.get("x-request-id");
  const requestId = typeof supplied === "string" && REQUEST_ID_PATTERN.test(supplied)
    ? supplied
    : randomUUID();
  req.requestId = requestId;
  res.set("X-Request-ID", requestId);
  next();
}
