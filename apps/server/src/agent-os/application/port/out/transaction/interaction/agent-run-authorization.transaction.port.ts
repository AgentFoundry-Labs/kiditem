import type { AuthorizeAgentExecutionInput, AuthorizedExecutionRecord } from '../../repository/interaction/agent-interaction.persistence.types';
export const AGENT_RUN_AUTHORIZATION_TRANSACTION = Symbol('AGENT_RUN_AUTHORIZATION_TRANSACTION');
export interface AgentRunAuthorizationTransactionPort { authorizeExecution(input: AuthorizeAgentExecutionInput): Promise<AuthorizedExecutionRecord>; }
