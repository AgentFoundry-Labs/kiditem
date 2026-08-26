'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAgent } from '@copilotkit/react-core/v2';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { queryKeys } from '@/lib/query-keys';
import { ConversationFirstSendCoordinator, type ConversationFirstSend } from './conversation-first-send.coordinator';
import { ConversationSettingsDialog } from './ConversationSettingsDialog';
import { conversationTitleFromMessage } from './conversation-title';
import { selectTurnPreference, type TurnPreferenceSelection } from './conversation-preference-selection';
import { createConversation, deleteConversation, getConversationHistory, getConversationPreferences, interruptConversation, listConversations, loadConversationReadiness, renameConversation, sendConversationInput, setConversationPreference, type ConversationMessage, type ConversationPreferences, type ConversationRuntime, type ConversationSummary, type GatewayReadiness, type SetConversationPreferenceCommand } from './conversation-api';
import { historyCoversLiveMessages, messageCoverageCounts, toLiveMessages, toolProjectionFromEvent, type LiveMessage, type ToolProjection } from './conversation-runtime-reconciliation';
import { useConversationSurfaceState, type NewConversationDraft } from './conversation-surface-state';

export type { LiveMessage, ToolProjection } from './conversation-runtime-reconciliation';

type TurnInput = { message: string; model: string; reasoningEffort: string };
type DraftPatch = Partial<Omit<NewConversationDraft, 'conversationId'>>;

export interface ConversationRuntimeContextValue {
  conversations: ConversationSummary[]; conversationsLoading: boolean; conversationsError: boolean;
  readiness: GatewayReadiness[] | null | undefined;
  preferences: ConversationPreferences | null | undefined; preferencesLoading: boolean; preferencesError: boolean;
  activeConversation: ConversationSummary | null; draft: NewConversationDraft | null;
  conversationId: string | null; runtime: ConversationRuntime | null; isDraft: boolean;
  turnPreference: TurnPreferenceSelection;
  historyMessages: ConversationMessage[]; historyLoading: boolean; historyError: boolean;
  liveMessages: LiveMessage[]; toolProjections: ToolProjection[];
  activeTurnId: string | null; turnEnded: string | null;
  start(input: TurnInput): Promise<void>;
  sendInput(message: string): Promise<void>;
  interrupt(): Promise<void>;
  retryReadiness(): void;
  updateDraft(patch: DraftPatch): void;
  setPreference(input: SetConversationPreferenceCommand): Promise<ConversationPreferences>;
  renameConversation(conversationId: string, title: string): Promise<ConversationSummary>;
  deleteConversation(conversationId: string): Promise<void>;
}

type RuntimeBinding = { kind: 'existing'; conversation: ConversationSummary } | { kind: 'draft'; draft: NewConversationDraft };
type RuntimeHandle = { conversationId: string; handoff(input: ConversationFirstSend): Promise<void> };
const ConversationRuntimeContext = createContext<ConversationRuntimeContextValue | null>(null);

/**
 * Route-stable owner for a single selected conversation binding. Presentations
 * can mount and unmount beneath it without recreating CopilotKit state.
 */
