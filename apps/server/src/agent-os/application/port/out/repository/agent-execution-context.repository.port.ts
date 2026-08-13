import type { AgentConversationEventPayload } from './agent-interaction-repository.port';

export const AGENT_EXECUTION_CONTEXT_REPOSITORY = Symbol(
  'AGENT_EXECUTION_CONTEXT_REPOSITORY',
);

export interface AgentExecutionContextGraph {
  organizationId: string;
  sessionId: string;
  sessionLifecycle: string;
  sessionTaskId: string;
  taskStatus: string;
  executionId: string;
  attemptId: string;
  agentVersionId: string;
  agentDefinitionKey: string;
  runtimeType: string;
  modelIdentity: string;
  policySnapshotId: string;
  versionManifest: unknown;
  policyCapabilityKeys: unknown;
  inputHash: string;
  currentInput: unknown;
  currentResourceRefs: unknown;
  currentUserEvent: {
    externalEventId: string;
    sequence: bigint;
    eventType: string;
    schemaVersion: number;
    payload: AgentConversationEventPayload;
  };
}

export interface AgentExecutionContextRepositoryPort {
  loadExecutionGraph(input: {
    organizationId: string;
    sessionId: string;
    sessionTaskId: string;
    executionId: string;
    attemptId: string;
  }): Promise<AgentExecutionContextGraph | null>;
}
