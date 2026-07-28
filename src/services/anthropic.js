import { config } from "../config.js";

export async function callClaude(prompt) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type":"application/json", "x-api-key":config.anthropicApiKey, "anthropic-version":"2023-06-01" },
    body: JSON.stringify({ model:"claude-sonnet-4-20250514", max_tokens:2500, messages:[{ role:"user", content:prompt }] }),
  });
  const data  = await response.json();
  const raw   = data.content?.map(b => b.text||"").join("") || "";
  const clean = raw.replace(/```json\n?|```\n?/g, "").trim();
  return JSON.parse(clean);
}
