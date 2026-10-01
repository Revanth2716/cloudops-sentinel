import { z } from 'zod';

export const HealthSignalSchema = z.object({
  service: z.string().trim().min(1).max(200),
  timestamp: z.string().datetime({ offset: true }).transform((value) => new Date(value).toISOString()),
  status: z.enum(['healthy', 'degraded', 'unhealthy']),
  responseTimeMs: z.number().finite().min(0).max(86_400_000),
  error: z.string().trim().max(2000).optional()
});
export type HealthSignal = z.infer<typeof HealthSignalSchema>;
export const IncidentSchema = z.object({
  id: z.string(), service: z.string(), severity: z.enum(['low', 'medium', 'high']),
  condition: z.enum(['degraded', 'unhealthy', 'slow']), status: z.enum(['detected', 'resolved']), detectedAt: z.string(), resolvedAt: z.string().nullable().optional(), observationCount: z.number().int().nonnegative(), latestObservation: z.any().nullable().optional(), summary: z.string()
});
export type Incident = z.infer<typeof IncidentSchema>;
export const AIAnalysisResultSchema = z.object({summary:z.string().trim().min(1).max(5000),probableRootCause:z.string().trim().min(1).max(5000),evidence:z.array(z.string().trim().min(1).max(2000)).max(20),recommendedActions:z.array(z.string().trim().min(1).max(2000)).max(20),confidence:z.number().finite().min(0).max(1),limitations:z.array(z.string().trim().min(1).max(2000)).max(20)}).strict();
export type AIAnalysisResult = z.infer<typeof AIAnalysisResultSchema>;
export const AIAnalysisSchema = z.object({id:z.string(),incidentId:z.string(),provider:z.string(),model:z.string(),promptVersion:z.string(),result:AIAnalysisResultSchema,createdAt:z.string()});
export type AIAnalysis = z.infer<typeof AIAnalysisSchema>;
export const ProposalActionTypeSchema = z.enum(['restart_service','scale_service','rollback_deployment']);
export type ProposalActionType = z.infer<typeof ProposalActionTypeSchema>;
export const ProposalStatusSchema = z.enum(['pending','approved','rejected']);
export const ProposalSchema = z.object({id:z.string(),incidentId:z.string(),analysisId:z.string(),actionType:ProposalActionTypeSchema,description:z.string(),status:ProposalStatusSchema,createdAt:z.string(),decidedAt:z.string().nullable(),decidedBy:z.string().nullable()});
export type Proposal = z.infer<typeof ProposalSchema>;
export const IdSchema=z.string().uuid();
export const CreateProposalSchema = z.object({analysisId:IdSchema,actionType:ProposalActionTypeSchema,description:z.string().trim().min(1).max(2000)}).strict();
export const DecisionSchema=z.object({}).strict();
export const AuthRequestSchema=z.object({token:z.string().trim().min(16).max(200)}).strict();
export const AuditEventSchema=z.object({eventType:z.string().trim().min(1).max(100),proposalId:IdSchema,incidentId:IdSchema,createdAt:z.string().datetime({offset:true}),actor:z.string().trim().min(1).max(200),metadata:z.record(z.string(),z.unknown())}).strict();

const secretPattern = /(password|passwd|token|secret|api[_-]?key|authorization|connectionstring|connection[_-]?string)\s*[:=]\s*[^,;\s]+/gi;
export function redactSensitive(value: string): string {
  return value.slice(0, 10000).replace(secretPattern, '$1=[REDACTED]').replace(/(bearer\s+)[^\s]+/gi, '$1[REDACTED]').replace(/([a-z][a-z0-9+.-]*:\/\/)([^\s/@]+):([^\s/@]+)@/gi, '$1[REDACTED]@[REDACTED]@').replace(/\b(?:sk|pk)_[A-Za-z0-9_-]{12,}\b/g,'[REDACTED]');
}
