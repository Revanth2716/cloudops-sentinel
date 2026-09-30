import { describe, expect, it } from 'vitest';
import { HealthSignalSchema } from '@cloudops/contracts';
describe('health signal validation', () => { it('accepts valid input', () => expect(HealthSignalSchema.safeParse({ service:'web', timestamp:'2026-09-30T10:00:00Z', status:'healthy', responseTimeMs:10 }).success).toBe(true)); it('rejects invalid input', () => expect(HealthSignalSchema.safeParse({ service:'', timestamp:'bad', status:'unknown', responseTimeMs:-1 }).success).toBe(false)); });
