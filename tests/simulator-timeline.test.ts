import { describe, expect, it } from 'vitest';
import { buildApp } from '../services/api/src/app';
import { config } from '@cloudops/config';
import { readFileSync } from 'node:fs';

const operator={authorization:`Bearer ${config.localOperatorToken}`}; const viewer={authorization:`Bearer ${config.localViewerToken}`};
describe('simulator endpoint authentication',()=>{
  it.each([[{},401], [viewer,403], [{authorization:'Bearer invalid-token'},401], [operator,201]] as const)('returns %s for authorization',async(headers,status)=>{const app=buildApp(':memory:'); const r=await app.inject({method:'POST',url:'/api/simulator/scenarios',headers,payload:{scenario:'healthy',service:'payment-service'}}); expect(r.statusCode).toBe(status); await app.close();});
  it('rejects invalid scenarios and services after authentication',async()=>{const app=buildApp(':memory:'); expect((await app.inject({method:'POST',url:'/api/simulator/scenarios',headers:operator,payload:{scenario:'shell',service:'payment-service'}})).statusCode).toBe(400); expect((await app.inject({method:'POST',url:'/api/simulator/scenarios',headers:operator,payload:{scenario:'healthy',service:'unknown'}})).statusCode).toBe(400); await app.close();});
});
describe('actual timeline endpoint',()=>{
  it('paginates deterministic events and does not fabricate sensitive values',async()=>{const app=buildApp(':memory:'); const s=await app.inject({method:'POST',url:'/api/health-signals',payload:{service:'api',timestamp:'2026-09-30T10:00:00Z',status:'unhealthy',responseTimeMs:500,error:'password=hunter2'}}); const id=s.json().incident.id;
    await app.inject({method:'POST',url:'/api/health-signals',payload:{service:'api',timestamp:'2026-09-30T10:01:00Z',status:'healthy',responseTimeMs:50}});
    const all=await app.inject(`/api/incidents/${id}/timeline?offset=0&limit=20`); expect(all.statusCode).toBe(200); expect(all.json().map((x:any)=>x.type)).toEqual(['incident_detected','signal','incident_resolved','signal']); expect(JSON.stringify(all.json())).not.toContain('hunter2');
    expect((await app.inject(`/api/incidents/${id}/timeline?offset=1&limit=1`)).json()).toHaveLength(1); expect((await app.inject(`/api/incidents/${id}/timeline?offset=99&limit=10`)).json()).toEqual([]); await app.close();
  });
});
describe('simulator source safety',()=>{it('contains no execution, mutation, provider, or worker path',()=>{const source=readFileSync(new URL('../services/api/src/simulator.ts',import.meta.url),'utf8'); expect(source).not.toMatch(/child_process|spawn\s*\(|exec\s*\(|shell|writeFile|unlink|mkdir|docker|aws-sdk|remediation|setTimeout|setInterval|Worker|fetch\s*\(/i);});});
