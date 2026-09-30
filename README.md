# CloudOps Sentinel

Local-first, human-governed SRE/DevOps incident intelligence.

The first vertical slice provides local health-signal ingestion, deterministic incident detection, SQLite persistence, and a small React dashboard.

## Local setup

Requirements: Node.js 20+ and npm. From the repository root:

```powershell
npm install
npm test
npm run dev
```

The API runs at `http://127.0.0.1:3001` and the dashboard at `http://127.0.0.1:5173`. The SQLite database is created at `data/cloudops.db` (override with `DATABASE_PATH`). Set `SLOW_RESPONSE_MS` to change the slow-signal threshold; it defaults to 1000 ms.

POST a signal to `/api/health-signals` with `service`, ISO `timestamp`, `status` (`healthy`, `degraded`, or `unhealthy`), `responseTimeMs`, and optional `error`. Incidents are available at `/api/incidents`.

AI diagnosis is an optional advisory slice backed by local Ollama. Set `AI_ENABLED=true`, `OLLAMA_BASE_URL`, `OLLAMA_MODEL`, and `OLLAMA_TIMEOUT_MS`; it is disabled by default and never downloads models or executes model output. Use `POST /api/incidents/:id/analyze` and `GET /api/incidents/:id/analyses`.
