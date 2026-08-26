'use client';

import { create } from 'zustand';
import {
  agentConversationKeys,
  type AgentConversationKey,
  type ConversationRuntime,
} from './conversation-api';

export { agentConversationKeys } from './conversation-api';

export interface ConversationSelection {
  id: string;
  agentKey: AgentConversationKey | null;
}

export interface NewConversationDraft {
  conversationId: string;
  agentKey: AgentConversationKey | null;
  provider: ConversationRuntime | null;
  model: string | null;
  reasoningEffort: string | null;
  message: string;
}

export interface NewConversationRequest {
  fixedAgentKey: AgentConversationKey | null;
  draft?: string;
}

interface ConversationSurfaceState {
  selectedContext: AgentConversationKey | null;
  activeConversationId: string | null;
  pendingDraft: NewConversationDraft | null;
  selectContext(context: AgentConversationKey | null): void;
  selectConversation(conversation: ConversationSelection): void;
  openConversation(input: NewConversationRequest): NewConversationDraft;
  updateDraft(patch: Partial<Omit<NewConversationDraft, 'conversationId'>>): void;
  discardDraft(): void;
  reset(): void;
}

const initialState = {
  selectedContext: null,
  activeConversationId: null,
  pendingDraft: null,
} satisfies Pick<ConversationSurfaceState, 'selectedContext' | 'activeConversationId' | 'pendingDraft'>;

/** Ephemeral navigation intent only; provider history remains outside browser state. */
export const useConversationSurfaceState = create<ConversationSurfaceState>((set) => ({
  ...initialState,
  selectContext: (selectedContext) => set({
    selectedContext,
    activeConversationId: null,
    pendingDraft: null,
  }),
  selectConversation: (conversation) => set((state) => ({
    selectedContext: conversation.agentKey,
    activeConversationId: conversation.id,
    // Promotion retains its source draft long enough for the coordinator to
    // prevent a response-loss/reconnect replay. Selecting another item drops it.
    pendingDraft: state.pendingDraft?.conversationId === conversation.id
      ? state.pendingDraft
      : null,
  })),
  openConversation: (input) => {
    const conversationId = reserveConversationId();
    const draft: NewConversationDraft = {
      conversationId,
      agentKey: input.fixedAgentKey,
      provider: null,
      model: null,
      reasoningEffort: null,
      message: input.draft ?? '',
    };
    set({
      selectedContext: input.fixedAgentKey,
      activeConversationId: conversationId,
      pendingDraft: draft,
    });
    return draft;
  },
  updateDraft: (patch) => set((state) => {
    if (!state.pendingDraft) return state;
    const pendingDraft = { ...state.pendingDraft, ...patch };
    return {
      pendingDraft,
      selectedContext: pendingDraft.agentKey,
    };
  }),
  discardDraft: () => set((state) => ({
    activeConversationId: state.pendingDraft?.conversationId === state.activeConversationId
      ? null
      : state.activeConversationId,
    pendingDraft: null,
  })),
  reset: () => set(initialState),
}));

export function openConversation(input: NewConversationRequest): NewConversationDraft {
  return useConversationSurfaceState.getState().openConversation(input);
}

function reserveConversationId(): string {
  const randomUUID = globalThis.crypto?.randomUUID;
  if (typeof randomUUID !== 'function') throw new Error('conversation_id_unavailable');
  const conversationId = randomUUID.call(globalThis.crypto);
  if (!conversationId) throw new Error('conversation_id_unavailable');
  return conversationId;
}
