import dotenv from "dotenv";

dotenv.config();

export const config = {
  port: Number(process.env.PORT) || 3000,
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || null,
  supabaseUrl: process.env.SUPABASE_URL || null,
  supabaseKey: process.env.SUPABASE_KEY || null,
};
