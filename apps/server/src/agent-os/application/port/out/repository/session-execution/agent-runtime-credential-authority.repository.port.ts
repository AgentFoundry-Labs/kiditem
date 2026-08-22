export const AGENT_RUNTIME_CREDENTIAL_AUTHORITY_REPOSITORY = Symbol(
  "AGENT_RUNTIME_CREDENTIAL_AUTHORITY_REPOSITORY",
);

export interface AgentRuntimeCredentialAuthorityRepositoryPort {
  loadRuntimeCredentialAuthority(input: {
    organizationId: string;
    sessionId: string;
    executionId: string;
    attemptId: string;
  }): Promise<{
    organizationId: string;
    sessionId: string;
    executionId: string;
    attemptId: string;
    startIntentId: string | null;
    runtimeCredentialGeneration: number;
    lifecycle: string;
  } | null>;
}
