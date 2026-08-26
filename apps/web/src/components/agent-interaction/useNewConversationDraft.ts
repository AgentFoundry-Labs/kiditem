'use client';

import { useConversationSurfaceState } from './conversation-surface-state';

/** Convenience facade for the single disposable draft held in UI state. */
export function useNewConversationDraft() {
  const draft = useConversationSurfaceState((state) => state.pendingDraft);
  const openConversation = useConversationSurfaceState((state) => state.openConversation);
  const updateDraft = useConversationSurfaceState((state) => state.updateDraft);
  const discardDraft = useConversationSurfaceState((state) => state.discardDraft);

  return { draft, openConversation, updateDraft, discardDraft };
}
