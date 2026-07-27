# DashboardX

Upload a file and get an instant, structured dashboard from it. DashboardX is a
Node/Express service that accepts spreadsheets, documents, and data files, parses
them server-side, and serves a static frontend that visualizes the extracted
content.

## Architecture

- **`server.js`** — Express 5 API. Handles uploads via `multer` (in-memory, 25 MB
  limit), detects file type by extension, and dispatches to the matching parser:
  - Spreadsheets (`.xlsx`, `.xls`, `.csv`) → `xlsx` / `csv-parser`
  - Documents (`.pdf`, `.docx`, `.doc`, `.pptx`, `.ppt`) → `officeparser` / `pdf2json`
  - Structured/text (`.json`, `.txt`, `.md`) → native parsing
  - Abuse protection via `rate-limiter-flexible`; CORS enabled.
- **`public/`** — static frontend served by Express (the dashboard UI).
- **`docs/`** — deeper documentation: [ARCHITECTURE](docs/ARCHITECTURE.md),
  [CONTRIBUTING](docs/CONTRIBUTING.md), [ROADMAP](docs/ROADMAP.md).
- **`vercel.json`** — deployment configuration.

## Setup

```bash
npm install
node server.js
```

The app serves on `http://localhost:3000` (or `$PORT`).

## Environment variables

Configuration is loaded from a `.env` file via `dotenv`:

- `PORT` — port to listen on (defaults to `3000`).

## Tests

No test suite is defined yet (`npm test` is a placeholder). See
[docs/ROADMAP.md](docs/ROADMAP.md) for planned work.
