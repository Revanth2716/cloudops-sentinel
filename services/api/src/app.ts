import Fastify from 'fastify';
import cors from '@fastify/cors';
import { randomUUID } from 'node:crypto';
import { HealthSignalSchema, CreateProposalSchema, redactSensitive } from '@cloudops/contracts';
import { config } from '@cloudops/config';
import { closeDb, createDb, listIncidents, listLatestServiceHealth, saveSignalAndIncident, getIncident, recentSignals, saveAnalysis, listAnalyses, listProposals, createProposal, decideProposal } from './db.js';
import { detectIncident } from './incident-detection.js';
import { OllamaAnalyzer, type AIAnalyzer, DIAGNOSIS_PROMPT_VERSION } from './ai.js';

export function buildApp(databasePath = config.databasePath, analyzer: AIAnalyzer = new OllamaAnalyzer()) {
  const db = createDb(databasePath);
  const app = Fastify({ logger: false });
  app.register(cors, { origin: config.frontendOrigin });
  app.setErrorHandler((error, request, reply) => {
    const safeError = error instanceof Error ? { name: error.name, message: redactSensitive(error.message) } : { name: 'UnknownError', message: 'unknown error' };
    request.log.error({ err: safeError, method: request.method, url: request.url }, 'request failed');
    const statusCode = typeof error === 'object' && error !== null && 'statusCode' in error && typeof error.statusCode === 'number' && error.statusCode >= 400 ? error.statusCode : 500;
    reply.code(statusCode).send({ error: 'Internal server error' });
  });
  app.addHook('onClose', async () => closeDb(db));
  app.get('/health', async () => ({ ok: true }));
  app.post('/api/health-signals', async (request, reply) => {
    const parsed = HealthSignalSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid health signal', details: parsed.error.flatten() });
    const incident = detectIncident(parsed.data, randomUUID());
    const updatedIncident = saveSignalAndIncident(db, parsed.data, incident);
    return reply.code(201).send({ signalAccepted: true, incident: updatedIncident });
  });
  app.get('/api/incidents', async () => listIncidents(db));
  app.get('/api/incidents/:id', async (request, reply) => { const item = getIncident(db, (request.params as { id: string }).id); return item ? item : reply.code(404).send({ error: 'Incident not found' }); });
  app.post('/api/incidents/:id/analyze', async (request, reply) => { const id=(request.params as {id:string}).id; const incident=getIncident(db,id); if(!incident)return reply.code(404).send({error:'Incident not found'}); try{const result=await analyzer.analyzeIncident({...incident,recentSignals:recentSignals(db,id)});const analysis={id:randomUUID(),incidentId:id,provider:analyzer.provider,model:analyzer.model,promptVersion:DIAGNOSIS_PROMPT_VERSION,result,createdAt:new Date().toISOString()};return reply.code(201).send(saveAnalysis(db,analysis));}catch(e){const message=e instanceof Error?redactSensitive(e.message):'AI analysis failed';request.log.warn({message},'AI analysis unavailable');return reply.code(503).send({error:message});} });
  app.get('/api/incidents/:id/analyses', async (request, reply) => { const id=(request.params as {id:string}).id;if(!getIncident(db,id))return reply.code(404).send({error:'Incident not found'});return listAnalyses(db,id); });
  app.get('/api/incidents/:id/proposals', async (request, reply) => { const id=(request.params as {id:string}).id;if(!getIncident(db,id))return reply.code(404).send({error:'Incident not found'});return listProposals(db,id); });
  app.post('/api/incidents/:id/proposals', async (request, reply) => { const id=(request.params as {id:string}).id;if(!getIncident(db,id))return reply.code(404).send({error:'Incident not found'});const parsed=CreateProposalSchema.safeParse(request.body);if(!parsed.success)return reply.code(400).send({error:'Invalid proposal',details:parsed.error.flatten()});const analysis=listAnalyses(db,id).find(a=>a.id===parsed.data.analysisId);if(!analysis)return reply.code(400).send({error:'Analysis not found for incident'});return reply.code(201).send(createProposal(db,{id:randomUUID(),incidentId:id,analysisId:analysis.id,actionType:parsed.data.actionType,description:parsed.data.description,actor:parsed.data.actor??'operator',createdAt:new Date().toISOString()})); });
  const decide=async(request:any,reply:any,status:'approved'|'rejected')=>{const id=request.params.id;const result=decideProposal(db,id,status,request.body?.actor??'operator',new Date().toISOString());if(!result)return reply.code(404).send({error:'Proposal not found'});if(result.conflict)return reply.code(409).send({error:'Proposal is no longer pending'});return result.proposal;};
  app.post('/api/proposals/:id/approve', async (request,reply)=>decide(request,reply,'approved'));
  app.post('/api/proposals/:id/reject', async (request,reply)=>decide(request,reply,'rejected'));
  app.get('/api/service-health', async () => listLatestServiceHealth(db));
  return app;
}
