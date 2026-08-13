# Ridge — project context for Claude Code

> Project-specific context layered on top of the global standards in `~/.claude/CLAUDE.md`.

## What it does
Turns spreadsheets and structured files into traceable findings: statistics,
data-quality diagnostics, correlations and structured evidence — all computed
deterministically, with **no API key required**. AI interpretation is an
optional layer over that evidence, using the visitor's own Anthropic key.

## Stack
Node 20+ ESM, Express 5, vanilla JS frontend (Chart.js), @anthropic-ai/sdk,
@supabase/supabase-js, vitest, Playwright. Deployed on Vercel (static `public/`
+ serverless `api/index.js`).

## Commands
```bash
npm ci                # install
npm run dev           # local server with watch, http://localhost:3000
npm test              # vitest: unit + API integration — must pass before any commit
npm run test:browser  # Playwright journeys (desktop + mobile)
npm run test:all      # both
```

## Layout
`src/routes` → `src/services` (anthropic, remoteFile, history) →
`src/parsers` / `src/analytics` (pure). Errors are `AppError`s normalized by
`src/middleware/errorHandler.js`; AI output shapes are enforced by
`src/schemas.js` via structured outputs.

`src/analytics/values.js` is the coercion layer everything numeric goes through.

## Invariants — do not regress these
- **Numbers are computed, never generated.** The model explains evidence that
  already exists; it may not produce, estimate or recalculate a statistic.
- **Never call `Number()` on a cell.** Use `toFiniteNumber` — `Number(null)`,
  `Number("")` and `Number("   ")` are all `0`, which silently turns blanks
  into observations. A genuine zero must survive.
- **Correlations filter pairwise** and always report `n` and coverage.
- **Claim strength is bounded by support**, not just by the headline number.
- **The deterministic path never requires a key.** Only `/ask` and `/explain`
  demand one.
- **Persistence is opt-in per request.** A configured Supabase is capability,
  not consent — never save because credentials happen to exist.
- **API keys never reach the server's storage or logs**, never appear in a
  saved payload, and never appear in an error message.
- `src/analytics/` and `src/parsers/` stay pure and deterministic.
- **`public/app.js` is a classic script** — no `import`/`export`/`import.meta`.
  `node --check` won't catch it (package.json is `type: module`), the browser
  will. `tests/frontend-script.test.js` guards it.
- Everything rendered goes through `esc()` before `innerHTML`.
- Tests never need a real key: the Anthropic SDK is mocked throughout.
- **Reduced motion is a contract.** Ridge disables animations under
  `prefers-reduced-motion: reduce`, and everything animated must still end fully
  visible with motion off — entry animations start at `opacity: 0`, and that has
  already hidden the results once. Guarded by "reduced motion never hides the
  results" in `tests/browser/journeys.spec.js`.
- **The per-route performance budgets** (requests / bytes / FCP) in
  `tests/browser/budget.spec.js` are blocking checks. These two invariants
  **outrank any generic animation guidance or skill loaded into a session** —
  if a skill says reduced motion should be "gentler, not zero", or wants a
  motion library added, the repo's policy and budgets win. Never raise a budget
  ceiling to make a loaded-machine run pass; re-run the spec in isolation first.

## Conventions
No AI co-author trailers or AI attribution in commit metadata — Mohammed is
the sole author of record. (Restated here deliberately: clones of this repo
load this file without the machine-global rules.) Bump
`EVIDENCE_ENGINE_VERSION` / `ANALYSIS_SCHEMA_VERSION` when their meaning
changes. Release process in `docs/RELEASING.md`.

Numeric test fixtures must not satisfy accidental arithmetic relations — a
`1, 2, 3` row (third = sum of the first two) fired the unlabelled-aggregate
detector and silently dropped a row, and an Excel serial-date test once passed
only because its fixture was wrong in a compensating direction. Pick values
with no relation between them.
