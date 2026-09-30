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
