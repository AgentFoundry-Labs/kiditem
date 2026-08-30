import type { ConversationOwner } from '../../in/capability/conversation.port';

/**
 * Durable completed AG-UI event history, fenced by the authenticated owner.
 * It is intentionally not the source of execution authority; the incoming
 * conversation port owns whether a provider turn is live or may be stopped.
 */
export interface ConversationEventHistoryPort {
  delete(owner: ConversationOwner, input: { conversationId: string }): void;
}

export const CONVERSATION_EVENT_HISTORY_PORT = Symbol('CONVERSATION_EVENT_HISTORY_PORT');
