import type { AgentTaskStatus } from "@kiditem/shared/agent-interaction";

export const AGENT_WORK_REPOSITORY_PORT = Symbol("AGENT_WORK_REPOSITORY_PORT");

export interface OrganizationScopedId {
  id: string;
  organizationId: string;
}

export interface AgentWorkProjection {
  session: OrganizationScopedId;
  tasks: Array<
    OrganizationScopedId & { sessionId: string; status: AgentTaskStatus }
  >;
}

/** Read-only persistence seam. Lifecycle mutations belong to the transaction port. */
export interface AgentWorkRepositoryPort {
  loadProjection(
    input: OrganizationScopedId,
  ): Promise<AgentWorkProjection | null>;
  findDelegationReplay(input: {
    organizationId: string;
    sessionId: string;
    parentTaskId: string;
    idempotencyKey: string;
    requestedByUserId: string;
  }): Promise<{
    childTaskId: string;
    requestHash: string | null;
    firstAttemptId: string | null;
  } | null>;
  loadLiveAttempt(input: {
    organizationId: string;
    sessionId: string;
    taskId: string;
    attemptId: string;
    requestedByUserId: string;
  }): Promise<{ taskStatus: AgentTaskStatus; live: boolean } | null>;
  loadAttemptMcpDelegationContext(input: {
    organizationId: string;
    sessionId: string;
    taskId: string;
    attemptId: string;
    requestedByUserId: string;
    targetAgentKey: string;
  }): Promise<{
    input: unknown;
    applicationVersion: string;
    authorizingGitSha: string;
    cliVersion: string;
    reportedModel: string | null;
    /** Resolved from the server-owned target runtime profile, never its parent. */
    targetModel?: string | null;
    targetAgentVersionId: string;
    targetAgentKey: string;
    targetRuntimeType: string;
    targetCapabilityKeys: readonly string[];
    targetInstructionProfileRef: string;
  } | null>;
  loadAttemptMcpChild(input: {
    organizationId: string;
    sessionId: string;
    parentTaskId: string;
    childTaskId: string;
    requestedByUserId: string;
  }): Promise<{
    childTaskId: string;
    taskStatus: AgentTaskStatus;
    attemptId: string | null;
    attemptStatus: string | null;
    live: boolean;
    result: unknown | null;
    error: unknown | null;
  } | null>;
  loadAttemptMcpInvocation(input: {
    organizationId: string;
    sessionId: string;
    taskId: string;
    attemptId: string;
    requestedByUserId: string;
    invocationId: string;
  }): Promise<{ invocationId: string; status: string; result: unknown | null; error: unknown | null; attemptStartedAt: Date | null } | null>;
  findDueApprovals(input: { now: Date; limit: number }): Promise<Array<{
    organizationId: string;
    sessionId: string;
    invocationId: string;
    approvalId: string;
    inputHash: string;
  }>>;
}
