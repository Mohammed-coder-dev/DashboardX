import { createClient } from "@supabase/supabase-js";
import { config } from "../config.js";
import { AppError } from "../errors.js";

const SESSION_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let client = null;

export function historyEnabled() {
  return Boolean(config.supabaseUrl && config.supabaseKey);
}

function getClient() {
  if (!client) client = createClient(config.supabaseUrl, config.supabaseKey, { auth: { persistSession: false } });
  return client;
}

export function validSessionId(raw) {
  return typeof raw === "string" && SESSION_ID_RE.test(raw) ? raw : null;
}

// History is best-effort: a storage failure must never break the analysis
// the user just paid for, so this returns null instead of throwing.
export async function saveAnalysis({ sessionId, kind, filename, fileType, model, question, payload }) {
  if (!historyEnabled() || !sessionId) return null;
  try {
    const { data, error } = await getClient()
      .from("analyses")
      .insert({ session_id: sessionId, kind, filename, file_type: fileType, model, question: question || null, payload })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return data.id;
  } catch (err) {
    console.error("History save failed:", err.message);
    return null;
  }
}

export async function listAnalyses(sessionId) {
  const { data, error } = await getClient()
    .from("analyses")
    .select("id, created_at, kind, filename, file_type, model, question")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw new AppError("Could not load history.", { status: 502, code: "history_unavailable" });
  return data;
}

export async function getAnalysis(id) {
  if (!UUID_RE.test(String(id))) {
    throw new AppError("Invalid analysis id.", { status: 400, code: "invalid_id" });
  }
  const { data, error } = await getClient()
    .from("analyses")
    .select("id, created_at, kind, filename, file_type, model, question, payload")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new AppError("Could not load analysis.", { status: 502, code: "history_unavailable" });
  if (!data) throw new AppError("Analysis not found.", { status: 404, code: "not_found" });
  return data;
}
