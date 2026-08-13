import type {
  AgentConversationEventEnvelope,
  AgentConversationEventContent,
  AgentConversationEventType,
  AgentSessionSummary,
  MessageEventPayload,
} from '@kiditem/shared/agent-interaction';

export const AGENT_INTERACTION_REPOSITORY = Symbol(
  'AGENT_INTERACTION_REPOSITORY',
);

export type AgentUserMessageEventPayload = MessageEventPayload;
export type AgentConversationEventPayload =
  AgentConversationEventEnvelope['payload'];

export interface ActiveAgentVersionRecord {
  id: string;
  agentDefinitionKey: string;
  version: number;
  displayName: string;
  description: string;
  runtimeType: string;
  modelIdentity: string;
  capabilityKeys: unknown;
  policyDocument: unknown;
  activatedAt: Date;
  retiredAt: Date | null;
}

export interface FindActiveAgentVersionInput {
  agentDefinitionKey: string;
  agentVersionId: string;
}

export type AgentSessionSummaryRecord = AgentSessionSummary;

export interface AgentSessionRecord {
  id: string;
  organizationId: string;
  createdByUserId: string;
  copilotThreadId: string;
  primaryAgentVersionId: string;
  authorityProfileVersionId: string;
  contextEpoch: number;
  title: string | null;
  lastEventSequence: bigint;
  lifecycle: AgentSessionSummary['lifecycle'];
  completedAt: Date | null;
  cancelledAt: Date | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AgentSessionTaskRecord {
  id: string;
  organizationId: string;
  sessionId: string;
  parentTaskId: string | null;
  assignedAgentVersionId: string;
  objective: string | null;
  isRoot: boolean;
  status: string;
  idempotencyKey: string;
  createdAt: Date;
  updatedAt: Date;
  finishedAt: Date | null;
}

export interface AgentPolicySnapshotRecord {
  id: string;
  organizationId: string;
  sessionId: string;
  agentVersionId: string;
  authorityProfileVersionId: string;
  capabilityKeys: unknown;
  policyHash: string;
  createdAt: Date;
}

export interface AgentExecutionRecord {
  id: string;
  organizationId: string;
  sessionId: string;
  sessionTaskId: string;
  copilotThreadId: string;
  aguiRunId: string;
  agentVersionId: string;
  runtimeType: string;
  modelIdentity: string;
  policySnapshotId: string;
  inputHash: string;
  attempt: number;
  status: string;
  startedAt: Date;
  finishedAt: Date | null;
  errorCode: string | null;
}

export interface AgentConversationEventRecord {
  id: string;
  organizationId: string;
  sessionId: string;
  executionId: string | null;
  externalEventId: string;
  sequence: bigint;
  eventType: AgentConversationEventType;
  schemaVersion: number;
  payload: AgentConversationEventPayload;
  createdAt: Date;
}

export interface AuthorizeAgentExecutionInput {
  organizationId: string;
  userId: string;
  copilotThreadId: string;
  aguiRunId: string;
  agentVersionId: string;
  runtimeType: string;
  modelIdentity: string;
  authorityProfileVersionId: string;
  capabilityKeys: string[];
  policyHash: string;
  inputHash: string;
  userEvent: {
    externalEventId: string;
    schemaVersion: 1;
    payload: AgentUserMessageEventPayload;
  };
}

export interface AuthorizedExecutionRecord {
  createdSession: boolean;
  session: AgentSessionRecord;
  rootTask: AgentSessionTaskRecord;
  contextEpoch: number;
  policy: AgentPolicySnapshotRecord;
  execution: AgentExecutionRecord;
  userEvent: AgentConversationEventRecord;
}

export interface ListAgentSessionsInput {
  organizationId: string;
  userId: string;
  limit: number;
}

export interface FindAccessibleAgentSessionInput {
  organizationId: string;
  userId: string;
  copilotThreadId: string;
}

export interface ReadConversationEventsInput {
  organizationId: string;
  userId: string;
  sessionId: string;
  afterSequence: bigint;
  limit: number;
}

export interface ConversationEventPage {
  events: AgentConversationEventRecord[];
  lastSequence: bigint;
  hasMore: boolean;
}

export interface AgentExecutionRuntimeContext {
  organizationId: string;
  userId: string;
  agentDefinitionKey: string;
  sessionId: string;
  sessionTaskId: string;
  executionId: string;
  copilotThreadId: string;
  aguiRunId: string;
  agentVersionId: string;
  runtimeType: string;
  modelIdentity: string;
  policySnapshotId: string;
  contextEpoch: number;
  lifecycle: AgentSessionSummary['lifecycle'];
  capabilityKeys: string[];
  initialUserEvent: AgentConversationEventRecord;
}

export interface ModelConversationPage {
  events: AgentConversationEventRecord[];
  hasMore: boolean;
}

export interface CurrentAgentExecution {
  organizationId: string;
  agentDefinitionKey: string;
  sessionId: string;
  executionId: string;
  copilotThreadId: string;
  aguiRunId: string;
  runtimeType: string;
  status: string;
}

interface AgentExecutionTerminalInputBase {
  organizationId: string;
  id: string;
  finishedAt: Date;
}

export type MarkAgentExecutionTerminalInput =
  | (AgentExecutionTerminalInputBase & {
      status: 'completed';
      errorCode: null;
    })
  | (AgentExecutionTerminalInputBase & {
      status: 'failed' | 'cancelled';
      errorCode: string | null;
    });

export type AppendExecutionTerminalInput = Omit<
  MarkAgentExecutionTerminalInput,
  'organizationId' | 'id'
>;

interface AppendExecutionEventInputBase {
  organizationId: string;
  sessionId: string;
  executionId: string | null;
  externalEventId: string;
  terminal?: AppendExecutionTerminalInput;
}

export type AppendExecutionEventInput = AppendExecutionEventInputBase &
  AgentConversationEventContent;

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

export interface AgentInteractionRepositoryPort {
  listActiveAgentVersions(): Promise<ActiveAgentVersionRecord[]>;
  findActiveAgentVersion(
    input: FindActiveAgentVersionInput,
  ): Promise<ActiveAgentVersionRecord | null>;
  listSessions(
    input: ListAgentSessionsInput,
  ): Promise<AgentSessionSummaryRecord[]>;
  findAccessibleSession(
    input: FindAccessibleAgentSessionInput,
  ): Promise<AgentSessionRecord | null>;
  readConversationEvents(
    input: ReadConversationEventsInput,
  ): Promise<ConversationEventPage>;
  authorizeExecution(
    input: AuthorizeAgentExecutionInput,
  ): Promise<AuthorizedExecutionRecord>;
  loadExecutionRuntimeContext(input: {
    executionId: string;
  }): Promise<AgentExecutionRuntimeContext | null>;
  readModelConversation(input: {
    organizationId: string;
    sessionId: string;
    throughSequence: bigint;
    limit: number;
  }): Promise<ModelConversationPage>;
  findCurrentExecution(input: {
    executionId: string;
  }): Promise<CurrentAgentExecution | null>;
  appendExecutionEvent(
    input: AppendExecutionEventInput,
  ): Promise<AgentConversationEventRecord>;
  markExecutionTerminal(
    input: MarkAgentExecutionTerminalInput,
  ): Promise<void>;
  recordExecutionUsage(input: RecordAgentExecutionUsageInput): Promise<void>;
  probeHealth(): Promise<void>;
}
