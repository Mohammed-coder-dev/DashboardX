# Security

## Reporting a vulnerability

Open a [private security advisory](https://github.com/MohammedAlkindi/Ridge/security/advisories/new)
on this repository. Please do not file a public issue for anything exploitable.

Include what you did, what happened, and what you expected. A proof of concept
helps. Expect an acknowledgement within a few days; this is a personal project,
not a funded programme, so please size your expectations accordingly.

**Never include a real API key in a report.** If you believe one has leaked,
rotate it at [console.anthropic.com](https://console.anthropic.com) first.

## Threat model

| Threat | Mitigation | Residual risk |
|---|---|---|
| **Key exposure** | Keys travel per request in a header, are used once, and are never stored server-side, logged, saved, or echoed in errors. Tests assert that saved payloads and provider-error responses contain no `sk-ant-` string. | The key is present in memory during the request and is sent to Anthropic, necessarily. A user who ticks *Remember this key* accepts local-storage persistence on that device. |
| **SSRF via URL ingestion** | `https://` only; IPv4/IPv6 private, loopback, link-local, CGNAT and NAT64 ranges rejected; DNS re-checked after resolution; redirects validated manually at each hop; response size capped during streaming. | A public host that later resolves to a private address between checks (DNS rebinding) is narrowed but not eliminated. |
| **XSS from file content or model output** | Everything rendered goes through `esc()` before reaching `innerHTML`. A strict CSP forbids inline script; the one CDN script is pinned with SRI. | Inline *styles* remain permitted (`style-src 'unsafe-inline'`) because the markup uses style attributes. |
| **Prompt-driven fabrication** | Numbers are computed deterministically before any model call. The model receives evidence objects and is instructed to explain, not extend, them; it cannot introduce statistics it was not given. | A model can still phrase a real number misleadingly. Deterministic and AI sections are labelled separately so a reader can tell which is which. |
| **Unintended data retention** | Persistence requires an explicit per-request opt-in; a configured database alone never triggers a write. | A user who opts in stores up to 100 sample rows. `PRIVACY.md` states this before the choice. |
| **Resource exhaustion** | Per-IP rate limits, a 4 MB aggregate request cap, a 25 MB remote-fetch cap, byte-budgeted prompt context, and a 300 s function ceiling. | Limits are per warm serverless instance, so they bound abuse per instance rather than globally. |
| **Dependency compromise** | Lockfile-pinned installs in CI, `npm audit` in the pipeline, and a single pinned SRI-checked CDN script. | Transitive dependency risk remains, as everywhere. |

## Handling secrets in this repository

- `.env` and `.env.local` are git-ignored; `.env.example` carries names only.
- No secret may appear in source, tests, fixtures, snapshots, or commit
  messages. Test keys are obvious non-credentials such as
  `sk-ant-test-not-a-real-key-000000`.
- The Supabase key used server-side is the publishable (anon) key, with
  insert/select policies. It is never shipped to the browser.

## Supported versions

The latest release on `main` is supported. Older tags receive no backports.
