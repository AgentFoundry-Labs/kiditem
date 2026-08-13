'use client';

import { create } from 'zustand';

interface InteractionStoreState {
  isOpen: boolean;
  selectedAgentDefinitionKey: string | null;
  selectedSessionId: string | null;
  selectedThreadId: string | null;
  draft: string;
  setOpen: (isOpen: boolean) => void;
  selectAgent: (selectedAgentDefinitionKey: string) => void;
  selectSession: (selectedSessionId: string | null, selectedThreadId: string | null) => void;
  setDraft: (draft: string) => void;
}

const stateOnly = {
  isOpen: false,
  selectedAgentDefinitionKey: null,
  selectedSessionId: null,
  selectedThreadId: null,
  draft: '',
} satisfies Pick<
  InteractionStoreState,
  | 'isOpen'
  | 'selectedAgentDefinitionKey'
  | 'selectedSessionId'
  | 'selectedThreadId'
  | 'draft'
>;

export const useInteractionStore = create<InteractionStoreState>((set) => ({
  ...stateOnly,
  setOpen: (isOpen) => set({ isOpen }),
  selectAgent: (selectedAgentDefinitionKey) => set({ selectedAgentDefinitionKey }),
  selectSession: (selectedSessionId, selectedThreadId) => set({
    selectedSessionId,
    selectedThreadId,
  }),
  setDraft: (draft) => set({ draft }),
}));

export function resetInteractionStore(): void {
  useInteractionStore.setState(stateOnly);
}
