import { redactSensitive, type HealthSignal, type Incident } from '@cloudops/contracts';
import { config } from '@cloudops/config';

export function detectIncident(signal: HealthSignal, id: string): Incident | null {
  const unhealthy = signal.status === 'unhealthy' || signal.status === 'degraded';
  const slow = signal.responseTimeMs >= config.slowResponseMs;
  if (!unhealthy && !slow) return null;
  const condition = signal.status === 'unhealthy' ? 'unhealthy' : slow ? 'slow' : 'degraded';
  const severity = condition === 'unhealthy' ? config.unhealthyIncidentSeverity : condition === 'slow' ? 'medium' : 'low';
  return { id, service: signal.service, condition, severity, status: 'detected', detectedAt: signal.timestamp, resolvedAt: null, observationCount: 1, latestObservation: signal,
    summary: signal.error ? `${signal.status} signal: ${redactSensitive(signal.error)}` : `${signal.status} health signal (${signal.responseTimeMs}ms)` };
}