export function ConversationRuntimeHost({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const activeConversationId = useConversationSurfaceState((state) => state.activeConversationId);
  const pendingDraft = useConversationSurfaceState((state) => state.pendingDraft);
  const updateDraft = useConversationSurfaceState((state) => state.updateDraft);
  const settingsOpen = useConversationSurfaceState((state) => state.settingsOpen);
  const conversationsQuery = useQuery({
    queryKey: queryKeys.conversations.list(),
    queryFn: listConversations,
    staleTime: 15_000,
  });
  const conversations = conversationsQuery.data ?? [];
  const activeConversation = activeConversationId
    ? conversations.find((conversation) => conversation.id === activeConversationId) ?? null
    : null;
  const activeDraft = pendingDraft?.conversationId === activeConversationId
    ? pendingDraft
    : null;
  const binding: RuntimeBinding | null = activeConversation
    ? { kind: 'existing', conversation: activeConversation }
    : activeDraft
      ? { kind: 'draft', draft: activeDraft }
      : null;
  const selectedRuntime = binding?.kind === 'existing'
    ? binding.conversation.runtime
    : binding?.draft.provider ?? null;
  const readinessQuery = useQuery({
    queryKey: queryKeys.conversations.readiness(),
    queryFn: loadConversationReadiness,
    staleTime: 30_000,
    enabled: selectedRuntime !== null || settingsOpen,
  });
  const readiness = readinessQuery.isError ? null : readinessQuery.data;
  const preferencesQuery = useQuery({
    queryKey: queryKeys.conversations.preferences(),
    queryFn: getConversationPreferences,
    staleTime: 30_000,
    enabled: selectedRuntime !== null || settingsOpen,
  });
  const setPreferenceMutation = useMutation({
    mutationFn: setConversationPreference,
    onSuccess: (preferences) => {
      queryClient.setQueryData(queryKeys.conversations.preferences(), preferences);
    },
  });
  const renameConversationMutation = useMutation({
    mutationFn: ({ conversationId, title }: { conversationId: string; title: string }) => renameConversation(conversationId, title),
    onSuccess: (renamed) => {
      queryClient.setQueryData<ConversationSummary[]>(queryKeys.conversations.list(), (current = []) => current.map(
        (conversation) => conversation.id === renamed.id ? renamed : conversation,
      ));
    },
  });
  const deleteConversationMutation = useMutation({
    mutationFn: deleteConversation,
    onSuccess: (_, conversationId) => {
      let deleted: ConversationSummary | undefined;
      queryClient.setQueryData<ConversationSummary[]>(queryKeys.conversations.list(), (current = []) => {
        deleted = current.find((conversation) => conversation.id === conversationId);
        return current.filter((conversation) => conversation.id !== conversationId);
      });
      if (useConversationSurfaceState.getState().activeConversationId === conversationId) {
        useConversationSurfaceState.getState().selectContext(deleted?.agentKey ?? null);
      }
    },
  });
  const turnPreference = selectTurnPreference({
    conversation: activeConversation,
    draftContext: activeDraft?.agentKey ?? null,
    runtime: selectedRuntime,
    preferences: preferencesQuery.data,
    readiness,
  });
  useEffect(() => {
    if (!activeDraft || !selectedRuntime || activeDraft.model !== null || activeDraft.reasoningEffort !== null) return;
    if (!turnPreference.model || !turnPreference.reasoningEffort) return;
    updateDraft({ model: turnPreference.model, reasoningEffort: turnPreference.reasoningEffort });
  }, [activeDraft, selectedRuntime, turnPreference.model, turnPreference.reasoningEffort, updateDraft]);
  const runtimeHandleRef = useRef<RuntimeHandle | null>(null);
  const latestHostRef = useRef({ queryClient, runtimeHandleRef });
  latestHostRef.current = { queryClient, runtimeHandleRef };
  const coordinatorRef = useRef<ConversationFirstSendCoordinator | null>(null);
  if (!coordinatorRef.current) {
    coordinatorRef.current = new ConversationFirstSendCoordinator({
      createConversation,
      cacheSummary: (summary) => {
        latestHostRef.current.queryClient.setQueryData<ConversationSummary[]>(
          queryKeys.conversations.list(),
          (current = []) => [summary, ...current.filter((item) => item.id !== summary.id)],
        );
      },
      selectConversation: (summary) => {
        useConversationSurfaceState.getState().selectConversation(summary);
      },
      isCurrent: (conversationId) => {
        const state = useConversationSurfaceState.getState();
        return state.activeConversationId === conversationId
          && state.pendingDraft?.conversationId === conversationId;
      },
      handoff: (input) => {
        const runtimeHandle = latestHostRef.current.runtimeHandleRef.current;
        if (!runtimeHandle || runtimeHandle.conversationId !== input.conversationId) {
          return Promise.reject(new Error('conversation_runtime_binding_unavailable'));
        }
        return runtimeHandle.handoff(input);
      },
    });
  }
  const previousDraftIdRef = useRef<string | null>(pendingDraft?.conversationId ?? null);
  useEffect(() => {
    const currentDraftId = pendingDraft?.conversationId ?? null;
    const previousDraftId = previousDraftIdRef.current;
    if (previousDraftId && previousDraftId !== currentDraftId) {
      coordinatorRef.current?.dispose(previousDraftId);
    }
    previousDraftIdRef.current = currentDraftId;
  }, [pendingDraft?.conversationId]);
  const inactiveValue = inactiveRuntimeValue({
    conversations,
    conversationsLoading: conversationsQuery.isLoading,
    conversationsError: conversationsQuery.isError,
    readiness,
    preferences: preferencesQuery.data,
    preferencesLoading: preferencesQuery.isLoading,
    preferencesError: preferencesQuery.isError,
    turnPreference,
    retryReadiness: () => { void readinessQuery.refetch(); },
    updateDraft,
    setPreference: setPreferenceMutation.mutateAsync,
    renameConversation: (conversationId, title) => renameConversationMutation.mutateAsync({ conversationId, title }),
    deleteConversation: deleteConversationMutation.mutateAsync,
  });
  if (!binding) {
    return (
      <ConversationRuntimeContext.Provider value={inactiveValue}>
        {children}
        <ConversationSettingsMount />
      </ConversationRuntimeContext.Provider>
    );
  }

  return (
    <ActiveConversationRuntime
      key={conversationIdForBinding(binding)}
      binding={binding}
      retainedDraft={activeDraft}
      conversations={conversations}
      conversationsLoading={conversationsQuery.isLoading}
      conversationsError={conversationsQuery.isError}
      readiness={readiness}
      preferences={preferencesQuery.data}
      preferencesLoading={preferencesQuery.isLoading}
      preferencesError={preferencesQuery.isError}
      turnPreference={turnPreference}
      retryReadiness={() => { void readinessQuery.refetch(); }}
      coordinator={coordinatorRef.current}
      runtimeHandleRef={runtimeHandleRef}
      updateDraft={updateDraft}
      setPreference={setPreferenceMutation.mutateAsync}
      renameConversation={(conversationId, title) => renameConversationMutation.mutateAsync({ conversationId, title })}
      deleteConversation={deleteConversationMutation.mutateAsync}
    >
      {children}
    </ActiveConversationRuntime>
  );
}

function ActiveConversationRuntime({
  binding,
  retainedDraft,
  conversations,
  conversationsLoading,
  conversationsError,
  readiness,
  preferences,
  preferencesLoading,
  preferencesError,
  turnPreference,
  retryReadiness,
  coordinator,
  runtimeHandleRef,
  updateDraft,
  setPreference,
  renameConversation,
  deleteConversation,
  children,
}: {
  binding: RuntimeBinding;
  retainedDraft: NewConversationDraft | null;
  conversations: ConversationSummary[];
  conversationsLoading: boolean;
  conversationsError: boolean;
  readiness: GatewayReadiness[] | null | undefined;
  preferences: ConversationPreferences | null | undefined;
  preferencesLoading: boolean;
  preferencesError: boolean;
  turnPreference: TurnPreferenceSelection;
  retryReadiness(): void;
  coordinator: ConversationFirstSendCoordinator;
  runtimeHandleRef: React.MutableRefObject<RuntimeHandle | null>;
  updateDraft(patch: Partial<Omit<NewConversationDraft, 'conversationId'>>): void;
  setPreference(input: SetConversationPreferenceCommand): Promise<ConversationPreferences>;
  renameConversation(conversationId: string, title: string): Promise<ConversationSummary>;
  deleteConversation(conversationId: string): Promise<void>;
  children: ReactNode;
}) {
  const queryClient = useQueryClient();
  const conversationId = conversationIdForBinding(binding);
  const activeConversation = binding.kind === 'existing' ? binding.conversation : null;
  const draft = binding.kind === 'draft' ? binding.draft : retainedDraft;
  const runtime = activeConversation?.runtime ?? draft?.provider ?? null;
  const { agent, isReady } = useAgent({
    agentId: `kiditem-conversation:${conversationId}`,
    runtimeAgentId: 'conversation',
    threadId: conversationId,
  });
  const [activeTurnId, setActiveTurnId] = useState<string | null>(null);
  const [turnEnded, setTurnEnded] = useState<string | null>(null);
  const [liveMessages, setLiveMessages] = useState<LiveMessage[]>([]);
  const [toolProjections, setToolProjections] = useState<ToolProjection[]>([]);
  const conversationLifetime = useRef<{ conversationId: string } | null>({ conversationId });
  const terminalHistoryRefresh = useRef<Promise<void> | null>(null);
  const terminalHistoryPending = useRef(false);
  const historyBaseline = useRef<Map<string, number> | null>(null);
  const liveMessagesRef = useRef<LiveMessage[]>([]);
  const history = useQuery({
    queryKey: queryKeys.conversations.history(conversationId),
    queryFn: () => getConversationHistory(conversationId),
    staleTime: 15_000,
    enabled: binding.kind === 'existing',
  });
  const setLiveSnapshot = useCallback((messages: LiveMessage[]) => {
    liveMessagesRef.current = messages;
    setLiveMessages(messages);
  }, []);
  const clearCoveredLiveState = useCallback((providerHistory: readonly ConversationMessage[]) => {
    const baseline = historyBaseline.current;
    if (!terminalHistoryPending.current || !baseline) return false;
    if (!historyCoversLiveMessages(providerHistory, liveMessagesRef.current, baseline)) return false;
    agent.setMessages([]);
    setLiveSnapshot([]);
    setToolProjections([]);
    terminalHistoryPending.current = false;
    historyBaseline.current = messageCoverageCounts(providerHistory);
    return true;
  }, [agent, setLiveSnapshot]);
  const reconcileTerminalHistory = useCallback(() => {
    if (terminalHistoryRefresh.current) return terminalHistoryRefresh.current;
    const refresh = (async () => {
      try {
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: queryKeys.conversations.history(conversationId),
            refetchType: 'none',
          }),
          queryClient.invalidateQueries({
            queryKey: queryKeys.conversations.list(),
            refetchType: 'none',
          }),
        ]);
        const [refreshedHistory] = await Promise.all([
          queryClient.fetchQuery({
            queryKey: queryKeys.conversations.history(conversationId),
            queryFn: () => getConversationHistory(conversationId),
            staleTime: 0,
          }),
          queryClient.fetchQuery({
            queryKey: queryKeys.conversations.list(),
            queryFn: listConversations,
            staleTime: 0,
          }),
        ]);
        clearCoveredLiveState(refreshedHistory);
      } catch {
        // Keep live provider state until durable history really covers it.
      }
    })();
    terminalHistoryRefresh.current = refresh;
    void refresh.finally(() => {
      if (terminalHistoryRefresh.current === refresh) terminalHistoryRefresh.current = null;
    });
    return refresh;
  }, [clearCoveredLiveState, conversationId, queryClient]);

  useEffect(() => {
    const lifetime = { conversationId };
    conversationLifetime.current = lifetime;
    return () => {
      if (conversationLifetime.current === lifetime) conversationLifetime.current = null;
    };
  }, [conversationId]);
  useEffect(() => {
    setLiveSnapshot([]);
    setToolProjections([]);
    setActiveTurnId(null);
    setTurnEnded(null);
    terminalHistoryPending.current = false;
    historyBaseline.current = null;
  }, [conversationId, setLiveSnapshot]);
  useEffect(() => {
    if (history.data) clearCoveredLiveState(history.data);
  }, [clearCoveredLiveState, history.data]);
  useEffect(() => {
    if (!isReady) return;
    const subscription = agent.subscribe({
      onMessagesChanged: ({ messages }) => setLiveSnapshot(toLiveMessages(messages)),
      onCustomEvent: ({ event }) => {
        const projection = toolProjectionFromEvent(event.name, event.value);
        if (projection) {
          setToolProjections((current) => current.some((item) => item.id === projection.id)
            ? current
            : [...current, projection]);
        }
      },
      onRunErrorEvent: () => {
        setActiveTurnId(null);
        setTurnEnded('This turn ended. Send a new message when you are ready.');
        terminalHistoryPending.current = true;
        void reconcileTerminalHistory();
      },
      onRunFinalized: () => {
        setActiveTurnId(null);
        terminalHistoryPending.current = true;
        void reconcileTerminalHistory();
      },
    });
    return subscription.unsubscribe;
  }, [agent, isReady, reconcileTerminalHistory, setLiveSnapshot]);

  const issueRun = useCallback(async (
    input: { message: string; model: string; reasoningEffort: string },
    baseline: Map<string, number>,
  ) => {
    if (!input.model.trim()) throw new Error('conversation_model_required');
    if (!input.reasoningEffort.trim()) throw new Error('conversation_reasoning_effort_required');
    if (!isReady) throw new Error('conversation_runtime_not_ready');
    const lifetime = conversationLifetime.current;
    if (!lifetime || lifetime.conversationId !== conversationId) {
      throw new Error('conversation_no_longer_active');
    }
    const turnId = newTurnId();
    setTurnEnded(null);
    setActiveTurnId(turnId);
    terminalHistoryPending.current = false;
    historyBaseline.current = baseline;
    agent.addMessage({ id: `user-${turnId}`, role: 'user', content: input.message });
    try {
      await agent.runAgent({
        runId: turnId,
        forwardedProps: { model: input.model, reasoningEffort: input.reasoningEffort },
      });
    } catch {
      setTurnEnded('This turn ended. Send a new message when you are ready.');
      terminalHistoryPending.current = true;
      void reconcileTerminalHistory();
      throw new Error('conversation_turn_ended');
    } finally {
      setActiveTurnId((current) => current === turnId ? null : current);
    }
  }, [agent, conversationId, isReady, reconcileTerminalHistory]);

  const startExisting = useCallback(async (input: {
    message: string;
    model: string;
    reasoningEffort: string;
  }) => {
    if (binding.kind !== 'existing') throw new Error('conversation_draft_not_promoted');
    const lifetime = conversationLifetime.current;
    if (!lifetime || lifetime.conversationId !== conversationId) {
      throw new Error('conversation_no_longer_active');
    }
    const providerHistory = history.data ?? await queryClient.fetchQuery({
      queryKey: queryKeys.conversations.history(conversationId),
      queryFn: () => getConversationHistory(conversationId),
      staleTime: 0,
    });
    if (conversationLifetime.current !== lifetime) {
      throw new Error('conversation_no_longer_active');
    }
    if (!providerHistory) throw new Error('conversation_history_unavailable');
    return issueRun(input, messageCoverageCounts(providerHistory));
  }, [binding.kind, conversationId, history.data, issueRun, queryClient]);

  const handoffFirstSend = useCallback(async (input: ConversationFirstSend) => {
    if (input.conversationId !== conversationId) {
      throw new Error('conversation_runtime_binding_unavailable');
    }
    return issueRun({
      message: input.message,
      model: input.model,
      reasoningEffort: input.reasoningEffort,
    }, new Map());
  }, [conversationId, issueRun]);
  const handoffRef = useRef(handoffFirstSend);
  handoffRef.current = handoffFirstSend;
  useEffect(() => {
    const handle: RuntimeHandle = {
      conversationId,
      handoff: (input) => handoffRef.current(input),
    };
    runtimeHandleRef.current = handle;
    return () => {
      if (runtimeHandleRef.current === handle) runtimeHandleRef.current = null;
    };
  }, [conversationId, runtimeHandleRef]);

  const start = useCallback(async (input: {
    message: string;
    model: string;
    reasoningEffort: string;
  }) => {
    if (binding.kind === 'existing') return startExisting(input);
    if (!binding.draft.provider) throw new Error('conversation_runtime_required');
    const title = conversationTitleFromMessage(input.message);
    updateDraft({
      provider: binding.draft.provider,
      model: input.model,
      reasoningEffort: input.reasoningEffort,
      message: input.message,
    });
    await coordinator.send({
      conversationId,
      runtime: binding.draft.provider,
      agentKey: binding.draft.agentKey,
      title,
      message: input.message,
      model: input.model,
      reasoningEffort: input.reasoningEffort,
    });
    const state = useConversationSurfaceState.getState();
    if (state.pendingDraft?.conversationId === conversationId) state.discardDraft();
  }, [binding, conversationId, coordinator, startExisting, updateDraft]);
  const sendInput = useCallback(async (message: string) => {
    if (!activeTurnId) throw new Error('conversation_turn_not_active');
    await sendConversationInput(conversationId, activeTurnId, message);
  }, [activeTurnId, conversationId]);
  const interrupt = useCallback(async () => {
    if (!activeTurnId) return;
    await interruptConversation(conversationId, activeTurnId);
    setActiveTurnId(null);
    setTurnEnded('This turn was interrupted. Send a new message when you are ready.');
    terminalHistoryPending.current = true;
    void reconcileTerminalHistory();
  }, [activeTurnId, conversationId, reconcileTerminalHistory]);

  const value: ConversationRuntimeContextValue = {
    conversations,
    conversationsLoading,
    conversationsError,
    readiness,
    preferences,
    preferencesLoading,
    preferencesError,
    activeConversation,
    draft,
    conversationId,
    runtime,
    isDraft: binding.kind === 'draft',
    turnPreference,
    historyMessages: history.data ?? [],
    historyLoading: history.isLoading,
    historyError: history.isError,
    liveMessages,
    toolProjections,
    activeTurnId,
    turnEnded,
    start,
    sendInput,
    interrupt,
    retryReadiness,
    updateDraft,
    setPreference,
    renameConversation,
    deleteConversation,
  };
  return (
    <ConversationRuntimeContext.Provider value={value}>
      {children}
      <ConversationSettingsMount />
    </ConversationRuntimeContext.Provider>
  );
}

