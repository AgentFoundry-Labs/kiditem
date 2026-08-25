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
  /** Caller-owned logical command identity; stable across an ambiguous transport retry. */
  messageCommandKey: string;
  /** Local submission identity; renewed when the same logical command is retried. */
  id: string;
  text: string;
  agentDefinitionKey: InteractionAgentDefinitionKey;
  createdSession: boolean;
  baseline: InteractionAttemptBaseline | null;
  expectedSuccessorAttemptId: string | null;
}

/** Ephemeral proof coordinate for one follow-up; it is never persisted as chat state. */
export interface InteractionAttemptBaseline {
  taskId: string;
  latestAttempt: { id: string; ordinal: number } | null;
}

export type InteractionSubmissionStatus =
  | 'idle'
  | 'queued'
  | 'submitting'
  | 'reconciliation_failed'
  | 'retry_ready';

interface InteractionSurfaceState {
  isOpen: boolean;
  selectedAgentDefinitionKey: InteractionAgentDefinitionKey | null;
  draft: string;
  sessionId: string | null;
  queuedPrompt: QueuedInteractionPrompt | null;
  submissionStatus: InteractionSubmissionStatus;
  submissionError: string | null;
  openInteraction(input?: OpenInteractionInput): void;
  closeInteraction(): void;
  setDraft(draft: string): void;
  startInteraction(
    agentOverride?: InteractionAgentDefinitionKey,
    baseline?: InteractionAttemptBaseline | null,
  ): {
    sessionId: string;
    createdSession: boolean;
  } | null;
  markPromptSubmitting(input: { sessionId: string; promptId: string }): void;
  recordSuccessorAdmission(input: { sessionId: string; promptId: string; attemptId: string }): void;
  admitQueuedPrompt(input: { sessionId: string; promptId: string }): void;
  restoreUnadmittedPrompt(input: { sessionId: string; promptId: string; error?: string }): void;
  markPromptReconciliationFailed(input: { sessionId: string; promptId: string; error: string }): void;
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
    submissionStatus: 'idle',
    submissionError: null,
  } satisfies Pick<
    InteractionSurfaceState,
    | 'isOpen'
    | 'selectedAgentDefinitionKey'
    | 'draft'
    | 'sessionId'
    | 'queuedPrompt'
    | 'submissionStatus'
    | 'submissionError'
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
    if (get().queuedPrompt) {
      set({ isOpen: true });
      return;
    }
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
      submissionStatus: hasAgent || hasDraft || hasSession ? 'idle' : state.submissionStatus,
      submissionError: hasAgent || hasDraft || hasSession ? null : state.submissionError,
    }));
  },
  closeInteraction: () => set((state) => (
    state.queuedPrompt
      ? { isOpen: false }
      : {
          isOpen: false,
          draft: '',
          queuedPrompt: null,
          submissionStatus: 'idle',
          submissionError: null,
        }
  )),
  setDraft: (draft) => set({ draft }),
  startInteraction: (agentOverride, baseline = null) => {
    const state = get();
    const retryPrompt = state.submissionStatus === 'retry_ready'
      ? state.queuedPrompt
      : null;
    if (retryPrompt) {
      const createdSession = state.sessionId === null;
      const sessionId = state.sessionId ?? crypto.randomUUID();
      if (createdSession) writeSessionCoordinate(sessionId);

      set({
        sessionId,
        draft: '',
        queuedPrompt: {
          ...retryPrompt,
          id: crypto.randomUUID(),
          createdSession: retryPrompt.createdSession || createdSession,
        },
        submissionStatus: 'queued',
        submissionError: null,
      });
      return { sessionId, createdSession };
    }

    const text = state.draft.trim();
    if (!text || ['queued', 'submitting', 'reconciliation_failed'].includes(state.submissionStatus)) {
      return null;
    }

    const createdSession = state.sessionId === null;
    const sessionId = state.sessionId ?? crypto.randomUUID();
    const agentDefinitionKey = agentOverride ?? state.selectedAgentDefinitionKey ?? 'operator';
    if (createdSession) writeSessionCoordinate(sessionId);

    set({
      sessionId,
      draft: '',
      queuedPrompt: {
        id: crypto.randomUUID(),
        messageCommandKey: crypto.randomUUID(),
        text,
        agentDefinitionKey,
        createdSession,
        baseline: createdSession ? null : baseline,
        expectedSuccessorAttemptId: null,
      },
      submissionStatus: 'queued',
      submissionError: null,
    });
    return { sessionId, createdSession };
  },
  markPromptSubmitting: ({ sessionId, promptId }) => set((state) => (
    ownsQueuedPrompt(state, sessionId, promptId)
      && ['queued', 'reconciliation_failed'].includes(state.submissionStatus)
      ? { submissionStatus: 'submitting', submissionError: null }
      : {}
  )),
  recordSuccessorAdmission: ({ sessionId, promptId, attemptId }) => set((state) => (
    ownsQueuedPrompt(state, sessionId, promptId)
      && state.queuedPrompt.expectedSuccessorAttemptId === null
      ? {
          queuedPrompt: {
            ...state.queuedPrompt,
            expectedSuccessorAttemptId: attemptId,
          },
        }
      : {}
  )),
  admitQueuedPrompt: ({ sessionId, promptId }) => set((state) => (
    ownsQueuedPrompt(state, sessionId, promptId)
      ? { queuedPrompt: null, submissionStatus: 'idle', submissionError: null }
      : {}
  )),
  restoreUnadmittedPrompt: ({ sessionId, promptId, error }) => {
    const state = get();
    if (!ownsQueuedPrompt(state, sessionId, promptId)) return;
    const clearGeneratedSession = state.queuedPrompt.createdSession;
    if (clearGeneratedSession) writeSessionCoordinate(null);
    set({
      sessionId: clearGeneratedSession ? null : state.sessionId,
      draft: state.queuedPrompt.text,
      submissionStatus: 'retry_ready',
      submissionError: error ?? 'Durable admission was not found. Your prompt is ready to retry.',
    });
  },
  markPromptReconciliationFailed: ({ sessionId, promptId, error }) => set((state) => (
    ownsQueuedPrompt(state, sessionId, promptId)
      ? { submissionStatus: 'reconciliation_failed', submissionError: error }
      : {}
  )),
  clearSession: () => {
    writeSessionCoordinate(null);
    set({
      sessionId: null,
      draft: '',
      queuedPrompt: null,
      submissionStatus: 'idle',
      submissionError: null,
    });
  },
  pinDurableAgent: (agentDefinitionKey) => set({ selectedAgentDefinitionKey: agentDefinitionKey }),
  synchronizeSessionCoordinate: () => {
    const sessionId = readSessionCoordinate();
    const state = get();
    if (sessionId === state.sessionId) return;
    if (state.queuedPrompt) {
      writeSessionCoordinate(state.sessionId);
      return;
    }
    set({
      sessionId,
      queuedPrompt: null,
      submissionStatus: 'idle',
      submissionError: null,
    });
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
  baseline?: InteractionAttemptBaseline | null,
): { sessionId: string; createdSession: boolean } | null {
  return useInteractionSurfaceState.getState().startInteraction(agentDefinitionKey, baseline);
}

