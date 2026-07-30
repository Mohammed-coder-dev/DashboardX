# Privacy

This document states what Ridge actually does with data. The live `/privacy`
page carries the same content for people who never open the repository. When
behaviour and wording disagree, that is a bug — please report it.

## Your files

- Uploaded files are held **in memory** for the duration of the request and are
  not written to durable storage. PDF parsing writes a temporary file that is
  deleted immediately after text extraction.
- Files fetched from a URL are handled identically. URL fetching is restricted
  to `https://` and blocks private, loopback, link-local and CGNAT addresses,
  re-validating after DNS resolution and after every redirect.
- Nothing about a file survives the response — **unless you opt in** to saving
  that analysis.

## Your API key

Ridge works with no key at all: parsing, statistics, quality checks,
correlations and evidence are computed server-side without any model.

If you add an Anthropic key:

- It is stored in the browser — **session storage by default**, cleared when
  the tab closes. It goes to local storage only if you tick *Remember this key
  on this device*.
- On each AI request it is **transmitted to the Ridge backend, which forwards
  it to Anthropic**, and used for that request only.
- It is never stored server-side, never written to logs, never included in a
  saved analysis, and never echoed in an error message. Integration tests
  assert the last two directly.
- We do not claim the key "never leaves your browser". It necessarily travels
  with each AI request. It is simply never retained anywhere along the way.

## What reaches Anthropic

Only when you use an AI feature, and only with your key: column names, computed
statistics, correlations, evidence objects, the data-quality summary, a bounded
labelled sample of rows (or a text excerpt for documents), and your question.

Full row data is never sent — the model receives the representative sample, not
the file. With no key configured, nothing is sent to Anthropic at all.

## Saved analyses (opt-in)

By default **nothing is stored server-side**; every analysis is transient.

Ticking *Save this analysis to history and enable a share link* stores one row:

| Field | Contents |
|---|---|
| `session_id` | Random anonymous identifier generated in your browser |
| `kind` | `single`, `multi` or `url` |
| `filename`, `file_type` | As uploaded |
| `model` | The Claude model used, if any |
| `question` | Your question, if you asked one |
| `payload` | The full response: statistics, evidence, quality profile, AI text if any, and up to 100 sample rows of your data |
| `created_at` | Timestamp |

Your API key is never part of it.

**Retention:** saved analyses persist until you delete them from the history
list. There is no automatic expiry. Anyone holding a share link can view that
analysis; deletion is scoped to the browser session that created it, so a share
link alone never grants deletion.

If `SUPABASE_URL` / `SUPABASE_KEY` are unset, the feature is disabled entirely
and the controls do not appear.

## Everything else

- No analytics, tracking pixels, or third-party scripts beyond the charting
  library (`cdn.jsdelivr.net`, pinned with subresource integrity).
- A random session identifier lives in your browser's local storage to group
  your saved analyses. It is sent only to this app.
- Requests are rate-limited per IP in memory. Addresses are not durably logged.
- A strict Content-Security-Policy is sent on every response; the API is
  same-origin only, with no CORS.

## Self-hosting

Running your own instance puts every one of these decisions in your hands: your
Vercel project, your Supabase database (or none), your keys. Nothing reports
back to this project.
