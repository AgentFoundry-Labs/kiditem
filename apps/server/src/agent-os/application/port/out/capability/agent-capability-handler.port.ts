import type { AgentResultEnvelope } from '@kiditem/shared/agent-interaction';

/** Final narrow handler contract; capability metadata belongs to CapabilityDefinition. */
export interface AgentCapabilityContractHandler {
  capabilityKey: string;
  invoke(input: {
    context: {
      organizationId: string;
      initiatingUserId: string;
      sessionId: string;
      taskId: string;
      attemptId: string;
      agentVersionId: string;
      /** Present only for a mutation; never supplied by business input. */
      ownerIdempotencyKey?: string;
      applicationVersion: string;
      authorizingGitSha: string;
      runtimeType: string;
    };
    input: Record<string, unknown>;
  }): Promise<AgentResultEnvelope>;
}
