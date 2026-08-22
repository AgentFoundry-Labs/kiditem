import type {
  AgentSessionName,
  AgentSessionTaskName,
} from '@kiditem/shared/identifiers';

export const OPERATION_CANCELLATION_AGENT_SESSION_TASK_PORT = Symbol(
  'OPERATION_CANCELLATION_AGENT_SESSION_TASK_PORT',
);

export interface OperationCancellationAgentSessionTaskPort {
  cancel(input: {
    organizationId: string;
    actorUserId: string | null;
    session: AgentSessionName;
    task: AgentSessionTaskName;
    idempotencyKey: string;
    expectedStatus:
      | 'queued'
      | 'running'
      | 'waiting_dependency'
      | 'waiting_approval'
      | 'paused';
    reason: string;
  }): Promise<{ status: string }>;
}
