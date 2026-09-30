import { redactSensitive, type HealthSignal, type Incident } from '@cloudops/contracts';
import { config } from '@cloudops/config';

export function detectIncident(signal: HealthSignal, id: string): Incident | null {
  const unhealthy = signal.status === 'unhealthy' || signal.status === 'degraded';
  const slow = signal.responseTimeMs >= config.slowResponseMs;
  if (!unhealthy && !slow) return null;
  const severity = signal.status === 'unhealthy' ? config.unhealthyIncidentSeverity : slow ? 'medium' : 'low';
  return { id, service: signal.service, severity, status: 'detected', detectedAt: signal.timestamp,
    summary: signal.error ? `${signal.status} signal: ${redactSensitive(signal.error)}` : `${signal.status} health signal (${signal.responseTimeMs}ms)` };
}
