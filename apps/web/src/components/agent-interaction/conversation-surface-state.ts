'use client';

import { create } from 'zustand';
import {
  agentConversationKeys,
  type AgentConversationKey,
} from './conversation-api';

export { agentConversationKeys } from './conversation-api';

export interface ConversationSelection {
  id: string;
  agentKey: AgentConversationKey | null;
}

export interface OpenConversationInput {
  fixedAgentKey: AgentConversationKey | null;
  draft?: string;
}

interface ConversationSurfaceState {
  selectedContext: AgentConversationKey | null;
  activeConversationId: string | null;
  pendingOpen: OpenConversationInput | null;
  selectContext(context: AgentConversationKey | null): void;
  selectConversation(conversation: ConversationSelection): void;
  openConversation(input: OpenConversationInput): void;
  consumePendingOpen(): OpenConversationInput | null;
  reset(): void;
}

const initialState = {
  selectedContext: null,
  activeConversationId: null,
  pendingOpen: null,
} satisfies Pick<ConversationSurfaceState, 'selectedContext' | 'activeConversationId' | 'pendingOpen'>;

/** Ephemeral navigation intent only; provider history remains outside browser state. */
export const useConversationSurfaceState = create<ConversationSurfaceState>((set, get) => ({
  ...initialState,
  selectContext: (selectedContext) => set({ selectedContext, activeConversationId: null }),
  selectConversation: (conversation) => set({
    selectedContext: conversation.agentKey,
    activeConversationId: conversation.id,
    pendingOpen: null,
  }),
  openConversation: (input) => set({
    selectedContext: input.fixedAgentKey,
    activeConversationId: null,
    pendingOpen: { fixedAgentKey: input.fixedAgentKey, ...(input.draft ? { draft: input.draft } : {}) },
  }),
  consumePendingOpen: () => {
    const pendingOpen = get().pendingOpen;
    if (pendingOpen) set({ pendingOpen: null });
    return pendingOpen;
  },
  reset: () => set(initialState),
}));

export function openConversation(input: OpenConversationInput): void {
  useConversationSurfaceState.getState().openConversation(input);
}
