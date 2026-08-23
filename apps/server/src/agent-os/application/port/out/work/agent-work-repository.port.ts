import type { AgentWorkTaskStatus } from "@kiditem/shared/agent-interaction";

export const AGENT_WORK_REPOSITORY_PORT = Symbol("AGENT_WORK_REPOSITORY_PORT");

export interface OrganizationScopedId {
  id: string;
  organizationId: string;
}

export interface AgentWorkProjection {
  session: OrganizationScopedId;
  tasks: Array<
    OrganizationScopedId & { sessionId: string; status: AgentWorkTaskStatus }
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
  }): Promise<{ taskStatus: AgentWorkTaskStatus; live: boolean } | null>;
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
    targetAgentVersionId: string;
    targetAgentKey: string;
    targetRuntimeType: string;
    targetCapabilityKeys: readonly string[];
  } | null>;
  loadAttemptMcpChild(input: {
    organizationId: string;
    sessionId: string;
    parentTaskId: string;
    childTaskId: string;
    requestedByUserId: string;
  }): Promise<{
    childTaskId: string;
    taskStatus: AgentWorkTaskStatus;
    attemptId: string | null;
    attemptStatus: string | null;
    live: boolean;
    result: unknown | null;
    error: unknown | null;
  } | null>;
  findDueApprovals(input: { now: Date; limit: number }): Promise<Array<{
    organizationId: string;
    sessionId: string;
    invocationId: string;
    approvalId: string;
    inputHash: string;
  }>>;
}
