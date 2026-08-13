import type {
  InteractionClass,
  ThreadBinding,
} from '@kiditem/shared/agent-interaction';

export const AGENT_INTERACTION_REPOSITORY = Symbol(
  'AGENT_INTERACTION_REPOSITORY',
);

export interface QuickAskScope {
  organizationId: string;
  userId: string;
  agentVersionId: string;
}

export interface CreateQuickAskBindingInput extends QuickAskScope {
  id?: string;
  copilotThreadId: string;
  idleExpiresAt: Date;
}

export interface ArchiveInteractionBindingInput {
  organizationId: string;
  id: string;
  archivedAt: Date;
}

export interface AgentInteractionTransactionPort {
  findActiveQuickAsk(scope: QuickAskScope): Promise<ThreadBinding | null>;
  createQuickAskBinding(
    input: CreateQuickAskBindingInput,
  ): Promise<ThreadBinding>;
  archiveBinding(input: ArchiveInteractionBindingInput): Promise<void>;
}

export interface CreateAgentExecutionInput {
  organizationId: string;
  threadBindingId: string;
  copilotThreadId: string;
  aguiRunId: string;
  interactionClass: InteractionClass;
  agentVersionId: string;
  runtimeType: string;
  modelIdentity: string;
  policySnapshotId: string;
  sessionId: string | null;
  sessionTaskId: string | null;
}

export interface MarkAgentExecutionTerminalInput {
  organizationId: string;
  id: string;
  status: 'completed' | 'failed' | 'cancelled';
  errorCode: string | null;
  finishedAt: Date;
}

export interface RecordAgentExecutionUsageInput {
  organizationId: string;
  executionId: string;
  modelIdentity: string;
  provider: string;
  inputTokens: number;
  outputTokens: number;
  costMicros: bigint;
  currency: 'USD';
}

export interface AgentInteractionRepositoryPort
  extends AgentInteractionTransactionPort {
  withQuickAskLock<T>(
    scope: QuickAskScope,
    work: (transaction: AgentInteractionTransactionPort) => Promise<T>,
  ): Promise<T>;
  createExecution(input: CreateAgentExecutionInput): Promise<{ id: string }>;
  markExecutionTerminal(
    input: MarkAgentExecutionTerminalInput,
  ): Promise<void>;
  recordExecutionUsage(input: RecordAgentExecutionUsageInput): Promise<void>;
}
