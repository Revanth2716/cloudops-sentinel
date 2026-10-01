import Fastify from 'fastify';
import cors from '@fastify/cors';
import { randomUUID } from 'node:crypto';
import { AIAnalysisResultSchema, HealthSignalSchema, CreateProposalSchema, DecisionSchema, AuthRequestSchema, IdSchema, RemediationParametersSchema, RemediationRequestSchema, SimulatorRequestSchema, MetricsWindowSchema, redactSensitive } from '@cloudops/contracts';
import { config } from '@cloudops/config';
import { closeDb, createDb, listIncidents, listLatestServiceHealth, serviceHealth, incidentTimeline, saveSignalAndIncident, getIncident, recentSignals, saveAnalysis, listAnalyses, listProposals, listAuditEvents, listRemediationExecutions, createProposal, decideProposal, saveRemediationAtomic, metricsOverview, serviceMetrics } from './db.js';
import { detectIncident } from './incident-detection.js';
import { FakeAnalyzer, OllamaAnalyzer, type AIAnalyzer, DIAGNOSIS_PROMPT_VERSION } from './ai.js';
import { DryRunRemediationRunner } from './remediation.js';
import { SIMULATED_SERVICES, signalsForScenario, type SimulatedService } from './simulator.js';

export function buildApp(databasePath = config.databasePath, analyzer: AIAnalyzer = config.aiProvider === 'fake' ? new FakeAnalyzer() : new OllamaAnalyzer()) {
  const db = createDb(databasePath);
  const app = Fastify({ logger: false });
  app.register(cors, { origin: config.frontendOrigin });
  app.setErrorHandler((error, request, reply) => {
    const safeError = error instanceof Error ? { name: error.name, message: redactSensitive(error.message) } : { name: 'UnknownError', message: 'unknown error' };
    request.log.error({ err: safeError, method: request.method, url: request.url }, 'request failed');
    const statusCode = typeof error === 'object' && error !== null && 'statusCode' in error && typeof error.statusCode === 'number' && error.statusCode >= 400 ? error.statusCode : 500;
    reply.code(statusCode).send({ error: 'Internal server error' });
  });
  const auth=(request:any)=>{const token=typeof request.headers.authorization==='string'&&request.headers.authorization.startsWith('Bearer ')?request.headers.authorization.slice(7):'';return token===config.localOperatorToken?{actor:'local-operator',role:'operator'}:token===config.localViewerToken?{actor:'local-viewer',role:'viewer'}:null};
  const operator=(request:any,reply:any)=>{const user=auth(request);if(!user)return reply.code(401).send({error:'Authentication required'});if(user.role!=='operator')return reply.code(403).send({error:'Operator access required'});return user;};
  app.post('/api/auth/login',async(request,reply)=>{const parsed=AuthRequestSchema.safeParse(request.body);if(!parsed.success)return reply.code(400).send({error:'Invalid authentication request'});const user=parsed.data.token===config.localOperatorToken?{actor:'local-operator',role:'operator'}:parsed.data.token===config.localViewerToken?{actor:'local-viewer',role:'viewer'}:null;return user?user:reply.code(401).send({error:'Invalid local token'});});
  app.addHook('onClose', async () => closeDb(db));
  app.get('/health', async () => ({ ok: true }));
  app.get('/api/metrics/overview', async (request,reply) => { const q=request.query as {window?:string};const window=MetricsWindowSchema.safeParse(q.window??'24h');if(!window.success)return reply.code(400).send({error:'Invalid metrics window'});return metricsOverview(db,window.data); });
  app.get('/api/metrics/services/:service', async (request,reply) => { const service=(request.params as {service:string}).service.trim();if(!/^[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$/.test(service))return reply.code(400).send({error:'Invalid service'});const q=request.query as {window?:string};const window=MetricsWindowSchema.safeParse(q.window??'24h');if(!window.success)return reply.code(400).send({error:'Invalid metrics window'});if(!db.prepare('SELECT 1 FROM health_signals WHERE service=? LIMIT 1').get(service))return reply.code(404).send({error:'Service not found'});return serviceMetrics(db,service,window.data); });
  app.post('/api/health-signals', async (request, reply) => {
    const parsed = HealthSignalSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid health signal', details: parsed.error.flatten() });
    const incident = detectIncident(parsed.data, randomUUID());
    const updatedIncident = saveSignalAndIncident(db, parsed.data, incident);
    return reply.code(201).send({ signalAccepted: true, incident: updatedIncident });
  });
  app.post('/api/simulator/scenarios', async (request, reply) => {
    const user=operator(request,reply);if(!user)return;
    const parsed=SimulatorRequestSchema.safeParse(request.body);
    if(!parsed.success)return reply.code(400).send({error:'Invalid simulator scenario',details:parsed.error.flatten()});
    const service=(parsed.data.service??'payment-service');
    if(!SIMULATED_SERVICES.includes(service as SimulatedService))return reply.code(400).send({error:'Unknown simulated service'});
    const signals=signalsForScenario(parsed.data.scenario,service as SimulatedService,new Date().toISOString());
    const accepted=signals.map(signal=>({signal,incident:saveSignalAndIncident(db,signal,detectIncident(signal,randomUUID()))}));
    return reply.code(201).send({scenario:parsed.data.scenario,service,signals:accepted});
  });
  app.get('/api/incidents', async () => listIncidents(db));
  app.get('/api/incidents/:id', async (request, reply) => { const id=IdSchema.safeParse((request.params as { id: string }).id);if(!id.success)return reply.code(400).send({error:'Invalid incident id'}); const item = getIncident(db, id.data); return item ? item : reply.code(404).send({ error: 'Incident not found' }); });
  app.get('/api/incidents/:id/timeline', async (request, reply) => { const id=IdSchema.safeParse((request.params as { id: string }).id);if(!id.success)return reply.code(400).send({error:'Invalid incident id'});const q=request.query as {offset?:string;limit?:string};const offset=Math.max(0,Number(q.offset??0));const limit=Math.min(200,Math.max(1,Number(q.limit??100)));if(!Number.isInteger(offset)||!Number.isInteger(limit))return reply.code(400).send({error:'Invalid timeline pagination'});const timeline=incidentTimeline(db,id.data,offset,limit);return timeline?timeline:reply.code(404).send({error:'Incident not found'}); });
  app.post('/api/incidents/:id/analyze', async (request, reply) => { const id=(request.params as {id:string}).id; const incident=getIncident(db,id); if(!incident)return reply.code(404).send({error:'Incident not found'}); try{const untrusted=await analyzer.analyzeIncident({...incident,recentSignals:recentSignals(db,id)});const parsed=AIAnalysisResultSchema.safeParse(untrusted);if(!parsed.success)throw new Error('AI analyzer returned invalid analysis');const analysis={id:randomUUID(),incidentId:id,provider:analyzer.provider,model:analyzer.model,promptVersion:DIAGNOSIS_PROMPT_VERSION,result:parsed.data,createdAt:new Date().toISOString()};return reply.code(201).send(saveAnalysis(db,analysis));}catch(e){const message=e instanceof Error?redactSensitive(e.message):'AI analysis failed';request.log.warn({message},'AI analysis unavailable');return reply.code(503).send({error:message});} });
  app.get('/api/incidents/:id/analyses', async (request, reply) => { const id=(request.params as {id:string}).id;if(!getIncident(db,id))return reply.code(404).send({error:'Incident not found'});return listAnalyses(db,id); });
  app.get('/api/incidents/:id/proposals', async (request, reply) => { const id=(request.params as {id:string}).id;if(!getIncident(db,id))return reply.code(404).send({error:'Incident not found'});return listProposals(db,id); });
  app.post('/api/proposals/:id/execute', async (request,reply)=>{const user=operator(request,reply);if(!user)return;const id=IdSchema.safeParse((request.params as {id:string}).id);if(!id.success)return reply.code(400).send({error:'Invalid proposal id'});const row=db.prepare('SELECT * FROM proposals WHERE id=?').get(id.data) as any;if(!row)return reply.code(404).send({error:'Proposal not found'});if(row.status!=='approved')return reply.code(409).send({error:'Only approved proposals can run'});const incident=getIncident(db,row.incident_id);if(!incident||incident.status==='resolved')return reply.code(409).send({error:'Incident is not eligible'});let parameters;try{parameters=RemediationParametersSchema.parse(row.parameters_json?JSON.parse(row.parameters_json):null);RemediationRequestSchema.parse({proposalId:row.id,incidentId:row.incident_id,actionType:row.action_type,parameters,mode:'dry_run'});}catch{return reply.code(400).send({error:'Approved proposal has invalid remediation parameters'});}if(parameters.actionType!==row.action_type)return reply.code(400).send({error:'Action type mismatch'});const result=await new DryRunRemediationRunner().execute({proposalId:row.id,incidentId:row.incident_id,actionType:row.action_type,parameters,mode:'dry_run',actor:user.actor});const execution={id:randomUUID(),proposalId:row.id,incidentId:row.incident_id,actionType:row.action_type,mode:'dry_run' as const,status:'simulated' as const,executed:false as const,message:result.message,createdAt:new Date().toISOString()};const saved=saveRemediationAtomic(db,execution,user.actor);return reply.code(saved.id===execution.id?201:200).send(saved);});
  app.get('/api/proposals/:id/executions', async (request,reply)=>{const id=IdSchema.safeParse((request.params as {id:string}).id);if(!id.success)return reply.code(400).send({error:'Invalid proposal id'});if(!db.prepare('SELECT id FROM proposals WHERE id=?').get(id.data))return reply.code(404).send({error:'Proposal not found'});return listRemediationExecutions(db,id.data);});
  app.get('/api/proposals/:id/audit', async (request, reply) => { const id=IdSchema.safeParse((request.params as {id:string}).id);if(!id.success)return reply.code(400).send({error:'Invalid proposal id'});if(!db.prepare('SELECT id FROM proposals WHERE id=?').get(id.data))return reply.code(404).send({error:'Proposal not found'});return listAuditEvents(db,id.data); });
  app.post('/api/incidents/:id/proposals', async (request, reply) => { const user=operator(request,reply);if(!user)return;const idp=IdSchema.safeParse((request.params as {id:string}).id);if(!idp.success)return reply.code(400).send({error:'Invalid incident id'});const id=idp.data;if(!getIncident(db,id))return reply.code(404).send({error:'Incident not found'});const parsed=CreateProposalSchema.safeParse(request.body);if(!parsed.success)return reply.code(400).send({error:'Invalid proposal',details:parsed.error.flatten()});const analysis=listAnalyses(db,id).find(a=>a.id===parsed.data.analysisId);if(!analysis)return reply.code(400).send({error:'Analysis not found for incident'});return reply.code(201).send(createProposal(db,{id:randomUUID(),incidentId:id,analysisId:analysis.id,actionType:parsed.data.actionType,parameters:parsed.data.parameters,description:redactSensitive(parsed.data.description),actor:user.actor,createdAt:new Date().toISOString()})); });
  const decide=async(request:any,reply:any,status:'approved'|'rejected')=>{const user=operator(request,reply);if(!user)return;const id=IdSchema.safeParse(request.params.id);if(!id.success)return reply.code(400).send({error:'Invalid proposal id'});const body=DecisionSchema.safeParse(request.body??{});if(!body.success)return reply.code(400).send({error:'Invalid decision body'});const result=decideProposal(db,id.data,status,user.actor,new Date().toISOString());if(!result)return reply.code(404).send({error:'Proposal not found'});if(result.conflict)return reply.code(409).send({error:'Proposal is no longer pending'});return result.proposal;};
  app.post('/api/proposals/:id/approve', async (request,reply)=>decide(request,reply,'approved'));
  app.post('/api/proposals/:id/reject', async (request,reply)=>decide(request,reply,'rejected'));
  app.get('/api/service-health', async () => listLatestServiceHealth(db));
  app.get('/api/service-health/:service', async (request,reply) => {const service=(request.params as {service:string}).service.trim();if(!/^[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$/.test(service))return reply.code(400).send({error:'Invalid service'});const result=serviceHealth(db,service);return result?result:reply.code(404).send({error:'Service not found'});});
  return app;
}
