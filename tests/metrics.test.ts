import { describe,it,expect } from 'vitest';
import { buildApp } from '../services/api/src/app';
import { MetricsOverviewSchema, ServiceMetricsSchema } from '@cloudops/contracts';

describe('SRE metrics',()=>{
  it('aggregates event-time signals and incidents safely',async()=>{const app=buildApp(':memory:');
    await app.inject({method:'POST',url:'/api/health-signals',payload:{service:'api',timestamp:'2026-09-30T10:00:00Z',status:'unhealthy',responseTimeMs:500}});
    await app.inject({method:'POST',url:'/api/health-signals',payload:{service:'api',timestamp:'2026-09-30T10:01:00Z',status:'healthy',responseTimeMs:50}});
    const r=await app.inject('/api/metrics/overview?window=7d');expect(r.statusCode).toBe(200);const m=MetricsOverviewSchema.parse(r.json());expect(m.signalCount).toBe(2);expect(m.errorRate).toBe(50);expect(m.resolvedIncidents).toBe(1);expect(m.mttrMs).toBeGreaterThan(0);await app.close();});
  it('returns null for no data and rejects invalid or unknown services',async()=>{const app=buildApp(':memory:');const empty=await app.inject('/api/metrics/overview?window=1h');expect(empty.statusCode).toBe(200);expect(MetricsOverviewSchema.parse(empty.json()).availability).toBeNull();expect((await app.inject('/api/metrics/overview?window=2h')).statusCode).toBe(400);expect((await app.inject('/api/metrics/services/nope')).statusCode).toBe(404);await app.close();});
  it('returns a validated service read model',async()=>{const app=buildApp(':memory:');await app.inject({method:'POST',url:'/api/health-signals',payload:{service:'api',timestamp:'2026-09-30T10:00:00Z',status:'healthy',responseTimeMs:20}});const r=await app.inject('/api/metrics/services/api?window=7d');expect(r.statusCode).toBe(200);expect(ServiceMetricsSchema.parse(r.json()).latestStatus).toBe('healthy');await app.close();});
});
