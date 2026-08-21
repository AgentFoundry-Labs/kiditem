import type {
  AgentExecutionName,
  AgentSessionName,
  AgentSessionTaskName,
  OperationRunName,
} from '@kiditem/shared/identifiers';

export const AGENT_SESSION_TASK_EXECUTION_PORT = Symbol(
  'AGENT_SESSION_TASK_EXECUTION_PORT',
);

export type AgentSessionTaskExecutionResult =
  | { status: 'completed'; output: Record<string, unknown> }
  | { status: 'attention_required'; reason: string; output: Record<string, unknown> }
  | { status: 'cancelled'; output: Record<string, unknown> }
  | { status: 'failed'; code: string; message: string };

export interface ExecuteAgentSessionTaskCommand {
  organizationId: string;
  session: AgentSessionName;
  task: AgentSessionTaskName;
  execution: AgentExecutionName;
  operation: OperationRunName;
  operationAttemptToken: string;
  requestedByUserId: string | null;
  signal: AbortSignal;
}

export interface CancelAgentSessionTaskCommand {
  organizationId: string;
  operation: OperationRunName;
  reason: string | null;
  requestedByUserId: string | null;
}

export interface AgentSessionTaskExecutionPort {
  execute(input: ExecuteAgentSessionTaskCommand): Promise<AgentSessionTaskExecutionResult>;
  cancel(input: CancelAgentSessionTaskCommand): Promise<void>;
}
