export const AGENT_JUDGMENT_DISPATCH_OUTBOX_TRANSACTION = Symbol(
  'AGENT_JUDGMENT_DISPATCH_OUTBOX_TRANSACTION',
);

export interface AgentJudgmentDispatchOutboxTransactionPort {
  listPending(input: { limit: number }): Promise<Array<{
    organizationId: string;
    sessionId: string;
    taskId: string;
    executionId: string;
    requestedByUserId: string;
  }>>;
  claim(input: {
    organizationId: string;
    sessionId: string;
    taskId: string;
    executionId: string;
  }): Promise<
    | { state: 'dispatched'; operationRunId: string }
    | { state: 'pending'; leaseToken: string }
    | { state: 'pending'; leaseToken: null }
  >;
  markDispatched(input: {
    organizationId: string;
    sessionId: string;
    taskId: string;
    executionId: string;
    leaseToken: string;
    operationRunId: string;
  }): Promise<{ operationRunId: string }>;
  release(input: {
    organizationId: string;
    executionId: string;
    leaseToken: string;
  }): Promise<void>;
}
