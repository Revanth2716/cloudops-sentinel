import { z } from 'zod';

export const HealthSignalSchema = z.object({
  service: z.string().trim().min(1).max(200),
  timestamp: z.string().datetime({ offset: true }).transform((value) => new Date(value).toISOString()),
  status: z.enum(['healthy', 'degraded', 'unhealthy']),
  responseTimeMs: z.number().finite().min(0).max(86_400_000),
  error: z.string().trim().max(2000).optional()
});
export type HealthSignal = z.infer<typeof HealthSignalSchema>;
export const SimulatorScenarioSchema = z.enum(['healthy','slow','database_failure','error_spike','recover']);
export type SimulatorScenario = z.infer<typeof SimulatorScenarioSchema>;
export const SimulatorRequestSchema = z.object({scenario: SimulatorScenarioSchema, service: z.string().trim().min(1).max(200).optional()}).strict();
export const MetricsWindowSchema = z.enum(['1h','6h','24h','7d']);
export type MetricsWindow = z.infer<typeof MetricsWindowSchema>;
export const MetricsQuerySchema = z.object({window: MetricsWindowSchema.default('24h')}).strict();
export const MetricValueSchema = z.number().finite().min(0).nullable();
export const MetricsOverviewSchema = z.object({window: MetricsWindowSchema,timeWindow:z.object({start:z.string(),end:z.string()}),availability:MetricValueSchema,errorRate:MetricValueSchema,averageLatencyMs:MetricValueSchema,incidentCount:z.number().int().min(0),openIncidents:z.number().int().min(0),resolvedIncidents:z.number().int().min(0),mttrMs:MetricValueSchema,signalCount:z.number().int().min(0),lastUpdated:z.string()}).strict();
export const ServiceMetricsSchema = z.object({service:z.string(),window:MetricsWindowSchema,availability:MetricValueSchema,errorRate:MetricValueSchema,averageLatencyMs:MetricValueSchema,incidentCount:z.number().int().nonnegative(),openIncidentCount:z.number().int().nonnegative(),latestStatus:z.enum(['healthy','degraded','unhealthy']).nullable(),lastUpdated:z.string()}).strict();
export const IncidentSchema = z.object({
  id: z.string(), service: z.string(), severity: z.enum(['low', 'medium', 'high']),
  condition: z.enum(['degraded', 'unhealthy', 'slow']), status: z.enum(['detected', 'resolved']), detectedAt: z.string(), resolvedAt: z.string().nullable().optional(), observationCount: z.number().int().nonnegative(), latestObservation: z.any().nullable().optional(), summary: z.string()
});
export type Incident = z.infer<typeof IncidentSchema>;
export const TimelineEventSchema = z.object({type:z.string().trim().min(1),at:z.string().datetime({offset:true}),data:z.record(z.string(),z.unknown()).default({})}).strict();
export const TimelineResponseSchema = z.array(TimelineEventSchema);
export const AIAnalysisResultSchema = z.object({summary:z.string().trim().min(1).max(5000),probableRootCause:z.string().trim().min(1).max(5000),evidence:z.array(z.string().trim().min(1).max(2000)).max(20),recommendedActions:z.array(z.string().trim().min(1).max(2000)).max(20),confidence:z.number().finite().min(0).max(1),limitations:z.array(z.string().trim().min(1).max(2000)).max(20)}).strict();
export type AIAnalysisResult = z.infer<typeof AIAnalysisResultSchema>;
export const AIAnalysisSchema = z.object({id:z.string(),incidentId:z.string(),provider:z.string(),model:z.string(),promptVersion:z.string(),result:AIAnalysisResultSchema,createdAt:z.string()});
export type AIAnalysis = z.infer<typeof AIAnalysisSchema>;
export const ProposalActionTypeSchema = z.enum(['restart_service','scale_service','rollback_deployment']);
export type ProposalActionType = z.infer<typeof ProposalActionTypeSchema>;
const SafeTarget = z.string().trim().min(1).max(200).regex(/^[A-Za-z0-9][A-Za-z0-9._/-]*$/, 'Target contains unsupported characters').refine((v) => !/(password|passwd|token|secret|api[_-]?key|bearer|connection|string|authorization)\s*[:=]/i.test(v), 'Secret-like target is not allowed').refine((v) => !/^[A-Za-z][A-Za-z0-9+.-]*:\/\/|^[A-Za-z0-9+/=_-]{20,}\.[A-Za-z0-9+/=_-]{10,}/.test(v), 'Credential or connection string is not allowed');
const ServiceName = SafeTarget;
const DeploymentVersion = SafeTarget;
export const RemediationParametersSchema = z.discriminatedUnion('actionType', [
  z.object({ actionType: z.literal('restart_service'), service: ServiceName }).strict(),
  z.object({ actionType: z.literal('scale_service'), service: ServiceName, desiredReplicas: z.number().int().min(0).max(1000) }).strict(),
  z.object({ actionType: z.literal('rollback_deployment'), service: ServiceName, deploymentVersion: DeploymentVersion }).strict()
]);
export type RemediationParameters = z.infer<typeof RemediationParametersSchema>;
export const ExecutionModeSchema = z.literal('dry_run');
export const RemediationRequestSchema = z.object({proposalId:z.string().uuid(),incidentId:z.string().uuid(),actionType:ProposalActionTypeSchema,parameters:RemediationParametersSchema,mode:ExecutionModeSchema}).strict();
export type RemediationRequest = z.infer<typeof RemediationRequestSchema>;
export const RemediationExecutionSchema = z.object({id:z.string().uuid(),proposalId:z.string().uuid(),incidentId:z.string().uuid(),actionType:ProposalActionTypeSchema,mode:ExecutionModeSchema,status:z.enum(['simulated','failed']),executed:z.literal(false),message:z.string().trim().min(1).max(1000).refine(v=>!/(password|token|secret|api[_-]?key|bearer)\s*[:=]/i.test(v)),createdAt:z.string()}).strict();
export type RemediationExecution = z.infer<typeof RemediationExecutionSchema>;
export const ProposalStatusSchema = z.enum(['pending','approved','rejected']);
export const ProposalSchema = z.object({id:z.string(),incidentId:z.string(),analysisId:z.string(),actionType:ProposalActionTypeSchema,parameters:RemediationParametersSchema.nullable().optional(),description:z.string(),status:ProposalStatusSchema,createdAt:z.string(),decidedAt:z.string().nullable(),decidedBy:z.string().nullable()});
export type Proposal = z.infer<typeof ProposalSchema>;
export const IdSchema=z.string().uuid();
export const CreateProposalSchema = z.object({analysisId:IdSchema,actionType:ProposalActionTypeSchema,parameters:RemediationParametersSchema.optional(),description:z.string().trim().min(1).max(2000)}).strict().superRefine((value,ctx)=>{if(value.parameters && value.parameters.actionType!==value.actionType)ctx.addIssue({code:'custom',message:'Parameter action type must match proposal action type',path:['parameters','actionType']})});
export const DecisionSchema=z.object({}).strict();
export const AuthRequestSchema=z.object({token:z.string().trim().min(16).max(200)}).strict();
export const AuditMetadataSchema=z.discriminatedUnion('kind', [z.object({kind:z.literal('proposal_created'),actionType:ProposalActionTypeSchema,analysisId:IdSchema}).strict(),z.object({kind:z.literal('proposal_decided'),previousStatus:ProposalStatusSchema}).strict(),z.object({kind:z.literal('remediation_requested'),mode:ExecutionModeSchema,actionType:ProposalActionTypeSchema}).strict(),z.object({kind:z.literal('remediation_simulated'),mode:ExecutionModeSchema,executed:z.literal(false)}).strict()]);
export type AuditMetadata=z.infer<typeof AuditMetadataSchema>;
export const AuditEventSchema=z.object({eventType:z.string().trim().min(1).max(100),proposalId:IdSchema,incidentId:IdSchema,createdAt:z.string().datetime({offset:true}),actor:z.string().trim().min(1).max(200),metadata:z.union([AuditMetadataSchema,z.object({actionType:ProposalActionTypeSchema}).strict(),z.object({previousStatus:ProposalStatusSchema}).strict()])}).strict();

const secretPattern = /(password|passwd|token|secret|api[_-]?key|authorization|connectionstring|connection[_-]?string)\s*[:=]\s*[^,;\s]+/gi;
export function redactSensitive(value: string): string {
  return value.slice(0, 10000).replace(secretPattern, '$1=[REDACTED]').replace(/(bearer\s+)[^\s]+/gi, '$1[REDACTED]').replace(/([a-z][a-z0-9+.-]*:\/\/)([^\s/@]+):([^\s/@]+)@/gi, '$1[REDACTED]@[REDACTED]@').replace(/\b(?:sk|pk)_[A-Za-z0-9_-]{12,}\b/g,'[REDACTED]');
}
