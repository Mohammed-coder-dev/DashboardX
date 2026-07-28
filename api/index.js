import { createApp } from "../src/app.js";

// Vercel serverless entry: every /api/* request is rewritten here
// (vercel.json), while public/ is served by the CDN.
export default createApp();
