# Contributing

## Getting started

```bash
npm ci
npm run dev            # http://localhost:3000
npm test               # unit + API integration — must pass before and after
npm run test:browser   # Playwright journeys (installs a browser on first run)
```

No API key or database is needed to develop or to run the tests.

## The rule that matters most

**Numbers are computed, never generated.** If a change would let the language
model produce, estimate, or recalculate a statistic, it does not belong here.
The model explains evidence that `src/analytics/` already computed, and it must
carry that evidence's caveats forward.

Practically:

- Never read a cell with `Number()`. Use `toFiniteNumber` from
  `src/analytics/values.js`, which returns `null` for missing values and
  preserves a genuine zero. `Number(null)`, `Number("")` and `Number("   ")`
  are all `0`, which is how blanks became fake observations before.
- Never report a coefficient without its sample size and coverage.
- Bound a claim's strength by its support. A true percentage over six rows of a
  mostly-empty column is not a strong finding.

## Layering

```
routes → services → parsers / analytics
```

- External calls (Anthropic, Supabase, remote fetch) live **only** in
  `src/services/`. Routes never import an SDK or call `fetch`.
- `src/analytics/` and `src/parsers/` are pure: no I/O, no clock, no randomness.
  Same input, same output, every run — several tests assert exactly that.
- New pure logic needs unit tests in `tests/`.

## Errors and safety

- Every error reaching a client goes through `AppError` / `normalizeError` as
  `{ error, code }`. No stack traces, no upstream payloads.
- Never log, persist, or echo an API key. Tests assert that saved payloads and
  provider-error responses contain no `sk-ant-` string; keep it that way.
- Anything user- or model-derived that is rendered goes through the frontend
  `esc()` helper before touching `innerHTML`.
- `public/app.js` is loaded as a **classic script**. Do not use `import`,
  `export`, or `import.meta` in it — `node --check` will accept them because
  `package.json` sets `"type": "module"`, but the browser will fail to parse the
  entire file. `tests/frontend-script.test.js` guards this.

## Commits and pull requests

- Conventional commits (`feat:`, `fix:`, `docs:`, `test:`, `refactor:`,
  `chore:`, `ci:`), one logical change each.
- Keep implementation and its tests in the same commit; a test that lands
  without its implementation breaks the branch.
- Don't mix a rebrand, a behaviour change, and a docs rewrite in one commit.
- Never rewrite published history or force-push.
- Update `CHANGELOG.md` under "Unreleased" for anything user-visible.

## Changing evidence semantics

If a change alters what a claim *means* — not just its wording — bump
`EVIDENCE_ENGINE_VERSION` in `src/analytics/evidence.js`. If the response
payload shape changes, bump `ANALYSIS_SCHEMA_VERSION`. Both travel with saved
and exported analyses so an old result stays interpretable.

## Releases

Maintainer process, including the required checks and the production
verification that must actually be performed:
[docs/RELEASING.md](docs/RELEASING.md).
