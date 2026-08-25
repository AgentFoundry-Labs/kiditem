export const AGENT_WORK_QUERY_REPOSITORY_PORT = Symbol('AGENT_WORK_QUERY_REPOSITORY_PORT');

export interface AgentWorkQueryRepositoryPort {
  loadOwnedProjection(input: { organizationId: string; userId: string; sessionId: string }): Promise<unknown | null>;
  activeVersion(agentDefinitionKey: string): Promise<{ id: string; agentDefinitionKey: string; runtimeType: string; capabilityKeys: unknown; instructionProfileRef: string } | null>;
  taskVersion(input: { organizationId: string; userId: string; sessionId: string; taskId: string }): Promise<{ id: string; agentDefinitionKey: string; runtimeType: string; capabilityKeys: unknown; instructionProfileRef: string } | null>;
  liveAttempt(input: { organizationId: string; userId: string; sessionId: string; taskId: string; attemptId?: string }): Promise<{ id: string } | null>;
  threadContinuation(input: { organizationId: string; userId: string; sessionId: string }): Promise<{
    taskId: string;
    predecessorAttemptId: string;
    terminal: boolean;
    agentDefinitionKey: string;
  } | null>;
}
