# SRE metrics

Metrics use persisted `health_signals` and `incidents`, filtered by event time. Supported windows are `1h`, `6h`, `24h`, and `7d`; each interval is `[now-window, now]`.

- Availability = healthy signals / all signals × 100. Degraded, unhealthy, and slow signals are non-available; no signals is `null`.
- Error rate = degraded or unhealthy signals / all signals × 100; slow-only signals are performance degradation, not errors.
- Average latency is the SQL average of response times; no signals is `null`.
- Incident count includes incidents overlapping the window; open counts currently detected incidents; resolved counts use resolution time in the window.
- MTTR is the average `resolved_at - detected_at` for incidents resolved in the window; unresolved incidents are excluded.
- Signal count counts event timestamps in the window. Incident detection uses earliest event time and resolution uses the recovery event time, so out-of-order ingestion is handled consistently.

Endpoints: `GET /api/metrics/overview?window=24h` and `GET /api/metrics/services/:service?window=24h`. Both use shared Zod response contracts and bounded SQL queries.
