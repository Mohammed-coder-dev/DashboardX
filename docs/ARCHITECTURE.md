# Architecture

## System overview

```
Browser (public/)                Vercel                    External
┌──────────────────┐   /api/*  ┌──────────────────┐   ┌──────────────────┐
│ upload / URL /   │──────────▶│ api/index.js     │──▶│ Anthropic API    │
│ question / model │           │  Express (src/)  │   │ (user's own key) │
│ key in localStorage          │                  │   ├──────────────────┤
│ dashboard render │◀──────────│ parse → stats →  │──▶│ Supabase         │
└──────────────────┘   JSON    │ prompt → Claude  │   │ (history table)  │
                               └──────────────────┘   └──────────────────┘
```

`public/` is served by the Vercel CDN; every `/api/*` request is rewritten
to the Express app. Locally, `server.js` serves both.

## Data pipeline

1. **Ingest** — multipart upload (25 MB, extension-whitelisted) or an
   https URL fetched by `services/remoteFile.js` with SSRF guards
   (private-address blocking, DNS re-check, manual redirect validation,
   streaming size cap).
2. **Parse** — `src/parsers/` dispatches by extension to xlsx/csv, JSON
   (arrays and flattened objects), plain text, pdf2json, or officeparser.
   All parse failures normalize to 4xx AppErrors.
3. **Analyze** — `src/analytics/` computes per-column descriptive stats
   and Pearson correlations (pure, unit-tested).
4. **LLM** — `services/anthropic.js` resolves the key (header → server
   fallback) and a whitelisted model, then calls the Messages API with
   `output_config.format` JSON schemas from `src/schemas.js`, so the
   analysis is guaranteed to parse. Upstream failures map to typed
   AppErrors; refusals and truncation are handled explicitly.
5. **Persist** — `services/history.js` saves the response payload to the
   Supabase `analyses` table keyed by an anonymous browser session id.
   Best-effort: failures never break the analysis response.
6. **Render** — the frontend draws stats cards, correlation bars, and
   Chart.js charts from the model's chart specs. All dynamic strings are
   HTML-escaped.

## History schema

```sql
analyses (
  id uuid pk default gen_random_uuid(),
  created_at timestamptz default now(),
  session_id text,          -- anonymous browser session
  kind text,                -- single | multi | url
  filename text, file_type text, model text, question text,
  payload jsonb             -- the full API response body
)
-- RLS: insert/select only (immutable rows); key stays server-side.
```

## Error model

Every failure is an `AppError { status, code, message }` or is converted
to one by `normalizeError` — clients always receive `{ error, code }`
and internals never leak. Analysis endpoints are rate-limited per IP.
