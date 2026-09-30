import Fastify from 'fastify';
import cors from '@fastify/cors';
import { randomUUID } from 'node:crypto';
import { HealthSignalSchema, redactSensitive } from '@cloudops/contracts';
import { config } from '@cloudops/config';
import { closeDb, createDb, listIncidents, listLatestServiceHealth, saveSignalAndIncident } from './db.js';
import { detectIncident } from './incident-detection.js';

export function buildApp(databasePath = config.databasePath) {
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
    saveSignalAndIncident(db, parsed.data, incident);
    return reply.code(201).send({ signalAccepted: true, incident });
  });
  app.get('/api/incidents', async () => listIncidents(db));
  app.get('/api/service-health', async () => listLatestServiceHealth(db));
  return app;
}
