export const AGENT_SESSION_ARTIFACT_MATERIALIZATION_TRANSACTION = Symbol(
  'AGENT_SESSION_ARTIFACT_MATERIALIZATION_TRANSACTION',
);

export interface AgentSessionArtifactMaterializationTransactionPort {
  prepare(input: {
    organizationId: string;
    sessionId: string;
    taskId: string;
    executionId: string;
    operationRunId: string;
    attemptToken: string;
    externalArtifactId: string;
    artifactType: string;
    sha256: string;
  }): Promise<{ artifactId: string; lifecycle: 'materializing' | 'active' }>;
  bindUpload(input: {
    organizationId: string;
    sessionId: string;
    artifactId: string;
    operationRunId: string;
    attemptToken: string;
    uploadId: string;
  }): Promise<void>;
  activate(input: {
    organizationId: string;
    sessionId: string;
    taskId: string;
    executionId: string;
    artifactId: string;
    operationRunId: string;
    attemptToken: string;
    sha256: string;
    metadata: Record<string, unknown>;
  }): Promise<void>;
}
