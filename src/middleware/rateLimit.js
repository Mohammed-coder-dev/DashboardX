import { RateLimiterMemory } from "rate-limiter-flexible";
import { AppError } from "../errors.js";

// Per-instance in-memory limiter: on serverless each instance keeps its own
// counters, so this bounds abuse per warm instance rather than globally.
const analyzeLimiter = new RateLimiterMemory({ points: 10, duration: 60 });

export function rateLimit(limiter = analyzeLimiter) {
  return async (req, res, next) => {
    try {
      await limiter.consume(req.ip || "unknown");
      next();
    } catch (rejection) {
      res.set("Retry-After", String(Math.max(1, Math.ceil((rejection.msBeforeNext || 60000) / 1000))));
      next(new AppError("Too many requests — try again in a minute.", { status: 429, code: "rate_limited" }));
    }
  };
}
