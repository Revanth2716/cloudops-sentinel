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

This slice deliberately excludes AI, cloud services, remediation, and shell execution.
