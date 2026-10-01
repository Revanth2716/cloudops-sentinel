import { describe, expect, it } from 'vitest';
import { signalsForScenario, SIMULATED_SERVICES } from '../services/api/src/simulator';
import { buildApp } from '../services/api/src/app';

describe('local simulator', () => {
  it.each([
    ['healthy','healthy'],['slow','degraded'],['database_failure','unhealthy'],['error_spike','unhealthy'],['recover','healthy']
  ] as const)('%s is deterministic', (scenario,status) => {
    const a=signalsForScenario(scenario,'payment-service'); const b=signalsForScenario(scenario,'payment-service');
    expect(a).toEqual(b); expect(a.every(x=>x.status===status)).toBe(true);
  });
  it('uses only the predefined services',()=>expect(SIMULATED_SERVICES).toEqual(['auth-service','payment-service','notification-service']));
  it('ingests bounded scenario signals and correlates failures/recovery', async()=>{
    const app=buildApp(':memory:');
    const run=(scenario:string)=>app.inject({method:'POST',url:'/api/simulator/scenarios',payload:{scenario,service:'payment-service'}});
    expect((await run('healthy')).statusCode).toBe(201);
    const failure=await run('database_failure'); expect(failure.json().signals[0].incident.status).toBe('detected');
    const repeated=await run('database_failure'); expect(repeated.json().signals[0].incident.id).toBe(failure.json().signals[0].incident.id);
    const detail=await app.inject('/api/service-health/payment-service'); expect(detail.json().recentSignals.length).toBe(3); expect(detail.json().currentIncident).toBeTruthy();
    const recovered=await run('recover'); expect(recovered.json().signals[0].incident.status).toBe('resolved');
    expect((await app.inject('/api/incidents')).json().filter((x:any)=>x.service==='payment-service')).toHaveLength(1);
    await app.close();
  });
  it('rejects arbitrary scenarios and services',async()=>{const app=buildApp(':memory:');expect((await app.inject({method:'POST',url:'/api/simulator/scenarios',payload:{scenario:'shell',service:'payment-service'}})).statusCode).toBe(400);expect((await app.inject({method:'POST',url:'/api/simulator/scenarios',payload:{scenario:'healthy',service:'shell'}})).statusCode).toBe(400);await app.close()});
});
