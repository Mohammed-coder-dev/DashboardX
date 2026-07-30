# AGENTS.md — Ridge

Read this and `CLAUDE.md` before working here. Full standards: `~/.claude/CLAUDE.md` and `~/Github/CLAUDE.md`.

## Scope
Implement features, fix bugs, and refactor within this repo.

## Branch & commits
- Branch prefix by agent: Claude → `claude/<type>-<kebab>`, Codex → `Codex/<type>-<kebab>`.
- Conventional-commit messages; one logical change per commit; PRs via the `gh` CLI.

## Requires explicit confirmation
Destructive git ops (force-push, history rewrite), deploys/publishing, secret or CI changes, and data deletion.

## Before done
Run `npm test` and confirm it passes. Run `npm run test:browser` for any change
to `public/`, routing, or the analysis flow.

## Non-negotiable
Numbers are computed, never generated. Never read a cell with `Number()` — use
`toFiniteNumber`. Never persist without an explicit per-request opt-in. Never
log, save or echo an API key. `public/app.js` is a classic script: no
`import`/`export`. Full list in `CLAUDE.md` under Invariants.

