import type { AgentSessionApprovalContinuationRecord, IncompleteApprovalContinuationRecord, SessionApprovalDetailRecord, SessionApprovalRecord } from '../../repository/session-control/agent-session-control.persistence.types';
export const AGENT_APPROVAL_CONTINUATION_TRANSACTION = Symbol('AGENT_APPROVAL_CONTINUATION_TRANSACTION');
export interface AgentApprovalContinuationTransactionPort {
  requestApproval(input: { organizationId: string; sessionId: string; taskId: string; executionId: string; attemptId: string; operationRunId: string; capabilityKey: string; argumentsHash: string; resourceSnapshot: unknown[]; expiresAt: Date; idempotencyKey: string }): Promise<SessionApprovalRecord>;
  decideApproval(input: { organizationId: string; sessionId: string; approvalId: string; expectedState: 'pending'; decision: 'approved' | 'rejected'; actorType: string; actorId: string; idempotencyKey: string }): Promise<SessionApprovalRecord>;
  loadApproval(input: { organizationId: string; sessionId: string; approvalId: string }): Promise<SessionApprovalDetailRecord | null>;
  expireApproval(input: { organizationId: string; sessionId: string; approvalId: string; expectedState: 'pending' }): Promise<SessionApprovalRecord>;
  advanceApprovedContinuation(input: { signal: AbortSignal; organizationId: string; sessionId: string; approvalId: string }): Promise<AgentSessionApprovalContinuationRecord>;
  markApprovalContinuationInterruptDelivered(input: { organizationId: string; sessionId: string; approvalId: string; operationRunId: string }): Promise<void>;
  listIncompleteApprovalContinuations(input: { organizationId?: string; limit: number }): Promise<IncompleteApprovalContinuationRecord[]>;
}
