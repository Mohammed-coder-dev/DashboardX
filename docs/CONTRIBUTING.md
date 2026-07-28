# Contributing

1. `npm ci` and `npm test` (vitest) — the suite must pass before and after
   your change.
2. Follow the layering: routes → services → parsers/analytics. External
   calls live in `src/services/` only; pure logic gets unit tests.
3. Conventional commits (`feat:`, `fix:`, `docs:`, `test:`, `refactor:`),
   one logical change per commit.
4. Errors must reach the client through `AppError`/`normalizeError` — never
   raw messages or stack traces.
5. Never log or persist API keys; anything user-derived that is rendered
   goes through the frontend `esc()` helper.
