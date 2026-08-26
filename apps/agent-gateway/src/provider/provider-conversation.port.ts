import type {
  Model,
  ProviderEvent,
  ProviderMessage,
  ProviderReadiness,
  ProviderRuntime,
  ReasoningEffort,
} from '@kiditem/shared/agent-runtime';
import type { GatewayInstructionProfile } from '../profile/agent-profile.catalog';

/** Provider-local reference; it never crosses the Gateway/Nest boundary. */
export interface ProviderConversationSummary {
  providerConversationRef: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export type ProviderConversation = ProviderConversationSummary;

export interface CreateProviderConversation {
  /** Static MCP routing locator configured with the provider-local conversation. */
  conversationId: string;
  title?: string;
  /** Gateway-owned immutable profile selected from the descriptor agentKey. */
  instructionProfile: GatewayInstructionProfile;
}

export interface StartProviderTurn {
  providerConversationRef: string;
  /** Re-supplied after Gateway restart when a provider thread needs one configuration resume. */
  conversationId: string;
  turnId: string;
  message: string;
  model: Model;
  reasoningEffort: ReasoningEffort;
  /** Re-derived from the immutable descriptor on every provider resume. */
  instructionProfile: GatewayInstructionProfile;
}

export interface SendProviderInput {
  providerConversationRef: string;
  turnId: string;
  message: string;
}

export interface InterruptProviderTurn {
  providerConversationRef: string;
  turnId: string;
}

export type ProviderEventSink = (event: ProviderEvent) => void;

export interface ProviderConversationPort {
  readonly runtime: ProviderRuntime;
  list(): Promise<ProviderConversationSummary[]>;
  create(input: CreateProviderConversation): Promise<ProviderConversation>;
  history(providerConversationRef: string): Promise<ProviderMessage[]>;
  rename(providerConversationRef: string, title: string): Promise<void>;
  delete(providerConversationRef: string): Promise<void>;
  startTurn(input: StartProviderTurn, sink: ProviderEventSink): Promise<void>;
  sendInput(input: SendProviderInput): Promise<void>;
  interrupt(input: InterruptProviderTurn): Promise<void>;
  readiness(): Promise<ProviderReadiness>;
}
