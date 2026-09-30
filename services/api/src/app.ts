import Fastify from 'fastify';
import cors from '@fastify/cors';
import { randomUUID } from 'node:crypto';
import { HealthSignalSchema, redactSensitive } from '@cloudops/contracts';
import { config } from '@cloudops/config';
import { closeDb, createDb, listIncidents, listLatestServiceHealth, saveSignalAndIncident, getIncident, recentSignals, saveAnalysis, listAnalyses } from './db.js';
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
  app.get('/api/service-health', async () => listLatestServiceHealth(db));
  return app;
}
