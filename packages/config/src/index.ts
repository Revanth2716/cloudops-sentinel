import { z } from 'zod';

const positiveNumber = z.coerce.number().finite().positive();
const ConfigSchema = z.object({
  port: positiveNumber,
  databasePath: z.string().trim().min(1),
  slowResponseMs: positiveNumber,
  unhealthyIncidentSeverity: z.enum(['low', 'medium', 'high']),
  frontendOrigin: z.string().url()
});

const result = ConfigSchema.safeParse({
  port: process.env.PORT ?? 3001,
  databasePath: process.env.DATABASE_PATH ?? './data/cloudops.db',
  slowResponseMs: process.env.SLOW_RESPONSE_MS ?? 1000,
  unhealthyIncidentSeverity: process.env.UNHEALTHY_INCIDENT_SEVERITY ?? 'high',
  frontendOrigin: process.env.FRONTEND_ORIGIN ?? 'http://127.0.0.1:5173'
});

if (!result.success) {
  throw new Error(`Invalid environment configuration: ${result.error.issues.map((issue) => `${issue.path.join('.') || 'config'}: ${issue.message}`).join('; ')}`);
}

export const config = result.data;
