'use client';

import { useEffect } from 'react';
import { create } from 'zustand';

const SESSION_QUERY_KEY = 'agentSessionId';
const SESSION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const interactionAgentDefinitionKeys = [
  'operator',
  'sourcing',
  'merchandising',
  'supply',
  'channel_operations',
  'advertising',
] as const;

export type InteractionAgentDefinitionKey = (typeof interactionAgentDefinitionKeys)[number];

export interface OpenInteractionInput {
  agentDefinitionKey?: InteractionAgentDefinitionKey | null;
  draft?: string;
  sessionId?: string | null;
}

export interface QueuedInteractionPrompt {
  id: string;
  text: string;
  agentDefinitionKey: InteractionAgentDefinitionKey;
}

interface InteractionSurfaceState {
  isOpen: boolean;
  selectedAgentDefinitionKey: InteractionAgentDefinitionKey | null;
  draft: string;
  sessionId: string | null;
  queuedPrompt: QueuedInteractionPrompt | null;
  openInteraction(input?: OpenInteractionInput): void;
  closeInteraction(): void;
  setDraft(draft: string): void;
  startInteraction(agentOverride?: InteractionAgentDefinitionKey): {
    sessionId: string;
    createdSession: boolean;
  } | null;
  consumeQueuedPrompt(promptId: string): void;
  clearSession(): void;
  pinDurableAgent(agentDefinitionKey: InteractionAgentDefinitionKey): void;
  synchronizeSessionCoordinate(): void;
}

function initialState() {
  return {
    isOpen: false,
    selectedAgentDefinitionKey: null,
    draft: '',
    sessionId: readSessionCoordinate(),
    queuedPrompt: null,
  } satisfies Pick<
    InteractionSurfaceState,
    'isOpen' | 'selectedAgentDefinitionKey' | 'draft' | 'sessionId' | 'queuedPrompt'
  >;
}

/**
 * Owns the interaction context and the durable Agent Work session coordinate.
 * Domain callers only open an interaction; this Module keeps URL and UI state
 * aligned before the Surface reaches the CopilotKit Adapter.
 */
export const useInteractionSurfaceState = create<InteractionSurfaceState>((set, get) => ({
  ...initialState(),
  openInteraction: (input = {}) => {
    const hasAgent = Object.prototype.hasOwnProperty.call(input, 'agentDefinitionKey');
    const hasDraft = Object.prototype.hasOwnProperty.call(input, 'draft');
    const hasSession = Object.prototype.hasOwnProperty.call(input, 'sessionId');
    const sessionId = hasSession ? normalizeSessionId(input.sessionId) : undefined;

    if (hasSession) writeSessionCoordinate(sessionId);

    set((state) => ({
      isOpen: true,
      selectedAgentDefinitionKey: hasAgent
        ? input.agentDefinitionKey ?? null
        : state.selectedAgentDefinitionKey,
      draft: hasDraft ? input.draft ?? '' : state.draft,
      sessionId: hasSession ? sessionId ?? null : state.sessionId,
      queuedPrompt: hasAgent || hasDraft || hasSession ? null : state.queuedPrompt,
    }));
  },
  closeInteraction: () => set({ isOpen: false, draft: '', queuedPrompt: null }),
  setDraft: (draft) => set({ draft }),
  startInteraction: (agentOverride) => {
    const state = get();
    const text = state.draft.trim();
    if (!text) return null;

    const createdSession = state.sessionId === null;
    const sessionId = state.sessionId ?? crypto.randomUUID();
    const agentDefinitionKey = agentOverride ?? state.selectedAgentDefinitionKey ?? 'operator';
    if (createdSession) writeSessionCoordinate(sessionId);

    set({
      sessionId,
      draft: '',
      queuedPrompt: {
        id: crypto.randomUUID(),
        text,
        agentDefinitionKey,
      },
    });
    return { sessionId, createdSession };
  },
  consumeQueuedPrompt: (promptId) => set((state) => (
    state.queuedPrompt?.id === promptId ? { queuedPrompt: null } : {}
  )),
  clearSession: () => {
    writeSessionCoordinate(null);
    set({ sessionId: null, draft: '', queuedPrompt: null });
  },
  pinDurableAgent: (agentDefinitionKey) => set({ selectedAgentDefinitionKey: agentDefinitionKey }),
  synchronizeSessionCoordinate: () => {
    const sessionId = readSessionCoordinate();
    if (sessionId === get().sessionId) return;
    set({ sessionId, queuedPrompt: null });
  },
}));

export function openInteraction(input?: OpenInteractionInput): void {
  useInteractionSurfaceState.getState().openInteraction(input);
}

export function closeInteraction(): void {
  useInteractionSurfaceState.getState().closeInteraction();
}

export function setInteractionDraft(draft: string): void {
  useInteractionSurfaceState.getState().setDraft(draft);
}

export function startInteraction(
  agentDefinitionKey?: InteractionAgentDefinitionKey,
): { sessionId: string; createdSession: boolean } | null {
  return useInteractionSurfaceState.getState().startInteraction(agentDefinitionKey);
}

export function consumeQueuedInteractionPrompt(promptId: string): void {
  useInteractionSurfaceState.getState().consumeQueuedPrompt(promptId);
}

export function clearInteractionSession(): void {
  useInteractionSurfaceState.getState().clearSession();
}

export function pinDurableInteractionAgent(agentDefinitionKey: InteractionAgentDefinitionKey): void {
  useInteractionSurfaceState.getState().pinDurableAgent(agentDefinitionKey);
}

export function useInteractionSessionCoordinate(): void {
  const synchronizeSessionCoordinate = useInteractionSurfaceState(
    (state) => state.synchronizeSessionCoordinate,
  );

  useEffect(() => {
    synchronizeSessionCoordinate();
    window.addEventListener('popstate', synchronizeSessionCoordinate);
    return () => window.removeEventListener('popstate', synchronizeSessionCoordinate);
  }, [synchronizeSessionCoordinate]);
}

export function resolvedInteractionAgent(
  selectedAgentDefinitionKey: InteractionAgentDefinitionKey | null,
): InteractionAgentDefinitionKey {
  return selectedAgentDefinitionKey ?? 'operator';
}

export function isInteractionAgentDefinitionKey(
  value: unknown,
): value is InteractionAgentDefinitionKey {
  return typeof value === 'string'
    && interactionAgentDefinitionKeys.includes(value as InteractionAgentDefinitionKey);
}

function readSessionCoordinate(): string | null {
  if (typeof window === 'undefined') return null;
  return normalizeSessionId(new URLSearchParams(window.location.search).get(SESSION_QUERY_KEY));
}

function normalizeSessionId(sessionId: string | null | undefined): string | null {
  return sessionId && SESSION_ID_PATTERN.test(sessionId) ? sessionId : null;
}

function writeSessionCoordinate(sessionId: string | null | undefined): void {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  if (sessionId) url.searchParams.set(SESSION_QUERY_KEY, sessionId);
  else url.searchParams.delete(SESSION_QUERY_KEY);
  window.history.replaceState(window.history.state, '', url);
}
