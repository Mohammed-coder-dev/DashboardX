# DashboardX — project context for Claude Code

> Project-specific context layered on top of the global standards in `~/.claude/CLAUDE.md`.

## What it does
Upload a spreadsheet (or paste an https link to one) and get an AI dashboard
back: stats, correlations, charts, and written insights. Bring-your-own
Anthropic key; history and share links via Supabase.

## Stack
Node 20+ ESM, Express 5, vanilla JS frontend (Chart.js), @anthropic-ai/sdk,
@supabase/supabase-js, vitest. Deployed on Vercel (static `public/` +
serverless `api/index.js`).

## Commands
```bash
npm ci          # install
npm run dev     # local server with watch, http://localhost:3000
npm test        # vitest unit suite — must pass before any commit
npm start       # plain local server
```

## Layout
`src/routes` → `src/services` (anthropic, remoteFile, history) →
`src/parsers` / `src/analytics` (pure). Errors are AppError instances
normalized by `src/middleware/errorHandler.js`; JSON output shapes are
enforced by `src/schemas.js` via structured outputs.

## Conventions
- Conventional commits, one logical change each.
- External API calls only through `src/services/`; never call fetch/SDKs
  from routes directly.
- User API keys pass through per request (`x-anthropic-key`) — never store,
  log, or echo them.
- Every error reaching the client goes through `normalizeError` as
  `{ error, code }`.
- New pure logic goes in `parsers/`, `analytics/`, or service helpers with
  unit tests in `tests/`.
- Supabase is optional: guard new persistence features behind
  `historyEnabled()` and degrade gracefully.
