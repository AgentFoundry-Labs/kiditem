import type { AgentExecutionRuntimeContext, CurrentAgentExecution } from './agent-interaction.persistence.types';

export const AGENT_EXECUTION_QUERY_REPOSITORY = Symbol('AGENT_EXECUTION_QUERY_REPOSITORY');

export interface AgentExecutionQueryRepositoryPort {
  loadExecutionRuntimeContext(input: { executionId: string }): Promise<AgentExecutionRuntimeContext | null>;
  findCurrentExecution(input: { executionId: string }): Promise<CurrentAgentExecution | null>;
  findAccessibleCurrentExecution(input: { organizationId: string; userId: string; sessionId: string; copilotThreadId: string }): Promise<CurrentAgentExecution | null>;
  findCurrentSessionExecution(input: { sessionId: string; copilotThreadId: string }): Promise<CurrentAgentExecution | null>;
}
