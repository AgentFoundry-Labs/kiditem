import type { AgentConversationEventRecord, AppendExecutionEventInput, MarkAgentExecutionTerminalInput } from '../../repository/interaction/agent-interaction.persistence.types';
export const AGENT_CONVERSATION_EVENT_TRANSACTION = Symbol('AGENT_CONVERSATION_EVENT_TRANSACTION');
export interface AgentConversationEventTransactionPort { appendExecutionEvent(input: AppendExecutionEventInput): Promise<AgentConversationEventRecord>; markExecutionTerminal(input: MarkAgentExecutionTerminalInput): Promise<void>; }
