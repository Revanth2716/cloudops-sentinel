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

const secretPattern = /(password|passwd|token|secret|api[_-]?key|authorization|connectionstring|connection[_-]?string)\s*[:=]\s*[^,;\s]+/gi;
export function redactSensitive(value: string): string {
  return value.replace(secretPattern, '$1=[REDACTED]').replace(/(bearer\s+)[^\s]+/gi, '$1[REDACTED]').replace(/([a-z][a-z0-9+.-]*:\/\/)([^\s/@]+):([^\s/@]+)@/gi, '$1[REDACTED]@[REDACTED]@');
}
