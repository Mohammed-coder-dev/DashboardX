import dotenv from "dotenv";

dotenv.config();

export const config = {
  port: Number(process.env.PORT) || 3000,
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || null,
  supabaseUrl: process.env.SUPABASE_URL || null,
  supabaseKey: process.env.SUPABASE_KEY || null,
  // Requests per minute per IP, per warm instance. Tunable so operators can
  // match their traffic and so the test suite can exercise many endpoints
  // without tripping the limiter.
  rateLimitPoints: Number(process.env.RATE_LIMIT_POINTS) || 10,
  rateLimitAskPoints: Number(process.env.RATE_LIMIT_ASK_POINTS) || 20,
  // How long a saved analysis stays readable, in days. Unset means kept until
  // the person who saved it deletes it, which is the behaviour every existing
  // deployment already has — an operator opts into expiry, they do not have it
  // applied to their stored rows by an upgrade.
  retentionDays: Number(process.env.RETENTION_DAYS) > 0 ? Number(process.env.RETENTION_DAYS) : null,
};
