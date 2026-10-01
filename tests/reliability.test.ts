import { describe, expect, it } from 'vitest';
import { createDb, incidentTimeline, listLatestServiceHealth, pruneHealthSignals, saveSignalAndIncident, serviceHealth } from '../services/api/src/db';
import { detectIncident } from '../services/api/src/incident-detection';

const signal=(service:string,timestamp:string,status:'healthy'|'degraded'|'unhealthy',responseTimeMs:number,error?:string)=>({service,timestamp,status,responseTimeMs,...(error?{error}:{})});
const save=(db:any,s:any)=>saveSignalAndIncident(db,s,detectIncident(s,`${s.service}-${s.timestamp}-${s.status}-${s.responseTimeMs}`));

describe('recovery and retention reliability',()=>{
  it('isolates simultaneous unhealthy and slow incidents and ignores stale recovery',()=>{
    const db=createDb(':memory:');
    const unhealthy=save(db,signal('api','2026-09-30T10:00:00.000Z','unhealthy',100,'down'));
    const slow=save(db,signal('api','2026-09-30T10:01:00.000Z','degraded',1800));
    expect(unhealthy?.condition).toBe('unhealthy'); expect(slow?.condition).toBe('slow');
    save(db,signal('api','2026-09-30T09:59:00.000Z','healthy',50));
    expect((db.prepare("SELECT status FROM incidents WHERE condition='unhealthy'").get() as any).status).toBe('detected');
    save(db,signal('api','2026-09-30T10:02:00.000Z','healthy',50));
    const rows=db.prepare('SELECT condition,status,resolved_at,latest_observation_at FROM incidents ORDER BY condition').all() as any[];
    expect(rows).toEqual(expect.arrayContaining([{condition:'slow',status:'resolved',resolved_at:'2026-09-30T10:02:00.000Z',latest_observation_at:'2026-09-30T10:02:00.000Z'},{condition:'unhealthy',status:'resolved',resolved_at:'2026-09-30T10:02:00.000Z',latest_observation_at:'2026-09-30T10:02:00.000Z'}]));
  });
  it('prunes only old unreferenced signals by timestamp and preserves linked/recent data',()=>{
    const db=createDb(':memory:');
    const incident=save(db,signal('api','2026-09-01T00:00:00.000Z','unhealthy',50,'x'));
    db.prepare('INSERT INTO health_signals(service,timestamp,status,response_time_ms) VALUES(?,?,?,?)').run('api','2026-09-30T00:00:00.000Z','healthy',50);
    db.prepare('INSERT INTO health_signals(service,timestamp,status,response_time_ms) VALUES(?,?,?,?)').run('api','2026-01-01T00:00:00.000Z','healthy',50);
    expect(pruneHealthSignals(db,new Date('2026-10-01T00:00:00.000Z'))).toBe(1);
    expect((db.prepare('SELECT COUNT(*) AS n FROM health_signals').get() as any).n).toBe(2);
    expect(incident).toBeTruthy();
  });
  it('keeps latest observation and resolution timestamps monotonic',()=>{
    const db=createDb(':memory:'); save(db,signal('api','2026-09-30T10:00:00.000Z','unhealthy',50)); save(db,signal('api','2026-09-30T10:02:00.000Z','healthy',50)); save(db,signal('api','2026-09-30T10:01:00.000Z','healthy',50));
    expect(db.prepare("SELECT resolved_at,latest_observation_at FROM incidents").get()).toEqual({resolved_at:'2026-09-30T10:02:00.000Z',latest_observation_at:'2026-09-30T10:02:00.000Z'});
  });
});

describe('service health aggregation',()=>{
  it('handles no signals, timestamp ordering, ties, averages, errors, and incidents',()=>{
    const db=createDb(':memory:'); expect(serviceHealth(db,'none')).toBeNull();
    save(db,signal('api','2026-09-30T09:59:00.000Z','healthy',100)); save(db,signal('api','2026-09-30T10:00:00.000Z','degraded',1800)); save(db,signal('api','2026-09-30T10:00:00.000Z','unhealthy',200,'err'));
    const h:any=serviceHealth(db,'api'); expect(h.status).toBe('unhealthy'); expect(h.responseTimeMs).toBe(200); expect(h.errorCount).toBe(2); expect(h.averageResponseTimeMs).toBeCloseTo(700); expect(h.currentIncident?.condition).toBe('slow');
    expect(listLatestServiceHealth(db)).toHaveLength(1); expect(h.recentSignals[0].status).toBe('unhealthy');
  });
});

describe('query and schema verification',()=>{
  it('creates the expected indexes and deterministic timeline pagination',()=>{
    const db=createDb(':memory:'); const s=signal('api','2026-09-30T10:00:00.000Z','unhealthy',50,'token=secret'); save(db,s); const id=(db.prepare('SELECT id FROM incidents').get() as any).id;
    const names=(db.prepare("SELECT name FROM sqlite_master WHERE type='index'").all() as any[]).map(x=>x.name); expect(names).toEqual(expect.arrayContaining(['idx_health_service_timestamp','idx_incidents_correlation','idx_incident_observations_incident']));
    const timeline=incidentTimeline(db,id,0,10)!; expect(timeline.map(x=>x.type)).toEqual(['incident_detected','signal']); expect(JSON.stringify(timeline)).not.toContain('secret'); expect(incidentTimeline(db,id,10,10)).toEqual([]);
  });
});
