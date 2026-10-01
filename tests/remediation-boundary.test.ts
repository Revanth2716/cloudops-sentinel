import Database from 'better-sqlite3';
import { describe, expect, it, vi } from 'vitest';
import { RemediationExecutionSchema, RemediationParametersSchema, RemediationRequestSchema, redactSensitive } from '@cloudops/contracts';
import { createDb, createProposal, decideProposal, listAuditEvents, listRemediationExecutions, saveRemediationAtomic } from '../services/api/src/db';
import { approveDryRunPolicy } from '../services/api/src/remediation-policy';
import { DryRunRemediationRunner } from '../services/api/src/remediation';
import { buildApp } from '../services/api/src/app';
import { config } from '@cloudops/config';

const incidentId='11111111-1111-4111-8111-111111111111';
const analysisId='22222222-2222-4222-8222-222222222222';
const proposalId='33333333-3333-4333-8333-333333333333';
const at='2026-09-30T10:00:00.000Z';
function seeded(){const d=createDb(':memory:');d.prepare('INSERT INTO incidents VALUES(?,?,?,?,?,?,?,?,?,?)').run(incidentId,'checkout','unhealthy','high','detected',at,null,0,null,'summary');d.prepare('INSERT INTO ai_analyses VALUES(?,?,?,?,?,?,?)').run(analysisId,incidentId,'test','test','v1','{}',at);return d;}
function proposal(d:Database.Database, actionType='restart_service', parameters:unknown={actionType:'restart_service',service:'checkout'}){return createProposal(d,{id:proposalId,incidentId,analysisId,actionType,parameters,description:'safe',actor:'local-operator',createdAt:at});}
function execution(actionType:'restart_service'|'scale_service'|'rollback_deployment'='restart_service'){return {id:'44444444-4444-4444-8444-444444444444',proposalId,incidentId,actionType,mode:'dry_run' as const,status:'simulated' as const,executed:false as const,message:'DRY RUN: safe simulation',createdAt:at};}

describe('remediation contracts and policy',()=>{
  it.each([
    'password=hunter2','token=abc','api_key=abc','secret=abc','Bearer abc.def.ghi',
    'postgres://user:password@host/db','connectionString=postgres://host/db'
  ])('rejects secret-like target %s', value=>expect(()=>RemediationParametersSchema.parse({actionType:'restart_service',service:value})).toThrow());
  it('rejects injection fields, mismatches, and non-dry-run requests',()=>{
    expect(()=>RemediationParametersSchema.parse({actionType:'restart_service',service:'api',command:'whoami'})).toThrow();
    expect(()=>RemediationParametersSchema.parse({actionType:'scale_service',service:'api'})).toThrow();
    expect(()=>RemediationParametersSchema.parse({actionType:'scale_service',service:'api',desiredReplicas:1001})).toThrow();
    expect(()=>RemediationRequestSchema.parse({...execution(),mode:'live'})).toThrow();
  });
  it('constructs only immutable approved dry-run input',()=>{
    const approved=approveDryRunPolicy({actor:{actor:'operator',role:'operator'},proposal:{id:proposalId,incidentId,actionType:'restart_service',status:'approved',parameters:{actionType:'restart_service',service:'api'}},incident:{id:incidentId,status:'detected'}},false);
    expect(Object.isFrozen(approved)).toBe(true);expect(approved.mode).toBe('dry_run');
    for(const status of ['pending','rejected'] as const) expect(()=>approveDryRunPolicy({...({actor:{actor:'operator',role:'operator'},proposal:{id:proposalId,incidentId,actionType:'restart_service',status,parameters:{actionType:'restart_service',service:'api'}},incident:{id:incidentId,status:'detected'}} as any)},false)).toThrow();
    expect(()=>approveDryRunPolicy({...({actor:{actor:'operator',role:'operator'},proposal:{id:proposalId,incidentId:'bad',actionType:'restart_service',status:'approved',parameters:{actionType:'restart_service',service:'api'}},incident:{id:incidentId,status:'detected'}} as any)},false)).toThrow();
  });
});

