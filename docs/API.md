# API reference

Base path `/api`. Same-origin only — no CORS. Every failure returns
`{ "error": string, "code": string }` with an appropriate status; internals and
stack traces never reach the client.

## Authentication

Optional. Send `x-anthropic-key: sk-ant-...` to enable AI features. Endpoints
that only compute deterministic results work without it. Endpoints that exist to
call the model (`/ask`, `/explain`) return `401 missing_api_key` without one.

A malformed key is rejected with `400 invalid_api_key_format` before any
provider call, rather than being silently ignored.

## Session header

`x-ridge-session: <8-64 url-safe chars>` groups saved analyses. Only required
when opting into persistence or deleting a saved analysis.

---

## `GET /health`

```json
{
  "status": "ok",
  "serverKey": false,
  "models": [{ "id": "claude-sonnet-5", "label": "Claude Sonnet 5", "note": "balanced capability, speed and cost" }],
  "defaultModel": "claude-sonnet-5"
}
```

`serverKey` reports whether the deployment has a fallback key configured. It
never returns the key.

---

## `POST /analyze`

`multipart/form-data`, one `file`. Runs the deterministic pipeline; adds AI
interpretation only when a key is present.

| Field | Type | Notes |
|---|---|---|
| `file` | file | Required. See supported extensions in the README. |
| `question` | string | Optional, ≤ 2000 chars. |
| `model` | string | Optional; one of the ids from `/health`. |
| `sheet` | string | Optional worksheet name, ≤ 128 chars. |
| `target` | string | Optional column to focus evidence on. Must exist in the file. |
| `save` | `"true"` \| `"false"` | Optional. **Persistence happens only when explicitly true.** |

Response:

```jsonc
{
  "meta": {
    "filename": "team-sales.csv", "totalRows": 91, "columns": 7,
    "fileType": "spreadsheet", "isTabular": true, "sheetName": "Sheet1",
    "sheets": ["Sheet1"], "model": "claude-sonnet-5",
    "aiIncluded": false,        // whether an AI interpretation is present
    "target": "revenue",        // echoed back, or null
    "saved": false,             // whether this response was persisted
    "requestId": "92a...",      // also returned in the X-Request-ID header
    "generatedAt": "2026-08-01T18:30:00.000Z",
    "processingMs": 42,
    "schemaVersion": "2.3", "evidenceEngine": "1.0.0"
  },
  "stats": { "revenue": { "type": "numeric", "validCount": 90, "missing": 1, "invalid": 0,
                          "coverage": 98.9, "min": 100, "max": 4980, "mean": 0, "median": 0,
                          "std": 0, "quantiles": {},
                          "histogram": { "method": "iqr-tail-aware", "bins": [] }, "outliers": {} } },
  "correlations": [ { "columnA": "revenue", "columnB": "spend", "method": "spearman",
                      "coefficient": 0.9068, "pearson": -0.0895, "spearman": 0.9068,
                      "n": 90, "coverage": 98.9, "strength": "very strong",
                      "smallSample": false, "caveat": "..." } ],
  "profile":  { "healthGrade": "B", "healthScore": 87, "issues": [] },
  "evidence": [ { "claim": "...", "metric": "spearman_rho", "value": 0.9068,
                  "columns": ["revenue","spend"], "method": "...", "sampleSize": 90,
                  "coverage": 98.9, "strength": "very strong", "caveat": null,
                  "engineVersion": "1.0.0" } ],
  "analysis": null,             // null unless a key was supplied
  "chartData": [],              // up to 100 rows for client-side charts
  "columns": ["date","region"],
  "rawText": null,              // document excerpt for non-tabular files
  "analysisId": null            // uuid when saved, else null
}
```

Errors: `no_file`, `unsupported_file_type`, `upload_too_large` (413),
`empty_file`, `invalid_sheet`, `invalid_target`, `unknown_target`,
`question_too_long`, `unsupported_model`, `invalid_api_key_format`.
Every API response includes an `X-Request-ID` header. JSON error bodies echo it
as `requestId` so an operator can correlate a user-visible failure without
logging file contents, questions, or API keys.

