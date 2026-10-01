import { describe, expect, it } from 'vitest';
import { buildApp } from '../services/api/src/app';
import { config } from '@cloudops/config';
import { AIAnalysisResultSchema } from '@cloudops/contracts';

const operator = { authorization: `Bearer ${config.localOperatorToken}` };
const viewer = { authorization: `Bearer ${config.localViewerToken}` };
const result = { summary: 'summary', probableRootCause: 'cause', evidence: ['signal'], recommendedActions: ['inspect'], confidence: .7, limitations: [] };
const fake = { provider: 'fake', model: 'test', analyzeIncident: async () => result };

async function setup() {
  const app = buildApp(':memory:', fake);
  const signal = await app.inject({ method: 'POST', url: '/api/health-signals', payload: { service: 'checkout', timestamp: '2026-09-30T10:00:00Z', status: 'unhealthy', responseTimeMs: 500 } });
  const incidentId = signal.json().incident.id;
  const analysis = await app.inject({ method: 'POST', url: `/api/incidents/${incidentId}/analyze` });
  const analysisId = analysis.json().id;
  const create = async (headers: Record<string, string> = operator, description = 'Restart checkout') => app.inject({ method: 'POST', url: `/api/incidents/${incidentId}/proposals`, headers, payload: { analysisId, actionType: 'restart_service', description } });
  return { app, incidentId, create };
}

describe('approval security HTTP regressions', () => {
  it.each([
    ['unauthenticated proposal creation', (s: Awaited<ReturnType<typeof setup>>) => s.create({})],
    ['unauthenticated approval', async (s: Awaited<ReturnType<typeof setup>>) => { const p = (await s.create()).json(); return s.app.inject({ method: 'POST', url: `/api/proposals/${p.id}/approve`, payload: {} }); }],
    ['unauthenticated rejection', async (s: Awaited<ReturnType<typeof setup>>) => { const p = (await s.create()).json(); return s.app.inject({ method: 'POST', url: `/api/proposals/${p.id}/reject`, payload: {} }); }]
  ])('%s is rejected', async (_name, request) => { const s = await setup(); expect((await request(s)).statusCode).toBe(401); await s.app.close(); });

  it.each([
    ['viewer cannot create', async (s: Awaited<ReturnType<typeof setup>>) => s.create(viewer)],
    ['viewer cannot approve', async (s: Awaited<ReturnType<typeof setup>>) => { const p = (await s.create()).json(); return s.app.inject({ method: 'POST', url: `/api/proposals/${p.id}/approve`, headers: viewer, payload: {} }); }],
    ['viewer cannot reject', async (s: Awaited<ReturnType<typeof setup>>) => { const p = (await s.create()).json(); return s.app.inject({ method: 'POST', url: `/api/proposals/${p.id}/reject`, headers: viewer, payload: {} }); }]
  ])('%s', async (_name, request) => { const s = await setup(); expect((await request(s)).statusCode).toBe(403); await s.app.close(); });

  it('operator can create, approve, and reject, and server context supplies actor', async () => {
    const s = await setup();
    const created = await s.create(operator);
    expect(created.statusCode).toBe(201);
    const proposal = created.json();
    expect((await s.app.inject({ method: 'POST', url: `/api/proposals/${proposal.id}/approve`, headers: operator, payload: {} })).statusCode).toBe(200);
    const second = (await s.create()).json();
    expect((await s.app.inject({ method: 'POST', url: `/api/proposals/${second.id}/reject`, headers: operator, payload: {} })).statusCode).toBe(200);
    expect((await s.app.inject({ method: 'POST', url: `/api/incidents/${s.incidentId}/proposals`, headers: operator, payload: { analysisId: proposal.analysisId, actionType: 'restart_service', description: 'x', actor: 'spoofed' } })).statusCode).toBe(400);
    await s.app.close();
  });

  it('rejects malformed IDs, bodies, and oversized fields', async () => {
    const s = await setup();
    expect((await s.app.inject({ method: 'POST', url: '/api/incidents/not-a-uuid/proposals', headers: operator, payload: {} })).statusCode).toBe(400);
    expect((await s.app.inject({ method: 'POST', url: '/api/proposals/not-a-uuid/approve', headers: operator, payload: {} })).statusCode).toBe(400);
    expect((await s.app.inject({ method: 'POST', url: `/api/incidents/${s.incidentId}/proposals`, headers: operator, payload: {} })).statusCode).toBe(400);
    const valid = await s.create(); const id = valid.json().id;
    for (const path of ['approve', 'reject']) expect((await s.app.inject({ method: 'POST', url: `/api/proposals/${id}/${path}`, headers: operator, payload: { unexpected: true } })).statusCode).toBe(400);
    expect((await s.app.inject({ method: 'POST', url: `/api/incidents/${s.incidentId}/proposals`, headers: operator, payload: { analysisId: valid.json().analysisId, actionType: 'restart_service', description: 'x'.repeat(2001) } })).statusCode).toBe(400);
    await s.app.close();
  });

  it('redacts secret-like proposal descriptions and preserves advisory AI structure', async () => {
    const malicious = { ...result, recommendedActions: ['run: rm -rf /', 'execute arbitrary command'], shell: 'rm -rf /' };
    const s = await setup();
    const p = await s.create(operator, 'token=topsecret password=hunter2');
    expect(p.json().description).toContain('[REDACTED]');
    expect(() => AIAnalysisResultSchema.parse(malicious)).toThrow();
    await s.app.close();
  });
});
