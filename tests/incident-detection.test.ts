import { describe, expect, it } from 'vitest';
import { detectIncident } from '../services/api/src/incident-detection';
const base = { service: 'api', timestamp: '2026-09-30T10:00:00.000Z', status: 'healthy' as const, responseTimeMs: 50 };
describe('incident detection', () => { it('ignores healthy fast signals', () => expect(detectIncident(base, '1')).toBeNull()); it('detects unhealthy signals', () => expect(detectIncident({ ...base, status: 'unhealthy', error: 'timeout' }, '2')).toMatchObject({ severity: 'high', summary: 'unhealthy signal: timeout' })); it('detects slow signals', () => expect(detectIncident({ ...base, responseTimeMs: 1000 }, '3')).toMatchObject({ severity: 'medium' })); });
