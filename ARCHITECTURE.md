# CloudOps Sentinel Architecture

## Goals and constraints

CloudOps Sentinel is a career-focused, local-first platform for monitoring application health, analyzing logs, detecting incidents, explaining likely causes, proposing safe remediation, requiring human approval for sensitive actions, and retaining an audit trail.

The first target is a limited-RAM Windows laptop. Start with a modular monolith and optional integrations; avoid distributed services, queues, Kubernetes, and always-on telemetry stacks until there is a demonstrated need.

## System components

| Component | Responsibility | Initial shape |
| --- | --- | --- |
| Web app | Dashboard, incident review, approval, and audit screens | Browser client |
| API | Ingestion, orchestration, validation, policy, audit writes | Modular monolith |
| Monitoring adapters | Collect health, metrics, logs, or manual signals | Pluggable backend modules |
| Incident engine | Normalize, correlate, deduplicate, score, and track incidents | API module |
| AI advisor | Summarize scoped evidence and draft explanations/remediation | Optional local Ollama adapter |
| Remediation runner | Execute approved, allowlisted actions | Disabled by default |
| Persistence | Operational records and immutable audit events | Lightweight local database |

## Data flow

1. Adapters collect health checks, metrics, logs, or manual signals.
2. The API validates and normalizes each signal into a shared contract.
3. The incident engine creates or updates an incident through deterministic correlation rules.
4. The AI advisor receives a redacted evidence bundle and returns structured analysis and a proposal.
5. The UI presents evidence, confidence, risk, and the proposal to a human.
6. Policy records an approval or rejection. Only an approved, allowlisted action can reach the runner.
7. Execution results and incident transitions are appended to the audit trail; recovery is verified before resolution.

## Backend and frontend boundaries

The frontend consumes versioned APIs and shared contracts only. It never calls a database, Ollama, cloud SDK, Docker, or remediation tool directly. The backend owns validation, authentication/authorization, persistence, provider integrations, policy evaluation, sensitive execution, and audit recording. Provider-specific code belongs behind backend adapter interfaces.

## Incident lifecycle

`detected → triaged → investigating → remediation_proposed → awaiting_approval → remediating → monitoring_recovery → resolved`

Alternative outcomes are `dismissed` (false positive), `rejected` (proposal declined), and `failed` (execution failed). Every state change requires a reason and creates an audit event. Initial severity and correlation remain deterministic and explainable.

## AI layer

AI is advisory—not an autonomous operator. A provider interface will support local Ollama first and allow future providers. Inputs are minimized to incident metadata, redacted relevant logs, health signals, and approved runbook context. Outputs are structured: summary, evidence references, likely causes, confidence, risks, recommended checks, and an action-catalog remediation proposal. The API validates outputs; model text is never executed as a command.

## Human approval and remediation

Read-only diagnostics may be automatic when explicitly configured. Every state-changing action requires an authenticated human decision, a displayed risk level, explicit action parameters, and an audit record. The runner only accepts known, parameter-validated, allowlisted actions; arbitrary shell commands are out of scope. Approval is bound to a proposal version, so changed parameters require renewed approval. A kill switch disables remediation execution.

## Security model

- Local development defaults to single-user access, while authentication and authorization remain backend concerns from day one.
- Keep secrets in environment variables or an OS-backed secret store—never source control, logs, prompts, or audit payloads.
- Validate all boundary inputs and redact sensitive values before storage, UI presentation, or AI submission.
- Use least-privilege integration credentials and narrowly scoped remediation adapters.
- Append audit events for ingestion, incident updates, AI metadata, approvals, execution attempts, and outcomes.
- Add dependency and secret scanning to CI with the first implementation milestone.
- Local approval authentication uses configured bearer tokens (`LOCAL_OPERATOR_TOKEN` and optional `LOCAL_VIEWER_TOKEN`); authorization is enforced server-side and actors are derived from the authenticated context. SQLite foreign keys, append-only audit triggers, terminal proposal guards, and transactional pending-state decisions protect the approval boundary. This remains a local-development model, not a production identity provider.

## Testing strategy

Start with unit tests for contracts, incident logic, redaction, policy gates, and remediation validation. Add API integration tests against an isolated local database, then a small number of browser end-to-end flows for review and approval. Mock AI/provider adapters by default. Prioritize proof that unapproved or malformed remediation cannot execute.

## Local development strategy

Develop natively on Windows with one API process, one web process, and a lightweight local database (SQLite is the default candidate). Ollama remains optional and disabled unless locally installed. Introduce Docker Compose later for reproducible demos and integration tests, initially with only the needed services.

## Planned technology direction

- **Language/runtime:** TypeScript and Node.js for a unified toolchain.
- **Frontend:** React with Vite when UI implementation begins.
- **Backend:** A lightweight TypeScript HTTP framework; Fastify is the leading candidate for its low overhead and validation support.
- **Database:** SQLite locally behind a small persistence layer; consider PostgreSQL only when justified.
- **Contracts:** Runtime schemas shared by API and UI, selected alongside the backend framework.
- **AI:** Local Ollama over HTTP; no model is bundled or required now.
- **Containers/CI:** Docker Compose later; GitHub Actions for linting, tests, builds, dependency checks, and secret scanning.
- **Observability:** Structured JSON logs plus health/readiness endpoints first; OpenTelemetry export later.

## Deferred decisions

Authentication provider, exact libraries, cloud target, alert sources, migration tooling, and CI workflow details should be decided when first implemented. Record material decisions as short ADRs in `docs/decisions/`.

## Implemented first vertical slice

The API accepts validated health signals at `POST /api/health-signals`, stores every signal in local SQLite, and applies deterministic correlation: an unhealthy signal maps to `unhealthy`, a slow signal maps to `slow`, otherwise a degraded signal maps to `degraded`; only one detected incident may exist per service and condition. Matching signals attach to that incident and update its count and timestamp fields using signal timestamps, including out-of-order delivery. A healthy signal resolves all currently open incidents for the same service and is attached as the recovery observation; other services are unaffected. `GET /api/service-health`, `GET /api/incidents`, and `GET /api/incidents/:id` expose the result. The optional AI slice collects redacted evidence, calls local Ollama through a provider-neutral interface, validates strict structured output, and persists each analysis without overwriting prior results. AI remains advisory; model output is never executable.

## Local observability simulator

The local-only simulator is a pure bounded signal generator for `auth-service`, `payment-service`, and `notification-service`. `POST /api/simulator/scenarios` accepts only `healthy`, `slow`, `database_failure`, `error_spike`, and `recover`, then submits deterministic signals through the same health-signal ingestion and incident correlation path. It has no timers, command execution, cloud integrations, or remediation access. Service health reads include the latest signal, recent error count, average response time, current incident, and bounded recent history; incident timelines expose persisted signals, analysis, and proposal events only.

## Dry-run remediation boundary

Dry-run execution is policy-gated and receives only an immutable approved object. Target identifiers reject secret-like values; audit metadata is typed and redacted at response boundaries. SQLite enforces one execution per approved proposal with an atomic conflict-safe insert; repeated and concurrent requests return the same logical execution. createDb() owns the remediation schema migration.
