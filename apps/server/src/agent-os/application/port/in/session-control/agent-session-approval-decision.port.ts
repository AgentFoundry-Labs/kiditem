import type { AgentSessionName } from '@kiditem/shared/identifiers';

export const AGENT_SESSION_APPROVAL_DECISION_PORT = Symbol('AGENT_SESSION_APPROVAL_DECISION_PORT');
export interface AgentSessionApprovalDecisionPort {
  decide(input: { organizationId: string; session: AgentSessionName; approvalId: string; actorId: string; decision: 'approved' | 'rejected'; argumentsHash?: string; idempotencyKey: string }): Promise<{ state: string }>;
}
