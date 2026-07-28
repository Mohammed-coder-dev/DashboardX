import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config.js";
import { AppError } from "../errors.js";

export const SUPPORTED_MODELS = {
  "claude-opus-5":    "Claude Opus 5",
  "claude-sonnet-5":  "Claude Sonnet 5",
  "claude-haiku-4-5": "Claude Haiku 4.5",
};

export const DEFAULT_MODEL = "claude-opus-5";

export function resolveModel(raw) {
  if (raw === undefined || raw === null || raw === "") return DEFAULT_MODEL;
  if (typeof raw !== "string" || !SUPPORTED_MODELS[raw]) {
    throw new AppError(
      `Unsupported model. Choose one of: ${Object.keys(SUPPORTED_MODELS).join(", ")}.`,
      { status: 400, code: "unsupported_model" },
    );
  }
  return raw;
}

// The key is used for this one request and never stored or logged.
export function resolveApiKey(req) {
  const header = (req.get("x-anthropic-key") || "").trim();
  const key = header || config.anthropicApiKey;
  if (!key) {
    throw new AppError(
      "No API key. Add your Anthropic API key in Settings — it stays in your browser and is only forwarded with your requests.",
      { status: 401, code: "missing_api_key" },
    );
  }
  if (!key.startsWith("sk-ant-")) {
    throw new AppError(
      "That doesn't look like an Anthropic API key (expected it to start with sk-ant-).",
      { status: 400, code: "invalid_api_key_format" },
    );
  }
  return key;
}

function mapAnthropicError(err) {
  if (err instanceof Anthropic.AuthenticationError) {
    return new AppError("Anthropic rejected the API key. Check it in Settings.", { status: 401, code: "invalid_api_key" });
  }
  if (err instanceof Anthropic.PermissionDeniedError) {
    return new AppError("This API key does not have access to the selected model.", { status: 403, code: "model_not_allowed" });
  }
  if (err instanceof Anthropic.RateLimitError) {
    return new AppError("Your Anthropic account hit a rate limit. Wait a moment and try again.", { status: 429, code: "upstream_rate_limited" });
  }
  if (err instanceof Anthropic.BadRequestError) {
    return new AppError(`Anthropic rejected the request: ${err.message}`, { status: 400, code: "upstream_bad_request" });
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return new AppError("Could not reach the Anthropic API. Try again shortly.", { status: 502, code: "upstream_unreachable" });
  }
  if (err instanceof Anthropic.APIError) {
    return new AppError("The Anthropic API returned an error. Try again shortly.", { status: 502, code: "upstream_error" });
  }
  return err;
}

export async function runAnalysis({ apiKey, model, prompt, schema }) {
  // No SDK retries: analyze-multi awaits a file round plus a cross-summary
  // round, and 2 × 120 s must stay inside Vercel's 300 s function budget.
  const client = new Anthropic({ apiKey, timeout: 120_000, maxRetries: 0 });

  let response;
  try {
    response = await client.messages.create({
      model,
      max_tokens: 16000,
      output_config: { format: { type: "json_schema", schema } },
      messages: [{ role: "user", content: prompt }],
    });
  } catch (err) {
    throw mapAnthropicError(err);
  }

  if (response.stop_reason === "refusal") {
    throw new AppError("Claude declined to analyze this content.", { status: 422, code: "analysis_refused" });
  }
  if (response.stop_reason === "max_tokens") {
    throw new AppError("The analysis was too long to complete. Try a smaller file or a narrower question.", { status: 502, code: "analysis_truncated" });
  }

  const text = response.content.filter(b => b.type === "text").map(b => b.text).join("");
  try {
    return JSON.parse(text);
  } catch {
    throw new AppError("The model returned an unreadable analysis. Try again.", { status: 502, code: "analysis_unparseable" });
  }
}