export function useConversationRuntime(): ConversationRuntimeContextValue {
  const value = useContext(ConversationRuntimeContext);
  if (!value) throw new Error('conversation_runtime_host_required');
  return value;
}

function ConversationSettingsMount() {
  const runtime = useConversationRuntime();
  const open = useConversationSurfaceState((state) => state.settingsOpen);
  const closeSettings = useConversationSurfaceState((state) => state.closeSettings);
  return (
    <ConversationSettingsDialog
      open={open}
      onClose={closeSettings}
      conversations={runtime.conversations}
      activeConversationId={runtime.activeConversation?.id ?? null}
      activeTurnId={runtime.activeTurnId}
      preferences={runtime.preferences}
      preferencesLoading={runtime.preferencesLoading}
      preferencesError={runtime.preferencesError}
      readiness={runtime.readiness}
      onSavePreference={runtime.setPreference}
      onRenameConversation={runtime.renameConversation}
      onDeleteConversation={runtime.deleteConversation}
    />
  );
}

function inactiveRuntimeValue({
  conversations,
  conversationsLoading,
  conversationsError,
  readiness,
  preferences,
  preferencesLoading,
  preferencesError,
  turnPreference,
  retryReadiness,
  updateDraft,
  setPreference,
  renameConversation,
  deleteConversation,
}: Pick<ConversationRuntimeContextValue,
  | 'conversations'
  | 'conversationsLoading'
  | 'conversationsError'
  | 'readiness'
  | 'preferences'
  | 'preferencesLoading'
  | 'preferencesError'
  | 'turnPreference'
  | 'retryReadiness'
  | 'updateDraft'
  | 'setPreference'
  | 'renameConversation'
  | 'deleteConversation'>): ConversationRuntimeContextValue {
  const noActiveConversation = async () => {
    throw new Error('conversation_not_selected');
  };
  return {
    conversations,
    conversationsLoading,
    conversationsError,
    readiness,
    preferences,
    preferencesLoading,
    preferencesError,
    activeConversation: null,
    draft: null,
    conversationId: null,
    runtime: null,
    isDraft: false,
    turnPreference,
    historyMessages: [],
    historyLoading: false,
    historyError: false,
    liveMessages: [],
    toolProjections: [],
    activeTurnId: null,
    turnEnded: null,
    start: noActiveConversation,
    sendInput: noActiveConversation,
    interrupt: noActiveConversation,
    retryReadiness,
    updateDraft,
    setPreference,
    renameConversation,
    deleteConversation,
  };
}
function conversationIdForBinding(binding: RuntimeBinding): string {
  return binding.kind === 'existing' ? binding.conversation.id : binding.draft.conversationId;
}
function newTurnId(): string {
  const randomUUID = globalThis.crypto?.randomUUID;
  if (typeof randomUUID !== 'function') throw new Error('conversation_turn_id_unavailable');
  const turnId = randomUUID.call(globalThis.crypto);
  if (!turnId) throw new Error('conversation_turn_id_unavailable');
  return turnId;
}
