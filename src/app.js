import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import analyzeRouter from "./routes/analyze.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use(express.static(path.join(__dirname, "..", "public")));
  app.use("/api", analyzeRouter);
  return app;
}
