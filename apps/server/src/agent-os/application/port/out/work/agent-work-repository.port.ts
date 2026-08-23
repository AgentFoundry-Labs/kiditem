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
}
