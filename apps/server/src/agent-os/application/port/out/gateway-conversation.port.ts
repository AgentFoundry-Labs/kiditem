import type {
  CreateConversationCommand,
  ConversationPreferences,
  ConversationSummary,
  GatewayProviderReadiness,
  ProviderEvent,
  ProviderMessage,
  SetConversationPreferenceCommand,
} from '@kiditem/shared/agent-runtime';

/** Server-side owner fence. It is never accepted from a browser payload. */
export interface GatewayConversationOwner {
  organizationId: string;
  userId: string;
}

export interface GatewayConversationCoordinates extends GatewayConversationOwner {
  conversationId: string;
}

export interface GatewayTurnCoordinates extends GatewayConversationCoordinates {
  turnId: string;
}

export interface GatewayLiveTurn {
  turnId: string;
  ready: Promise<void>;
  subscribe(sink: (event: ProviderEvent) => void): () => void;
}

export interface GatewayConversationPort {
  list(input: GatewayConversationOwner): Promise<ConversationSummary[]>;
  create(input: GatewayConversationOwner & CreateConversationCommand): Promise<ConversationSummary>;
  preferences(owner: GatewayConversationOwner): Promise<ConversationPreferences>;
  setPreference(input: GatewayConversationOwner & SetConversationPreferenceCommand): Promise<ConversationPreferences>;
  history(input: GatewayConversationCoordinates): Promise<ProviderMessage[]>;
  rename(input: GatewayConversationCoordinates & { title: string }): Promise<ConversationSummary>;
  delete(input: GatewayConversationCoordinates): Promise<void>;
  start(input: GatewayTurnCoordinates & {
    message: string;
    model: string;
    reasoningEffort: string;
  }): GatewayLiveTurn;
  input(input: GatewayTurnCoordinates & { message: string }): Promise<void>;
  interrupt(input: GatewayTurnCoordinates): Promise<void>;
  /** Closes a browser subscriber; it must never manufacture a replacement turn. */
  disconnect(input: GatewayTurnCoordinates): void;
  readiness(): readonly GatewayProviderReadiness[] | null;
}

export const GATEWAY_CONVERSATION_PORT = Symbol('GATEWAY_CONVERSATION_PORT');
