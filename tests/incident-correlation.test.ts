import { describe, expect, it } from 'vitest';
import { buildApp } from '../services/api/src/app';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { unlinkSync } from 'node:fs';

const post = (app:any, service:string, timestamp:string, status:string, responseTimeMs=50) => app.inject({method:'POST',url:'/api/health-signals',payload:{service,timestamp,status,responseTimeMs}});
describe('incident correlation and recovery', () => {
  it('deduplicates, preserves counts, separates keys, and resolves only the service', async () => {
    const app=buildApp(':memory:');
    const first=await post(app,'api','2026-09-30T10:00:00Z','unhealthy');
    const repeated=await post(app,'api','2026-09-30T09:00:00Z','unhealthy');
    await post(app,'worker','2026-09-30T10:01:00Z','unhealthy');
    await post(app,'api','2026-09-30T10:02:00Z','healthy');
    const incidents=(await app.inject('/api/incidents')).json();
    expect(repeated.json().incident.id).toBe(first.json().incident.id);
    expect(incidents.find((i:any)=>i.service==='api')).toMatchObject({status:'resolved',observationCount:3});
    expect(incidents.find((i:any)=>i.service==='worker').status).toBe('detected');
    expect(incidents.find((i:any)=>i.service==='api').latestObservation.status).toBe('healthy');
    await app.close();
  });
  it('keeps distinct conditions separate and exposes detail endpoint', async()=>{const app=buildApp(':memory:');await post(app,'api','2026-09-30T10:00:00Z','degraded',50);await post(app,'api','2026-09-30T10:01:00Z','healthy',1000);const list=(await app.inject('/api/incidents')).json();expect(list).toHaveLength(2);const detail=await app.inject(`/api/incidents/${list[0].id}`);expect(detail.statusCode).toBe(200);expect(detail.json()).toHaveProperty('condition');await app.close();});
  it('persists correlation across restart', async()=>{const path=join(tmpdir(),`cloudops-${randomUUID()}.db`);const first=buildApp(path);await post(first,'api','2026-09-30T10:00:00Z','unhealthy');await first.close();const second=buildApp(path);await post(second,'api','2026-09-30T10:01:00Z','unhealthy');expect((await second.inject('/api/incidents')).json()[0].observationCount).toBe(2);await second.close();unlinkSync(path);});
});
