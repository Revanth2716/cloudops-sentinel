# CloudOps Sentinel — Session Guide

## Purpose
CloudOps Sentinel is a local-first SRE/DevOps platform for monitoring, incident analysis, human-approved remediation, and auditable operations.

## Working rules
- Keep the stack small and Windows-friendly; add dependencies and services only when needed.
- Do not implement or execute infrastructure-changing remediation without explicit user approval.
- Treat credentials, tokens, logs, and incident data as sensitive. Never commit secrets; use Git-ignored local `.env` files.
- Keep shared request, event, and domain contracts in `packages/contracts`.
- Keep the web UI independent of persistence, provider SDKs, and remediation tools.
- Update `ARCHITECTURE.md` when a material data flow, boundary, or security decision changes.

## Repository ownership
- `apps/web`: frontend only.
- `services/api`: APIs, orchestration, policy enforcement, and integrations.
- `packages/contracts`: shared runtime schemas and types.
- `packages/config`: shared non-secret configuration helpers.
- `infra`: Docker and operational configuration.
- `docs`: ADRs and operational documentation.
- `tests`: cross-service and end-to-end tests.

Inspect before broad changes, preserve existing user work, and run focused tests for changed behavior. Do not install dependencies or start containers unless requested.
