import { type RemediationExecution, type RemediationParameters, type ProposalActionType } from '@cloudops/contracts';

export type ApprovedDryRunExecution = Readonly<{proposalId:string;incidentId:string;actionType:ProposalActionType;parameters:RemediationParameters;mode:'dry_run';actor:string}>;
export interface RemediationRunner { execute(request: ApprovedDryRunExecution): Promise<Pick<RemediationExecution,'status'|'actionType'|'message'|'executed'>>; }
export class DryRunRemediationRunner implements RemediationRunner {
  async execute(request: ApprovedDryRunExecution) {
    const target = request.parameters.service;
    const detail = request.actionType === 'restart_service' ? `DRY RUN: would restart service ${target}` : request.actionType === 'scale_service' ? `DRY RUN: would scale service ${target} to ${(request.parameters as Extract<RemediationParameters,{actionType:'scale_service'}>).desiredReplicas} replicas` : `DRY RUN: would rollback deployment ${(request.parameters as Extract<RemediationParameters,{actionType:'rollback_deployment'}>).deploymentVersion} for service ${target}`;
    return { status:'simulated' as const, actionType:request.actionType, message:detail, executed:false as const };
  }
}
