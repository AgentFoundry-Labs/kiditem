'use client';

import { create } from 'zustand';

interface InteractionStoreState {
  isOpen: boolean;
  selectedAgentDefinitionKey: string | null;
  selectedSessionName: string | null;
  selectedThreadId: string | null;
  draft: string;
  latestSuggestionMessageByThread: Record<string, string>;
  consumedSuggestions: Record<string, true>;
  setOpen: (isOpen: boolean) => void;
  selectAgent: (selectedAgentDefinitionKey: string) => void;
  selectSession: (selectedSessionName: string | null, selectedThreadId: string | null) => void;
  setDraft: (draft: string) => void;
  registerLatestSuggestion: (threadId: string, messageId: string) => void;
  consumeSuggestions: (threadId: string, messageId: string) => void;
  consumeLatestSuggestions: (threadId: string) => void;
}

const stateOnly = {
  isOpen: false,
  selectedAgentDefinitionKey: null,
  selectedSessionName: null,
  selectedThreadId: null,
  draft: '',
  latestSuggestionMessageByThread: {},
  consumedSuggestions: {},
} satisfies Pick<
  InteractionStoreState,
  | 'isOpen'
  | 'selectedAgentDefinitionKey'
  | 'selectedSessionName'
  | 'selectedThreadId'
  | 'draft'
  | 'latestSuggestionMessageByThread'
  | 'consumedSuggestions'
>;

export const useInteractionStore = create<InteractionStoreState>((set) => ({
  ...stateOnly,
  setOpen: (isOpen) => set({ isOpen }),
  selectAgent: (selectedAgentDefinitionKey) => set({ selectedAgentDefinitionKey }),
  selectSession: (selectedSessionName, selectedThreadId) => set({
    selectedSessionName,
    selectedThreadId,
  }),
  setDraft: (draft) => set({ draft }),
  registerLatestSuggestion: (threadId, messageId) => set((state) => ({
    latestSuggestionMessageByThread: {
      ...state.latestSuggestionMessageByThread,
      [threadId]: messageId,
    },
  })),
  consumeSuggestions: (threadId, messageId) => set((state) => ({
    consumedSuggestions: {
      ...state.consumedSuggestions,
      [`${threadId}:${messageId}`]: true,
    },
  })),
  consumeLatestSuggestions: (threadId) => set((state) => {
    const messageId = state.latestSuggestionMessageByThread[threadId];
    if (!messageId) return state;
    return {
      consumedSuggestions: {
        ...state.consumedSuggestions,
        [`${threadId}:${messageId}`]: true,
      },
    };
  }),
}));

export function resetInteractionStore(): void {
  useInteractionStore.setState(stateOnly);
}
