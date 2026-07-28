# DashboardX

Upload a spreadsheet — or paste a link to one — and get an instant AI
dashboard back: statistics, correlations, chart suggestions, and written
insights. Bring your own Anthropic API key; analyses are saved to history
and shareable by link.

## What it does

DashboardX parses spreadsheets (`.xlsx`, `.xls`, `.csv`), documents
(`.pdf`, `.docx`, `.pptx`), and structured text (`.json`, `.txt`, `.md`),
computes descriptive statistics and Pearson correlations server-side, then
asks Claude for schema-guaranteed JSON insights rendered as an interactive
dashboard. Up to 10 files can be analyzed at once with a cross-file
synthesis.

## Architecture

```
public/          static frontend (vanilla JS + Chart.js), served by the CDN
api/index.js     Vercel serverless entry — all /api/* requests land here
server.js        local entry (node server.js)
src/
  app.js         Express app assembly (headers, routes, error handler)
  routes/        analyze, analyze-multi, analyze-url, history, health
  services/
    anthropic.js Claude service layer — BYOK key resolution, model
                 whitelist, structured outputs, typed error mapping
    remoteFile.js SSRF-guarded https fetching for cloud files
    history.js   Supabase persistence (best-effort, optional)
  parsers/       spreadsheet / json / text / pdf / office parsing
  analytics/     descriptive stats + correlations (pure functions)
  middleware/    rate limiting, security headers, error normalization
  schemas.js     JSON schemas enforced via output_config.format
  prompts.js     prompt builders
tests/           vitest unit suite
```

Request flow: upload (or URL fetch) → parse → stats + correlations →
Claude (`claude-opus-5` by default; Sonnet 5 and Haiku 4.5 selectable) →
structured JSON analysis → saved to Supabase (when configured) → rendered.

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
| `/api/history?session=` | GET | Recent analyses for a browser session |
| `/api/analysis/:id` | GET | A saved analysis (share links) |

Analysis endpoints accept `x-anthropic-key` (BYOK), `x-dx-session`
(history scoping), and a `model` field; they are rate-limited to 10
requests/minute per IP and return normalized `{ error, code }` failures.
