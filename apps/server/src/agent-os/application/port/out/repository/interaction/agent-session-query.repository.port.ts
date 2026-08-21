import type { AgentSessionRecord, AgentSessionSummaryRecord, FindAccessibleAgentSessionInput, ListAgentSessionsInput } from './agent-interaction.persistence.types';

export const AGENT_SESSION_QUERY_REPOSITORY = Symbol('AGENT_SESSION_QUERY_REPOSITORY');

export interface AgentSessionQueryRepositoryPort {
  listSessions(input: ListAgentSessionsInput): Promise<AgentSessionSummaryRecord[]>;
  findAccessibleSession(input: FindAccessibleAgentSessionInput): Promise<AgentSessionRecord | null>;
}