export function markInteractionPromptSubmitting(input: { sessionId: string; promptId: string }): void {
  useInteractionSurfaceState.getState().markPromptSubmitting(input);
}

export function recordInteractionSuccessorAdmission(input: {
  sessionId: string;
  promptId: string;
  attemptId: string;
}): void {
  useInteractionSurfaceState.getState().recordSuccessorAdmission(input);
}

export function admitQueuedInteractionPrompt(input: { sessionId: string; promptId: string }): void {
  useInteractionSurfaceState.getState().admitQueuedPrompt(input);
}

export function restoreUnadmittedInteractionPrompt(input: {
  sessionId: string;
  promptId: string;
  error?: string;
}): void {
  useInteractionSurfaceState.getState().restoreUnadmittedPrompt(input);
}

export function markInteractionPromptReconciliationFailed(input: {
  sessionId: string;
  promptId: string;
  error: string;
}): void {
  useInteractionSurfaceState.getState().markPromptReconciliationFailed(input);
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

function ownsQueuedPrompt(
  state: Pick<InteractionSurfaceState, 'sessionId' | 'queuedPrompt'>,
  sessionId: string,
  promptId: string,
): state is InteractionSurfaceState & { queuedPrompt: QueuedInteractionPrompt } {
  return state.sessionId === sessionId && state.queuedPrompt?.id === promptId;
}
