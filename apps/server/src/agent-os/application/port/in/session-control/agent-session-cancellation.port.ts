import type {
  AgentSessionName,
  AgentSessionTaskName,
} from '@kiditem/shared/identifiers';

export const AGENT_SESSION_CANCELLATION_PORT = Symbol(
  'AGENT_SESSION_CANCELLATION_PORT',
);

export type AgentSessionTaskCancellableStatus =
  | 'queued'
  | 'running'
  | 'waiting_dependency'
  | 'waiting_approval'
  | 'paused';

export interface CancelAgentSessionTaskInput {
  organizationId: string;
  session: AgentSessionName;
  task: AgentSessionTaskName;
  actorId: string;
  idempotencyKey: string;
  expectedStatus: AgentSessionTaskCancellableStatus;
  reason: string | null;
}

export interface AgentSessionCancellationPort {
  cancel(input: CancelAgentSessionTaskInput): Promise<{ status: string }>;
}
