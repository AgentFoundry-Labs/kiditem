export const AGENT_CONVERSATION_LIVE_PUBLISHER = Symbol(
  'AGENT_CONVERSATION_LIVE_PUBLISHER',
);

export interface AgentConversationLivePointer {
  organizationId: string;
  sessionId: string;
  eventId: string;
  sequence: bigint;
}

export interface AgentConversationLivePublisherPort {
  publish(pointer: AgentConversationLivePointer): Promise<void>;
  subscribe(
    scope: Pick<AgentConversationLivePointer, 'organizationId' | 'sessionId'>,
    listener: (pointer: AgentConversationLivePointer) => void,
  ): () => void;
}
