import type { RecordAgentExecutionUsageInput } from '../../repository/interaction/agent-interaction.persistence.types';
export const AGENT_EXECUTION_USAGE_TRANSACTION = Symbol('AGENT_EXECUTION_USAGE_TRANSACTION');
export interface AgentExecutionUsageTransactionPort { recordExecutionUsage(input: RecordAgentExecutionUsageInput): Promise<void>; }
