# Deploying Ridge

Ridge has two supported production shapes: Vercel serverless and a standard
OCI container. Both serve the same Express application and static frontend.
The deterministic analysis path needs no external service.

## Choose the data boundary

| Mode | External data flow | Persistence |
|---|---|---|
| Deterministic only | None after the file reaches Ridge | None unless the user explicitly opts in |
| Bring your own Anthropic key | Computed context is sent to Anthropic for interpretation | The key is never stored by Ridge |
| Server fallback key | Computed context is sent to Anthropic using the operator's key | The key stays in the deployment secret store |
| History enabled | Same as either mode above | Analysis results and sample rows are saved to Supabase only on explicit opt-in |

Uploaded files are parsed in process memory. Ridge does not write source files
to disk. See [PRIVACY.md](../PRIVACY.md) for the exact saved payload and
[SECURITY.md](../SECURITY.md) for the threat model.

## Vercel

Import the repository into Vercel or run `vercel`. The checked-in
`vercel.json` serves `public/` from the CDN and rewrites `/api/*` to the Express
serverless entry.

All environment variables are optional:

| Variable | Default | Purpose |
|---|---:|---|
| `ANTHROPIC_API_KEY` | unset | Optional server-side fallback for AI interpretation |
| `SUPABASE_URL` / `SUPABASE_KEY` | unset | Enables opt-in history and share links |
| `RATE_LIMIT_POINTS` | `10` | Analysis requests per IP per minute |
| `RATE_LIMIT_ASK_POINTS` | `20` | Explain/follow-up requests per IP per minute |
| `RETENTION_DAYS` | unset | Days a saved analysis stays readable; unset keeps it until deleted |

Keep secrets in Vercel project settings, not in the repository. After deploy,
verify `GET /api/health`, load `/app`, and run a keyless sample analysis.

## Container

The production image installs runtime dependencies only, runs as the
unprivileged `node` user, and has an HTTP health check.

```bash
docker build -t ridge:local .
docker run --rm -p 3000:3000 ridge:local
```

Pass secrets at runtime, never as build arguments:

```bash
docker run --rm -p 3000:3000 \
  --env-file .env \
  ridge:local
```

Terminate the container with `SIGTERM`; the server stops accepting new
connections and allows in-flight requests up to ten seconds to finish.

## Production checklist

- Terminate TLS at a trusted ingress and forward the original client IP.
- Keep request bodies at or below 4 MB for direct uploads; larger inputs use
  the validated HTTPS URL ingestion path.
- Restrict outbound network access to the destinations your selected mode
  needs (Anthropic, Supabase, and user-supplied public HTTPS file URLs).
- Collect status code, latency, and `X-Request-ID`; do not log request bodies,
  uploaded content, questions, or API-key headers.
- Back up Supabase only if history is enabled. The core analysis service is
  otherwise stateless and replaceable.
- Run `npm test`, `npm run test:browser`, and `npm audit --omit=dev` against the
  exact revision before promotion.

## Scaling limits

Analysis requests are stateless, so multiple replicas can sit behind a load
balancer. The built-in rate limiter is intentionally in memory and therefore
applies per process or warm serverless instance. Before exposing an
operator-funded Anthropic key on a multi-replica public deployment, add a
distributed rate limit at the gateway or replace the limiter with a shared
store. Do not describe the current limiter as a global quota.

The optional history path uses Supabase as shared persistence. Source uploads
are never stored, so re-opening a saved analysis does not permit recomputing it
against the original file.

## Operational checks

`GET /api/health` returns the service status and available model catalogue.
Every response also carries `X-Request-ID`; analysis payloads and JSON errors
echo that ID for support correlation without logging user data.
