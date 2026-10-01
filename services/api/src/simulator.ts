import { type HealthSignal, type SimulatorScenario } from '@cloudops/contracts';

export const SIMULATED_SERVICES = ['auth-service','payment-service','notification-service'] as const;
export type SimulatedService = typeof SIMULATED_SERVICES[number];

export function signalsForScenario(scenario: SimulatorScenario, service: SimulatedService, at = '2026-10-01T00:00:00.000Z'): HealthSignal[] {
  const base = new Date(at).getTime();
  const make = (offset: number, status: HealthSignal['status'], responseTimeMs: number, error?: string): HealthSignal => ({service, timestamp: new Date(base + offset * 1000).toISOString(), status, responseTimeMs, ...(error ? {error} : {})});
  switch (scenario) {
    case 'healthy': return [make(0, 'healthy', 80)];
    case 'slow': return [make(0, 'degraded', 1800, 'high latency')];
    case 'database_failure': return [make(0, 'unhealthy', 900, 'database timeout')];
    case 'error_spike': return [make(0, 'unhealthy', 220, 'HTTP 500 error'), make(1, 'unhealthy', 240, 'HTTP 500 error'), make(2, 'unhealthy', 210, 'HTTP 500 error')];
    case 'recover': return [make(0, 'healthy', 75)];
  }
}
