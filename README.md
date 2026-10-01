# CloudOps Sentinel

Local-first, human-governed SRE/DevOps incident intelligence. This release is a local demo and documentation/readiness slice: it does not provision cloud infrastructure, install Ollama, or execute real remediation.

## Windows setup

Prerequisites:

- Windows 10/11 with PowerShell 7 recommended
- Node.js 22 LTS (Node.js 20+ is supported) and npm 10+
- Native build tooling may be required by `better-sqlite3` on Windows. If npm cannot use its prebuilt binary, install the Visual Studio Build Tools C++ workload and Windows SDK, then rerun `npm ci`.

From an empty clone:

```powershell
cd 'C:\path\to\CloudOps Sentinel'
Copy-Item .env.example .env
npm ci
```

Open `.env` and configure the two local credentials. The example values are deliberately demo-only; use different random values for any shared environment:

```dotenv
LOCAL_OPERATOR_TOKEN=cloudops-local-operator-change-me
LOCAL_VIEWER_TOKEN=cloudops-local-viewer-change-me
```

The operator can create, approve, reject, and simulate proposals. The viewer is read-only. These bearer tokens are a local-development mechanism, not production authentication. Production deployments must use a proper identity provider/secret store and must not reuse these values.

The database is SQLite at `./data/cloudops.db` by default. The directory and database are created automatically on first API start. Set `DATABASE_PATH` in `.env` to move it. Database files are ignored by Git.

## Run the application

Start both processes in one PowerShell window:

```powershell
npm run dev
```

Or use separate windows:

```powershell
# API
npm run dev:api

# Dashboard, in a second PowerShell window
npm run dev:web
```

Open [http://127.0.0.1:5173](http://127.0.0.1:5173). Paste the `LOCAL_OPERATOR_TOKEN` or `LOCAL_VIEWER_TOKEN` from `.env` into the Local token field and select **Authenticate**. The dashboard stores the token only in browser local storage. The API is at `http://127.0.0.1:3001` and readiness is `GET /health`.

AI analysis is disabled by default (`AI_ENABLED=false`), so no Ollama installation is needed. If a compatible local provider is available later, its settings are `OLLAMA_BASE_URL`, `OLLAMA_MODEL`, and `OLLAMA_TIMEOUT_MS`; model output remains advisory and is never executed.

## Demo workflow

Use the dashboard simulator, or send operator-authenticated requests, to walk through:

`healthy → failure → incident → AI analysis → proposal → approval → dry-run → audit → recovery`

The simulator is bounded to `auth-service`, `payment-service`, and `notification-service`. Its scenarios are `healthy`, `slow`, `database_failure`, `error_spike`, and `recover`; it generates local signals only. AI analysis requires `AI_ENABLED=true` and a compatible local provider, while dry-run remediation always reports `executed=false`.

## API groups

Operator-only requests use `Authorization: Bearer <LOCAL_OPERATOR_TOKEN>`. The dashboard sends the selected bearer token on its API requests; the current local API keeps health, incident, analysis, audit, and metrics reads available for the local demo.

- Health signals: `POST /api/health-signals`; `GET /api/service-health` and `/api/service-health/:service`.
- Incidents: `GET /api/incidents`, `GET /api/incidents/:id`, and `GET /api/incidents/:id/timeline`.
- AI analysis: `POST /api/incidents/:id/analyze`; `GET /api/incidents/:id/analyses`.
- Proposals: `POST /api/incidents/:id/proposals`; `GET /api/incidents/:id/proposals`.
- Approval/rejection: `POST /api/proposals/:id/approve` or `/reject` (operator only).
- Audit: `GET /api/proposals/:id/audit`.
- Dry-run remediation: `POST /api/proposals/:id/execute` (operator only; approved proposals only, never executes commands).
- Simulator: `POST /api/simulator/scenarios` (operator only).
- Metrics: `GET /api/metrics/overview?window=24h` and `GET /api/metrics/services/:service?window=24h`. Supported windows are `1h`, `6h`, `24h`, and `7d`; see [docs/metrics.md](docs/metrics.md).

## Development commands

```powershell
npm run typecheck
npm test
npm run build:web
npm run build
```

`npm ci` uses the committed lockfile. Dependencies are pinned in `package.json` and `package-lock.json`; do not commit `.env`, credentials, SQLite files, or build output.

## Configuration reference

See [.env.example](.env.example) for every supported setting: API port, web origin, local auth, database path, AI adapter settings, retention, thresholds, and `REMEDIATION_MODE=dry_run`.
