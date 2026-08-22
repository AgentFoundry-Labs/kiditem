export const AGENT_RUNTIME_CREDENTIAL_VERIFICATION_PORT = Symbol(
  "AGENT_RUNTIME_CREDENTIAL_VERIFICATION_PORT",
);

export interface AgentRuntimeCredentialVerificationPort {
  verify(input: { token: string }): Promise<{
    organizationId: string;
    sessionId: string;
    executionId: string;
    attemptId: string;
    startIntentId: string;
    runtimeCredentialGeneration: number;
  }>;
}