---

## `POST /analyze-url`

`application/json`. Same response shape. Fetches the file server-side, so the
4 MB request cap does not apply — remote files may be up to 25 MB.

```json
{ "url": "https://example.com/data.xlsx", "question": "", "model": "",
  "sheet": "Q1", "target": "revenue", "save": false }
```

Only `https://` is accepted. Private, loopback, link-local and CGNAT addresses
are rejected before and after DNS resolution and at every redirect hop.

---

## `POST /analyze-multi`

`multipart/form-data`, up to 10 `files`. **The aggregate size of all files must
stay under 4 MB**, enforced independently of the per-file limit.

```jsonc
{
  "files": [ /* one analyze-shaped result per file, with `error` set on failures */ ],
  "crossSummary": null,   // AI cross-file synthesis; requires a key and 2+ AI-analyzed files
  "totalFiles": 3, "successCount": 3,
  "analysisId": null, "saved": false
}
```

A file that fails to parse does not fail the batch; its entry carries `error`.

---

## `POST /compare`

`multipart/form-data`, exactly two tabular `files`. The first file is the
baseline and the second is the current version. The endpoint is deterministic
and never invokes an AI provider; an API key is neither required nor used.

```jsonc
{
  "kind": "comparison",
  "meta": { "comparisonVersion": "1.0.0", "schemaVersion": "2.3", "saved": false },
  "files": [ /* compact deterministic profile for each file */ ],
  "comparison": {
    "deterministic": true,
    "labels": { "baseline": "june.csv", "current": "july.csv" },
    "summary": { "rowDelta": 120, "healthScoreDelta": 4, "sharedColumns": 8 },
    "schema": { "added": [], "removed": [], "shared": [], "typeChanges": [] },
    "quality": { "baseline": {}, "current": {}, "deltas": {} },
    "columns": [ /* numeric, categorical, and date descriptive deltas */ ],
    "findings": [ /* thresholded, deterministic material changes */ ]
  },
  "analysisId": null
}
```

Set `save=true` to opt into persistence. Errors include
`comparison_requires_two_files` and `comparison_requires_tabular`.

---

## `POST /explain` — requires a key

Adds AI interpretation to results the deterministic pipeline already produced,
so a keyless analysis can be explained without re-uploading.

```json
{ "model": "", "question": "",
  "context": { "filename": "", "fileType": "spreadsheet", "columns": [],
               "stats": {}, "correlations": [], "evidence": [], "profile": {},
               "sampleRows": [], "rawText": "" } }
```

Returns `{ "analysis": { ... }, "model": "claude-sonnet-5" }`. Context is
size-capped per part; oversized parts degrade rather than inflating token spend.

---

## `POST /ask` — requires a key

Follow-up question against an already-analyzed dataset.

```json
{ "question": "Why did June rise?", "model": "",
  "priorQA": [{ "q": "...", "a": "..." }],
  "context": { "columns": ["revenue"], "stats": {}, "correlations": [] } }
```

Returns `{ "answer": string, "model": string }`. Errors: `missing_question`,
`invalid_context`, `missing_api_key`.

---

## History — only when Supabase is configured

| Endpoint | Behaviour |
|---|---|
| `GET /history?session=<id>` | `{ enabled, items[] }`. Returns `{ enabled: false, items: [] }` when unconfigured. |
| `GET /analysis/:id` | One saved analysis by uuid. `404 not_found` if absent, `400 invalid_id` if malformed. |
| `DELETE /history/:id` | Deletes a saved analysis. Requires `x-ridge-session` matching the session that saved it; a share link alone does not grant deletion. |

---

## Rate limits

Per IP, per warm instance, in memory.

| Endpoint group | Default | Override |
|---|---|---|
| `/analyze*` | 10/min | `RATE_LIMIT_POINTS` |
| `/ask`, `/explain` | 20/min | `RATE_LIMIT_ASK_POINTS` |

Exceeding a limit returns `429 rate_limited` with a `Retry-After` header.
