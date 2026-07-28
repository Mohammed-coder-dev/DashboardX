import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import analyzeRouter from "./routes/analyze.js";
import healthRouter from "./routes/health.js";
import historyRouter from "./routes/history.js";
import { securityHeaders } from "./middleware/security.js";
import { errorHandler, notFound } from "./middleware/errorHandler.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

export function createApp() {
  const app = express();
  app.set("trust proxy", 1);
  app.disable("x-powered-by");
  app.use(securityHeaders);
  // No CORS middleware: the API is same-origin only. Open CORS would let any
  // web page spend the server-side fallback Anthropic key from a visitor's
  // browser.
  app.use(express.json({ limit: "1mb" }));
  app.use(express.static(path.join(__dirname, "..", "public")));
  app.use("/api", healthRouter);
  app.use("/api", historyRouter);
  app.use("/api", analyzeRouter);
  app.use("/api", notFound);
  app.use(errorHandler);
  return app;
}
