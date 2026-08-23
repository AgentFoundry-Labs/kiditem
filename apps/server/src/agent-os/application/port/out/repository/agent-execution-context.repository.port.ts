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
 * A locally spawned MCP child supplies the exact persisted execution
 * coordinate. The repository reconstructs the complete execution envelope,
 * including the current active Operation binding, and rejects stale epochs.
 */
export interface AgentRuntimeExecutionGraph {
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
  taskGraph: Array<{
    taskId: string;
    parentTaskId: string | null;
    objective: string | null;
    status: string;
    agentDefinitionKey: string;
  }>;
  artifacts: Array<{
    artifactId: string;
    taskId: string;
    executionId: string;
    artifactType: string;
    sha256: string;
    metadata: unknown;
  }>;
}

export interface AgentExecutionContextRepositoryPort {
  loadExecutionGraph(input: {
    organizationId: string;
    sessionId: string;
    sessionTaskId: string;
    executionId: string;
    attemptId: string;
  }): Promise<AgentExecutionContextGraph | null>;
  loadRuntimeExecutionGraph(input: {
    organizationId: string;
    sessionId: string;
    executionId: string;
    attemptId: string;
    startIntentId: string;
    runtimeCredentialGeneration: number;
  }): Promise<AgentRuntimeExecutionGraph | null>;
}
