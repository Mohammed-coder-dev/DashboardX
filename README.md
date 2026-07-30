# Ridge

[![CI](https://github.com/MohammedAlkindi/Ridge/actions/workflows/ci.yml/badge.svg)](https://github.com/MohammedAlkindi/Ridge/actions/workflows/ci.yml)

An analyst's read on any spreadsheet. Upload a file — or paste a link to
one — and get a grounded dashboard back: a deterministic data-quality
grade, statistics, correlations, charts, written insights, and follow-up
answers. Bring your own Anthropic API key; nothing is stored server-side.

**Live demo:** [ridge-data.vercel.app](https://ridge-data.vercel.app)

## What it does

Ridge parses spreadsheets (`.xlsx`, `.xls`, `.csv` — including
multi-sheet workbooks with a sheet picker), documents (`.pdf`, `.docx`,
`.pptx`), and structured text (`.json`, `.txt`, `.md`). It profiles the
data deterministically (missingness, type consistency, IQR outliers,
duplicates, a weighted health grade), computes descriptive statistics and
Pearson correlations, then asks Claude for schema-guaranteed JSON insights
grounded in those numbers. Finished dashboards take follow-up questions
against the same context. Up to 10 files analyze at once with a cross-file
synthesis.

## Architecture

```
public/          landing (index.html) + app (/app) — vanilla JS + Chart.js
api/index.js     Vercel serverless entry — all /api/* requests land here
server.js        local entry (node server.js)
src/
  app.js         Express app assembly (headers, routes, error handler)
  routes/        analyze, analyze-multi, analyze-url, ask, history, health
  services/
    anthropic.js Claude service layer — BYOK key resolution, model
                 whitelist, structured outputs, typed error mapping
    remoteFile.js SSRF-guarded https fetching for cloud files
    history.js   Supabase persistence (best-effort, optional)
  parsers/       spreadsheet / json / text / pdf / office parsing
  analytics/     stats, correlations, quality profiling (pure functions)
  middleware/    rate limiting, security headers, error normalization
  schemas.js     JSON schemas enforced via output_config.format
  prompts.js     prompt builders
tests/           vitest unit suite
```

Request flow: upload (or URL fetch) → parse → quality profile + stats +
correlations → Claude (`claude-opus-5` by default; Sonnet 5 and Haiku 4.5
selectable) → structured JSON analysis → saved to Supabase (when
configured) → rendered, with follow-up Q&A against the same context.

**Keys:** the user's Anthropic key is sent per request in an
`x-anthropic-key` header, used for that one call, and never stored or
logged. A server-side `ANTHROPIC_API_KEY` acts as an optional fallback.

## Setup

```bash
npm ci
cp .env.example .env   # optional — everything runs without it
npm run dev            # http://localhost:3000
```

## Environment variables

All optional; see [.env.example](.env.example).

| Variable | Purpose | Where to get it |
|---|---|---|
| `ANTHROPIC_API_KEY` | Server-side fallback key (unset = BYOK-only) | [console.anthropic.com](https://console.anthropic.com/) |
| `SUPABASE_URL` | History + share links (unset = history disabled) | Supabase → Project Settings → API |
| `SUPABASE_KEY` | Publishable (anon) key, server-side only | Supabase → Project Settings → API |
| `PORT` | Local port, defaults to 3000 | — |

## Tests

```bash
npm test   # vitest — unit tests over analytics, parsers, validation
```

## Deployment

Deployed on Vercel: `public/` is static, `/api/*` is rewritten to the
Express app in `api/index.js` (see [vercel.json](vercel.json)). Set the
Supabase env vars in the Vercel project; the history schema lives in a
single `analyses` table (see `docs/ARCHITECTURE.md`).

## API

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/health` | GET | Server key presence, model list |
| `/api/analyze` | POST (multipart) | Analyze one uploaded file |
| `/api/analyze-multi` | POST (multipart) | Up to 10 files + cross-file synthesis |
| `/api/analyze-url` | POST (JSON) | Analyze a file at an https URL |
| `/api/ask` | POST (JSON) | Follow-up question against an analysis context |
| `/api/history?session=` | GET | Recent analyses for a browser session |
| `/api/analysis/:id` | GET | A saved analysis (share links) |

Analysis endpoints accept `x-anthropic-key` (BYOK), `x-dx-session`
(history scoping), and a `model` field; they are rate-limited to 10
requests/minute per IP and return normalized `{ error, code }` failures.
