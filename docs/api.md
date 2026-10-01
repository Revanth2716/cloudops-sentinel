# API overview

The API listens on `http://127.0.0.1:3001`. Send `Authorization: Bearer <LOCAL_OPERATOR_TOKEN>` for operator actions or the viewer token for read-only dashboard queries. Request and response shapes are defined in `packages/contracts`.

| Group | Endpoints | Access |
| --- | --- | --- |
| Health signals | `POST /api/health-signals`, `GET /api/service-health[/:service]` | local API route |
| Incidents | `GET /api/incidents`, `GET /api/incidents/:id`, `GET /api/incidents/:id/timeline` | local API route |
| AI analysis | `POST /api/incidents/:id/analyze`, `GET /api/incidents/:id/analyses` | local API route; provider must be enabled |
| Proposals | `POST /api/incidents/:id/proposals`, `GET /api/incidents/:id/proposals` | create: operator; read: local API route |
| Decisions | `POST /api/proposals/:id/approve` or `/reject` | operator |
| Audit | `GET /api/proposals/:id/audit` | local API route |
| Dry run | `POST /api/proposals/:id/execute` | operator; approved proposal; always simulated |
| Simulator | `POST /api/simulator/scenarios` | operator |
| Metrics | `GET /api/metrics/overview`, `GET /api/metrics/services/:service` | local API route |

`POST /api/auth/login` validates a local token for the dashboard. `GET /health` is an unauthenticated process/readiness check. No endpoint executes infrastructure-changing remediation.
