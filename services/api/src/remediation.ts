import { RemediationRequestSchema, type RemediationRequest } from '@cloudops/contracts';

export interface RemediationRunner { execute(request: RemediationRequest): Promise<{status:'simulated'; actionType: RemediationRequest['actionType']; target:string; message:string; executed:false}>; }
export class DryRunRemediationRunner implements RemediationRunner {
  async execute(input: RemediationRequest) {
    const request = RemediationRequestSchema.parse(input);
    const target = request.parameters.service;
    const detail = request.actionType === 'restart_service' ? `Would restart service ${target}` : request.actionType === 'scale_service' ? `Would scale service ${target} to ${(request.parameters as any).desiredReplicas} replicas` : `Would rollback deployment ${(request.parameters as any).deploymentVersion} for service ${target}`;
    return { status:'simulated' as const, actionType:request.actionType, target, message:detail, executed:false as const };
  }
}
