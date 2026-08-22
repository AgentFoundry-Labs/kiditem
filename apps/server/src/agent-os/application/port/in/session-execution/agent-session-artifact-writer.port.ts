import type { NormalizedRuntimeEvent } from '../../out/runtime/agent-durable-runtime.port';

export const AGENT_SESSION_ARTIFACT_WRITER_PORT = Symbol(
  'AGENT_SESSION_ARTIFACT_WRITER_PORT',
);

export interface AgentSessionArtifactMaterializationInput {
  signal: AbortSignal;
  organizationId: string;
  sessionId: string;
  taskId: string;
  executionId: string;
  operationRunId: string;
  attemptToken: string;
  externalArtifactId: string;
  artifactType: string;
  bytes: Uint8Array;
  mimeType: string;
  sha256: string;
  label: string;
  navigationActionId: string;
  metadata: Record<string, unknown>;
}

export interface AgentSessionArtifactWriterPort {
  materialize(
    input: AgentSessionArtifactMaterializationInput,
  ): Promise<Extract<NormalizedRuntimeEvent, { kind: 'artifact' }>>;
  beginFence(input: {
    organizationId: string;
    sessionId: string;
    operationRunIds: readonly string[];
  }): Promise<void>;
  confirmFenced(input: {
    organizationId: string;
    sessionId: string;
    operationRunIds: readonly string[];
  }): Promise<
    | { state: 'fenced' }
    | { state: 'unknown'; code: 'ARTIFACT_WRITER_NOT_FENCED' }
  >;
}
