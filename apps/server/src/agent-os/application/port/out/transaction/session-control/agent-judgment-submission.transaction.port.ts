export const AGENT_JUDGMENT_SUBMISSION_TRANSACTION = Symbol(
  'AGENT_JUDGMENT_SUBMISSION_TRANSACTION',
);

export interface AgentJudgmentSubmissionTransactionPort {
  submit(input: {
    organizationId: string;
    userId: string;
    agentDefinitionKey: string;
    objective: string;
    resourceRefs: readonly unknown[];
    idempotencyKey: string;
    fingerprint: string;
    authorityProfileVersionId: string;
    authorityProfilePolicyDocument: Record<string, unknown>;
    authorityProfilePolicyHash: string;
    capabilityKeys: readonly string[];
  }): Promise<{
    organizationId: string;
    userId: string;
    sessionId: string;
    taskId: string;
    executionId: string;
    state: 'pending' | 'dispatched';
    operationRunId: string | null;
  }>;
}
