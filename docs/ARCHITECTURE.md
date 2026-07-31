# Architecture

## The central decision

Everything numeric is computed **before** a language model is involved, and the
model never gets to add numbers. That ordering is the product, and it shapes
every layer below: `src/analytics/` is pure and fully unit-tested, the model
call is optional and lives behind a service, and the AI response is rendered in
visually distinct sections so a reader can always tell computed from generated.

## System overview

```
Browser (public/)                Vercel                     External
┌────────────────────┐  /api/*  ┌────────────────────┐   ┌──────────────────┐
│ /  the application │─────────▶│ api/index.js       │──▶│ Anthropic API    │
│ /about /privacy    │          │  Express (src/)    │   │ (optional, BYOK) │
│ /docs              │          │                    │   ├──────────────────┤
│ key: sessionStorage│◀─────────│ parse → analyze →  │──▶│ Supabase         │
│ dashboard render   │   JSON   │ evidence → [model] │   │ (opt-in history) │
└────────────────────┘          └────────────────────┘   └──────────────────┘
```

`public/` is served by the Vercel CDN; `/api/*` is rewritten to the Express
app. Locally, `server.js` serves both.

### Routes

| Route | Serves | Notes |
|---|---|---|
| `/` | `index.html` — landing page | Forwards to `/app` when the URL carries `?a=<id>`, so share links minted before the split still resolve |
| `/app` | `app.html` — analysis workspace | The product; drag-and-drop, evidence, exports |
| `/privacy` | `privacy.html` | What is stored, and when |
| `/docs` | `docs.html` | Using the app; links to repository docs |
| `/about` | — | 301 to `/`, which is the page it became |
| `/api/*` | Express | Rewritten to `api/index.js` in production |

## Layers

| Layer | Responsibility | Rule |
|---|---|---|
| `src/routes/` | Validate input, orchestrate, shape the response | No direct SDK or `fetch` calls |
| `src/services/` | Every external call: Anthropic, Supabase, remote fetch | The only place I/O happens |
| `src/analytics/` | Statistics, dates, correlations, evidence, sampling | Pure; no I/O; unit-tested |
| `src/parsers/` | Extension dispatch to xlsx / pdf / office / json / text | Pure given a buffer |
| `src/middleware/` | Security headers, rate limiting, error normalization | — |

## The analytics core

```
values.js        coercion — the single source of truth for "is this a number?"
  ├── stats.js         per-column profiles (numeric | categorical | date | empty)
  ├── dates.js         parsing, bucketing, trend, period-over-period, gaps
  ├── correlations.js  Pearson + Spearman over pairwise-complete observations
  ├── sample.js        deterministic representative row selection
  └── evidence.js      structured claims assembled from all of the above
profile.js       dataset-level quality grade and issue list
```

`values.js` exists because of a specific bug class. `Number(null)`,
`Number("")` and `Number("   ")` all return `0` in JavaScript, so any code that
reaches for `Number()` and filters with `isNaN` silently converts blanks into
real zeroes. Every numeric read in the engine goes through `toFiniteNumber`,
which returns `null` for absence and preserves a genuine zero. Nothing else may
call `Number()` on a cell.

Correlations filter **pairwise**: a row missing either side is dropped from
both series, so the two series always describe the same observations. Each
result carries `n`, coverage against all rows, the method used, a strength
class and caveats — a coefficient without a sample size is not a finding.

`evidence.js` assembles the findings a reader actually sees. Every claim is an
object with a method, sample size, coverage, strength and caveat, and strength
is bounded by support: a distribution over a mostly-empty column is either
weakened or not reported at all.

## Request pipeline

1. **Ingest** — multipart upload (4 MB **aggregate**, extension-whitelisted) or
   an https URL fetched by `services/remoteFile.js` (25 MB) with SSRF guards:
   private/loopback/link-local/CGNAT blocking, DNS re-check, manual redirect
   validation, streaming size cap.
2. **Parse** — `src/parsers/` dispatches by extension. Failures normalize to
   4xx `AppError`s.
3. **Analyze** — statistics, quality profile, correlations and evidence, all
   deterministic. **This is the response when no key is supplied.**
4. **Interpret (optional)** — only if a key accompanied the request:
   `services/anthropic.js` resolves the key (header → server fallback) and a
   whitelisted model, then calls the Messages API with an
   `output_config.format` JSON schema from `src/schemas.js`, so the analysis is
   guaranteed to parse. The prompt carries the computed evidence and a labelled
   representative sample, with instructions to explain rather than recompute.
5. **Persist (opt-in)** — only when the request explicitly set `save`.
   `services/history.js` writes to Supabase; failures never break the response.
6. **Render** — evidence cards, statistics, correlation bars and Chart.js
   charts. Every dynamic string passes through `esc()` before `innerHTML`.

## History schema

```sql
analyses (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz default now(),
  session_id  text,        -- anonymous browser session
  kind        text,        -- single | multi | url
  filename    text,
  file_type   text,
  model       text,
  question    text,
  payload     jsonb        -- the full API response body
)
```

Policies: insert and select for the anon role, plus **delete scoped to a
matching `session_id`** so a share link alone cannot delete. Rows are written
only when a request opts in.

```sql
create policy "delete own session rows" on analyses
  for delete using (session_id = current_setting('request.header.x-ridge-session', true));
```

Without that policy, `DELETE /api/history/:id` removes zero rows and correctly
reports `404 not_found` rather than claiming success.

## Versioning

Two version numbers travel with every response and every export:

- `schemaVersion` — the shape of the analysis payload.
- `evidenceEngine` — the semantics of evidence computation.

They move independently of the package version, so a stored analysis can always
be interpreted against the rules that produced it.

## Error model

Every failure is an `AppError { status, code, message }`, or is converted to one
by `normalizeError`. Clients receive `{ error, code }` and never a stack trace
or an upstream payload. Provider errors map to typed codes
(`invalid_api_key`, `upstream_rate_limited`, `analysis_truncated`, …).

## Security posture

Same-origin API with no CORS — open CORS would let any page spend a
deployment's fallback key. Strict CSP with no inline script; the single CDN
script is SRI-pinned. Rate limits are per IP per warm instance. Details and the
full threat model: [../SECURITY.md](../SECURITY.md).
