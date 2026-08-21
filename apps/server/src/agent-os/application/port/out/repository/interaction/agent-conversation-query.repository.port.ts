import type { ConversationEventPage, ModelConversationPage, ReadConversationEventsInput } from './agent-interaction.persistence.types';

export const AGENT_CONVERSATION_QUERY_REPOSITORY = Symbol('AGENT_CONVERSATION_QUERY_REPOSITORY');

export interface AgentConversationQueryRepositoryPort {
  readConversationEvents(input: ReadConversationEventsInput): Promise<ConversationEventPage>;
  readModelConversation(input: { organizationId: string; sessionId: string; throughSequence: bigint; limit: number }): Promise<ModelConversationPage>;
}
