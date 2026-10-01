import { RemediationParametersSchema, type ProposalActionType } from '@cloudops/contracts';
import type { ApprovedDryRunExecution } from './remediation.js';

export type PolicyContext = Readonly<{ actor: { actor: string; role: 'operator' }; proposal: { id: string; incidentId: string; actionType: ProposalActionType; status: 'approved'; parameters: unknown }; incident: { id: string; status: 'detected' } }>;

/** The only constructor for runner input. It intentionally excludes AI text and request bodies. */
export function approveDryRunPolicy(context: PolicyContext, alreadyExecuted: boolean): ApprovedDryRunExecution {
  if (context.actor.role !== 'operator' || context.proposal.status !== 'approved' || context.incident.id !== context.proposal.incidentId || context.incident.status !== 'detected' || alreadyExecuted) throw new Error('Dry-run policy rejected');
  const parameters = RemediationParametersSchema.parse(context.proposal.parameters);
  if (parameters.actionType !== context.proposal.actionType) throw new Error('Action type mismatch');
  return Object.freeze({ proposalId: context.proposal.id, incidentId: context.incident.id, actionType: context.proposal.actionType, parameters, mode: 'dry_run' as const, actor: context.actor.actor });
}
