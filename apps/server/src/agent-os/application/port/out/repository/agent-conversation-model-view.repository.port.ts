import type {
  AgentConversationEventPayload,
} from '../repository/agent-interaction-repository.port';
import type { AgentConversationEventType } from '@kiditem/shared/agent-interaction';
import type { VersionedConversationSummary } from '../runtime/agent-durable-runtime.port';

export const AGENT_CONVERSATION_MODEL_VIEW_REPOSITORY = Symbol(
  'AGENT_CONVERSATION_MODEL_VIEW_REPOSITORY',
);

export interface CanonicalModelEventRecord {
  id?: string;
  sequence: bigint;
  eventType: AgentConversationEventType;
  schemaVersion?: number;
  payload: AgentConversationEventPayload;
}

export interface AgentConversationModelViewRepositoryPort {
  listCanonicalEvents(input: {
    organizationId: string;
    sessionId: string;
  }): Promise<CanonicalModelEventRecord[]>;
  findConversationSummary(input: {
    organizationId: string;
    sessionId: string;
    sourceFromSequence: bigint;
    sourceThroughSequence: bigint;
    sourceHash: string;
    summarizerModelIdentity: string;
    summaryPromptHash: string;
  }): Promise<VersionedConversationSummary | null>;
  createConversationSummary(input: {
    organizationId: string;
    sessionId: string;
    executionId: string;
    summary: VersionedConversationSummary;
  }): Promise<VersionedConversationSummary>;
}