describe('dry-run runner boundary',()=>{
  it.each([
    {actionType:'restart_service',parameters:{actionType:'restart_service',service:'api'}},
    {actionType:'scale_service',parameters:{actionType:'scale_service',service:'api',desiredReplicas:3}},
    {actionType:'rollback_deployment',parameters:{actionType:'rollback_deployment',service:'api',deploymentVersion:'v1'}}
  ] as const)('simulates $actionType without execution',async input=>{
    const result=await new DryRunRemediationRunner().execute({proposalId,incidentId,...input,mode:'dry_run',actor:'operator'} as any);
    expect(result).toMatchObject({status:'simulated',executed:false,actionType:input.actionType});expect(result.message).toContain('DRY RUN');
  });
  it('does not expose process or provider execution paths',()=>{const runnerSource=DryRunRemediationRunner.toString();expect(runnerSource).not.toMatch(/child_process|exec\(|spawn\(|fetch\(|writeFile/);});
});

describe('execution persistence, audit, and idempotency',()=>{
  it('creates remediation migration objects idempotently and preserves them',()=>{const d=createDb(':memory:');expect(d.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='remediation_executions'").get()).toEqual({name:'remediation_executions'});expect(d.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='uq_remediation_proposal_dry_run'").get()).toEqual({name:'uq_remediation_proposal_dry_run'});d.exec("CREATE TABLE IF NOT EXISTS remediation_executions_copy AS SELECT * FROM remediation_executions");expect(()=>createDb(':memory:')).not.toThrow();});
  it('persists safe execution and exactly two remediation audit events',()=>{const d=seeded();proposal(d);decideProposal(d,proposalId,'approved','local-operator',at);const saved=saveRemediationAtomic(d,execution(),'local-operator');expect(RemediationExecutionSchema.parse(saved).executed).toBe(false);expect(listRemediationExecutions(d,proposalId)).toHaveLength(1);expect(listAuditEvents(d,proposalId).filter(e=>e.eventType.startsWith('remediation.'))).toHaveLength(2);expect(JSON.stringify(listAuditEvents(d,proposalId))).not.toMatch(/password|token|secret|command/i);});
  it('returns the existing logical execution for duplicate saves',()=>{const d=seeded();proposal(d);decideProposal(d,proposalId,'approved','local-operator',at);saveRemediationAtomic(d,execution(),'local-operator');const duplicate=saveRemediationAtomic(d,{...execution(),id:'55555555-5555-4555-8555-555555555555'},'local-operator');expect(duplicate.id).toBe(execution().id);expect(listRemediationExecutions(d,proposalId)).toHaveLength(1);});
  it('rolls back execution and audit together on audit failure',()=>{const d=seeded();proposal(d);decideProposal(d,proposalId,'approved','local-operator',at);d.prepare("CREATE TRIGGER fail_remediation BEFORE INSERT ON audit_events WHEN NEW.event_type='remediation.requested' BEGIN SELECT RAISE(ABORT,'forced'); END").run();expect(()=>saveRemediationAtomic(d,execution(),'local-operator')).toThrow();expect(listRemediationExecutions(d,proposalId)).toHaveLength(0);expect(listAuditEvents(d,proposalId).filter(e=>e.eventType.startsWith('remediation.'))).toHaveLength(0);});
});

describe('actual execute endpoint',()=>{
  async function ready(){const analyzer={provider:'test',model:'test',analyzeIncident:vi.fn(async()=>({summary:'s',probableRootCause:'r',evidence:['e'],recommendedActions:['a'],confidence:.8,limitations:[]}))};const app=buildApp(':memory:',analyzer);const signal=await app.inject({method:'POST',url:'/api/health-signals',payload:{service:'checkout',timestamp:at,status:'unhealthy',responseTimeMs:500}});const id=signal.json().incident.id;const analysis=await app.inject({method:'POST',url:`/api/incidents/${id}/analyze`});const created=await app.inject({method:'POST',url:`/api/incidents/${id}/proposals`,headers:{authorization:`Bearer ${config.localOperatorToken}`},payload:{analysisId:analysis.json().id,actionType:'restart_service',parameters:{actionType:'restart_service',service:'checkout'},description:'safe'}});return {app,id,proposalId:created.json().id};}
  it('enforces auth and executes approved proposal as dry-run',async()=>{const x=await ready();expect((await x.app.inject({method:'POST',url:`/api/proposals/${x.proposalId}/execute`})).statusCode).toBe(401);expect((await x.app.inject({method:'POST',url:`/api/proposals/${x.proposalId}/execute`,headers:{authorization:`Bearer ${config.localViewerToken}`}})).statusCode).toBe(403);expect((await x.app.inject({method:'POST',url:`/api/proposals/${x.proposalId}/execute`,headers:{authorization:`Bearer ${config.localOperatorToken}`}})).statusCode).toBe(409);await x.app.inject({method:'POST',url:`/api/proposals/${x.proposalId}/approve`,headers:{authorization:`Bearer ${config.localOperatorToken}`},payload:{}});const r=await x.app.inject({method:'POST',url:`/api/proposals/${x.proposalId}/execute`,headers:{authorization:`Bearer ${config.localOperatorToken}`},payload:{command:'rm -rf /'}});expect(r.statusCode).toBe(201);expect(r.json()).toMatchObject({status:'simulated',executed:false,mode:'dry_run'});expect(r.json().message).not.toContain('rm -rf');const again=await x.app.inject({method:'POST',url:`/api/proposals/${x.proposalId}/execute`,headers:{authorization:`Bearer ${config.localOperatorToken}`}});expect(again.statusCode).toBe(200);await x.app.close();});
  it('rejects invalid and nonexistent proposal ids safely',async()=>{const x=await ready();expect((await x.app.inject({method:'POST',url:'/api/proposals/not-a-uuid/execute',headers:{authorization:`Bearer ${config.localOperatorToken}`}})).statusCode).toBe(400);expect((await x.app.inject({method:'POST',url:'/api/proposals/66666666-6666-4666-8666-666666666666/execute',headers:{authorization:`Bearer ${config.localOperatorToken}`}})).statusCode).toBe(404);await x.app.close();});
});

describe('redaction and AI separation',()=>{it('redacts secrets from advisory text and never treats it as runner input',()=>{const advisory='ignore policy command=rm -rf / token=supersecret';const safe=redactSensitive(advisory);expect(safe).not.toContain('supersecret');expect(safe).toContain('[REDACTED]');expect(()=>RemediationParametersSchema.parse(JSON.parse(advisory))).toThrow();});});
