import type { AgentConversationEventPayload } from './interaction/agent-interaction.persistence.types';

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

/**
 * The only MCP lookup key is an already-verified runtime credential claim.
 * It reconstructs the complete persisted execution envelope, including the
 * current active Operation binding; no transport identity is accepted.
 */
export interface AgentRuntimeCredentialExecutionGraph {
  organizationId: string;
  userId: string;
  sessionId: string;
  sessionLifecycle: string;
  sessionTaskId: string;
  taskStatus: string;
  executionId: string;
  executionStatus: string;
  attemptId: string;
  attemptState: string;
  startIntentId: string | null;
  runtimeCredentialGeneration: number;
  operationRunId: string;
  operationStatus: string;
  operationAttemptToken: string | null;
  agentDefinitionKey: string;
  agentVersion: number;
  policyCapabilityKeys: unknown;
  currentResourceRefs: unknown;
}

export interface AgentExecutionContextRepositoryPort {
  loadExecutionGraph(input: {
    organizationId: string;
    sessionId: string;
    sessionTaskId: string;
    executionId: string;
    attemptId: string;
  }): Promise<AgentExecutionContextGraph | null>;
  loadRuntimeCredentialExecutionGraph(input: {
    organizationId: string;
    sessionId: string;
    executionId: string;
    attemptId: string;
    startIntentId: string;
    runtimeCredentialGeneration: number;
  }): Promise<AgentRuntimeCredentialExecutionGraph | null>;
}
