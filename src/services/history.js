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

const DAY_MS = 86_400_000;

/**
 * The oldest `created_at` still inside the retention window, or null when
 * analyses are kept until they are deleted by hand.
 *
 * Expiry is enforced when rows are *read*, not by a scheduled sweep, so the
 * promise holds even where nothing is scheduled to run — a serverless
 * deployment has nowhere to put a cron. The sweep below is housekeeping for
 * storage size; this is what makes the guarantee true.
 */
export function retentionCutoff(now = Date.now()) {
  // Validated here rather than trusted from config: a negative window would put
  // the cutoff in the future and hide every saved analysis at once, so the
  // function that decides what is readable checks its own input.
  const days = Number(config.retentionDays);
  if (!Number.isFinite(days) || days <= 0) return null;
  return new Date(now - days * DAY_MS).toISOString();
}

/**
 * Drop this session's expired rows. Best-effort and never thrown from: an
 * analysis past the window is already unreadable, so failing to delete it is a
 * storage cost, not a disclosure.
 */
async function sweepExpired(sessionId) {
  const cutoff = retentionCutoff();
  if (!cutoff || !sessionId) return;
  try {
    await getClient().from("analyses").delete().eq("session_id", sessionId).lt("created_at", cutoff);
  } catch (err) {
    console.error("History sweep failed:", err.message);
  }
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
    await sweepExpired(sessionId);
    return data.id;
  } catch (err) {
    console.error("History save failed:", err.message);
    return null;
  }
}

export async function listAnalyses(sessionId) {
  const cutoff = retentionCutoff();
  let query = getClient()
    .from("analyses")
    .select("id, created_at, kind, filename, file_type, model, question")
    .eq("session_id", sessionId);
  if (cutoff) query = query.gte("created_at", cutoff);
  const { data, error } = await query
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw new AppError("Could not load history.", { status: 502, code: "history_unavailable" });
  return data;
}

export async function getAnalysis(id) {
  if (!UUID_RE.test(String(id))) {
    throw new AppError("Invalid analysis id.", { status: 400, code: "invalid_id" });
  }
  // An expired analysis is filtered in the query rather than after it, so a
  // share link to one is indistinguishable from a link to something that never
  // existed — the same 404, disclosing nothing about what was once there.
  const cutoff = retentionCutoff();
  let query = getClient()
    .from("analyses")
    .select("id, created_at, kind, filename, file_type, model, question, payload")
    .eq("id", id);
  if (cutoff) query = query.gte("created_at", cutoff);
  const { data, error } = await query.maybeSingle();
  if (error) throw new AppError("Could not load analysis.", { status: 502, code: "history_unavailable" });
  if (!data) throw new AppError("Analysis not found.", { status: 404, code: "not_found" });
  return data;
}

/**
 * Delete a saved analysis. Scoped to the session that saved it, so a share
 * link alone never grants deletion. Requires the session-scoped delete policy
 * (see docs/ARCHITECTURE.md); without it Supabase reports zero rows removed
 * and this surfaces as not_found rather than silently claiming success.
 */
export async function deleteAnalysis(id, sessionId) {
  if (!UUID_RE.test(String(id))) {
    throw new AppError("Invalid analysis id.", { status: 400, code: "invalid_id" });
  }
  if (!sessionId) {
    throw new AppError("A session id is required to delete an analysis.", { status: 400, code: "missing_session" });
  }
  const { data, error } = await getClient()
    .from("analyses")
    .delete()
    .eq("id", id)
    .eq("session_id", sessionId)
    .select("id");
  if (error) throw new AppError("Could not delete analysis.", { status: 502, code: "history_unavailable" });
  if (!data || data.length === 0) {
    throw new AppError("Analysis not found for this session.", { status: 404, code: "not_found" });
  }
  return true;
}
