import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import analyzeRouter from "./routes/analyze.js";
import askRouter from "./routes/ask.js";
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
  // The landing page is the root; the analysis workspace lives at /app.
  // Shared analyses were previously handed out as `/?a=<id>` links, so a root
  // request carrying an analysis id forwards to the workspace with the query
  // intact rather than stranding the visitor on marketing copy.
  app.get("/", (req, res, next) => {
    const query = req.originalUrl.includes("?") ? req.originalUrl.slice(req.originalUrl.indexOf("?")) : "";
    if (req.query.a) return res.redirect(302, `/app${query}`);
    return next();
  });
  // /about was the product explanation before it became the landing page.
  app.get(["/about", "/about.html"], (req, res) => res.redirect(301, "/"));
  // extensions lets /about, /privacy and /docs resolve to their .html files
  // locally, matching Vercel's cleanUrls behavior in production.
  app.use(express.static(path.join(__dirname, "..", "public"), { extensions: ["html"] }));
  app.use("/api", healthRouter);
  app.use("/api", historyRouter);
  app.use("/api", analyzeRouter);
  app.use("/api", askRouter);
  app.use("/api", notFound);
  app.use(errorHandler);
  return app;
}
