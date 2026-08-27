import type {
  CreateConversationCommand,
  ConversationPreferences,
  ConversationSummary,
  GatewayProviderReadiness,
  ProviderEvent,
  SetConversationPreferenceCommand,
} from '@kiditem/shared/agent-runtime';
import { z } from 'zod';

export const ConversationTurnMessageSchema = z.string().trim().min(1).max(16_000);

export interface ConversationOwner {
  organizationId: string;
  userId: string;
}

export interface ConversationCoordinates extends ConversationOwner {
  conversationId: string;
}

export interface ConversationTurnCoordinates extends ConversationCoordinates {
  turnId: string;
}

export interface ConversationLiveTurn {
  turnId: string;
  ready: Promise<void>;
  subscribe(sink: (event: ProviderEvent) => void): () => void;
}

export interface ConversationPort {
  list(input: ConversationOwner): Promise<ConversationSummary[]>;
  create(input: ConversationOwner & CreateConversationCommand): Promise<ConversationSummary>;
  preferences(owner: ConversationOwner): Promise<ConversationPreferences>;
  setPreference(input: ConversationOwner & SetConversationPreferenceCommand): Promise<ConversationPreferences>;
  /** Verifies the authenticated organization can access a descriptor before adapter-local replay/start. */
  assertAccessible(input: ConversationCoordinates): Promise<void>;
  isRunning(input: ConversationCoordinates): Promise<boolean>;
  /** Resolves the stored exact live turn; callers never provide turn or execution authority. */
  stop(input: ConversationCoordinates): Promise<boolean>;
  rename(input: ConversationCoordinates & { title: string }): Promise<ConversationSummary>;
  delete(input: ConversationCoordinates): Promise<void>;
  start(input: ConversationCoordinates & {
    turnId?: string;
    message: string;
    model: string;
    reasoningEffort: string;
  }): Promise<ConversationLiveTurn>;
  readiness(): readonly GatewayProviderReadiness[] | null;
}

export const CONVERSATION_PORT = Symbol('CONVERSATION_PORT');
/** Injectable UUID factory keeps the transient facade independently testable. */
export type ConversationTurnIdFactory = () => string;
export const CONVERSATION_TURN_ID_FACTORY = Symbol('CONVERSATION_TURN_ID_FACTORY');
