# DashboardX — project context for Claude Code

> Project-specific context layered on top of the global standards in `~/.claude/CLAUDE.md`.

## What it does
Upload a file and get an instant, structured dashboard from it. DashboardX is a

## Stack
node

## Commands
```bash
npm ci
npm run dev
npm test
npm run build
```

## Conventions
- Conventional commits, one logical change each; secrets never hardcoded; external API calls via a service layer; errors normalized before the client.
- Keep secrets out of the repo; document any build step in the README.

