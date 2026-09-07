'use client';

import { create } from 'zustand';
import {
  agentConversationKeys,
  type AgentConversationKey,
  type ConversationRuntime,
} from './conversation-api';
import { useStore } from '@/store/useStore';

export { agentConversationKeys } from './conversation-api';

export interface ConversationSelection {
  id: string;
  agentKey: AgentConversationKey | null;
}

export interface NewConversationDraft {
  draftId: string;
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
  settingsOpen: boolean;
  selectContext(context: AgentConversationKey | null): void;
  selectConversation(conversation: ConversationSelection): void;
  openConversation(input: NewConversationRequest): NewConversationDraft;
  ensureDraft(input: NewConversationRequest): NewConversationDraft | null;
  updateDraft(patch: Partial<Omit<NewConversationDraft, 'draftId'>>): void;
  discardDraft(): void;
  promoteDraft(draftId: string, conversation: ConversationSelection): void;
  completePromotedDraft(draftId: string): void;
  openSettings(trigger?: HTMLElement | null): void;
  closeSettings(): void;
  reset(): void;
}

const initialState = {
  selectedContext: null,
  activeConversationId: null,
  pendingDraft: null,
  settingsOpen: false,
} satisfies Pick<
  ConversationSurfaceState,
  'selectedContext' | 'activeConversationId' | 'pendingDraft' | 'settingsOpen'
>;

let settingsTrigger: HTMLElement | null = null;
let draftSequence = 0;

/** Ephemeral navigation intent only; provider history remains outside browser state. */
export const useConversationSurfaceState = create<ConversationSurfaceState>((set) => ({
  ...initialState,
  selectContext: (selectedContext) => set({
    selectedContext,
    activeConversationId: null,
    pendingDraft: null,
  }),
  selectConversation: (conversation) => set({
    selectedContext: conversation.agentKey,
    activeConversationId: conversation.id,
    pendingDraft: null,
  }),
  openConversation: (input) => {
    const draft = createDraft(input);
    set({
      selectedContext: input.fixedAgentKey,
      activeConversationId: null,
      pendingDraft: draft,
    });
    if (useStore.getState().activeRightSurface !== 'ai_chat') {
      useStore.getState().selectRightSurface('ai_chat');
    }
    return draft;
  },
  ensureDraft: (input) => {
    let draft: NewConversationDraft | null = null;
    set((state) => {
      if (state.activeConversationId !== null || state.pendingDraft) {
        draft = state.activeConversationId === null ? state.pendingDraft : null;
        return state;
      }
      draft = createDraft(input);
      return {
        selectedContext: input.fixedAgentKey,
        activeConversationId: null,
        pendingDraft: draft,
      };
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
  discardDraft: () => set({ pendingDraft: null }),
  promoteDraft: (draftId, conversation) => set((state) => (
    state.pendingDraft?.draftId === draftId
      ? {
          selectedContext: conversation.agentKey,
          activeConversationId: conversation.id,
        }
      : state
  )),
  completePromotedDraft: (draftId) => set((state) => (
    state.pendingDraft?.draftId === draftId
      ? { pendingDraft: null }
      : state
  )),
  openSettings: (trigger) => {
    settingsTrigger = trigger ?? activeElement();
    set({ settingsOpen: true });
  },
  closeSettings: () => {
    const trigger = settingsTrigger;
    settingsTrigger = null;
    set({ settingsOpen: false });
    if (trigger?.isConnected && typeof window !== 'undefined') window.setTimeout(() => trigger.focus(), 0);
  },
  reset: () => {
    settingsTrigger = null;
    set(initialState);
  },
}));

export function openConversation(input: NewConversationRequest): NewConversationDraft {
  return useConversationSurfaceState.getState().openConversation(input);
}

function reserveDraftId(): string {
  draftSequence += 1;
  return `draft-${draftSequence}`;
}

function createDraft(input: NewConversationRequest): NewConversationDraft {
  return {
    draftId: reserveDraftId(),
    agentKey: input.fixedAgentKey,
    provider: null,
    model: null,
    reasoningEffort: null,
    message: input.draft ?? '',
  };
}

function activeElement(): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  return document.activeElement instanceof HTMLElement ? document.activeElement : null;
}
