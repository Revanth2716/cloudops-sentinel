import { z } from 'zod';
import { randomBytes } from 'node:crypto';

const positiveNumber = z.coerce.number().finite().positive();
const ConfigSchema = z.object({
  port: positiveNumber,
  databasePath: z.string().trim().min(1),
  slowResponseMs: positiveNumber,
  unhealthyIncidentSeverity: z.enum(['low', 'medium', 'high']),
  remediationMode: z.literal('dry_run'),
  healthSignalRetentionDays: positiveNumber,
  frontendOrigin: z.string().url(), aiEnabled: z.coerce.boolean(), aiProvider: z.enum(['ollama','fake']), ollamaBaseUrl: z.string().url(), ollamaModel: z.string().trim().min(1), ollamaTimeoutMs: positiveNumber,
  localOperatorToken: z.string().min(16), localViewerToken: z.string().min(16)
});

const result = ConfigSchema.safeParse({
  port: process.env.PORT ?? 3001,
  databasePath: process.env.DATABASE_PATH ?? './data/cloudops.db',
  slowResponseMs: process.env.SLOW_RESPONSE_MS ?? 1000,
  healthSignalRetentionDays: process.env.HEALTH_SIGNAL_RETENTION_DAYS ?? 30,
  unhealthyIncidentSeverity: process.env.UNHEALTHY_INCIDENT_SEVERITY ?? 'high',
  remediationMode: process.env.REMEDIATION_MODE ?? 'dry_run',
  frontendOrigin: process.env.FRONTEND_ORIGIN ?? 'http://127.0.0.1:5173', aiEnabled: process.env.AI_ENABLED ?? 'false', aiProvider: process.env.AI_PROVIDER ?? 'ollama', ollamaBaseUrl: process.env.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434', ollamaModel: process.env.OLLAMA_MODEL ?? 'llama3.2', ollamaTimeoutMs: process.env.OLLAMA_TIMEOUT_MS ?? 15000,
  localOperatorToken: process.env.LOCAL_OPERATOR_TOKEN ?? randomBytes(24).toString('hex'), localViewerToken: process.env.LOCAL_VIEWER_TOKEN ?? randomBytes(24).toString('hex')
});

if (!result.success) {
  throw new Error(`Invalid environment configuration: ${result.error.issues.map((issue) => `${issue.path.join('.') || 'config'}: ${issue.message}`).join('; ')}`);
}

export const config = result.data;
