'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAgent } from '@copilotkit/react-core/v2';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
} from 'react';
import { conversationIdentityKey, queryKeys, type ConversationIdentity } from '@/lib/query-keys';
import { ConversationFirstSendCoordinator, type ConversationFirstSend } from './conversation-first-send.coordinator';
import { ConversationSettingsDialog } from './ConversationSettingsDialog';
import { conversationTitleFromMessage } from './conversation-title';
import { selectTurnPreference, type TurnPreferenceSelection } from './conversation-preference-selection';
import {
  createConversation,
  deleteConversation,
  getConversationPreferences,
  listConversations,
  loadConversationReadiness,
  renameConversation,
  setConversationPreference,
  type ConversationMessage,
  type ConversationPreferences,
  type ConversationRuntime,
  type ConversationSummary,
  type GatewayReadiness,
  type SetConversationPreferenceCommand,
} from './conversation-api';
import { useConversationSurfaceState, type NewConversationDraft } from './conversation-surface-state';

export type LiveMessage = Pick<ConversationMessage, 'id' | 'role' | 'content'>;
export type ToolProjection = { id: string; title: string; detail?: string };

type TurnInput = { message: string; model: string; reasoningEffort: string };
type DraftPatch = Partial<Omit<NewConversationDraft, 'conversationId'>>;

export interface ConversationRuntimeContextValue {
  conversations: ConversationSummary[]; conversationsLoading: boolean; conversationsError: boolean;
  readiness: GatewayReadiness[] | null | undefined;
  preferences: ConversationPreferences | null | undefined; preferencesLoading: boolean; preferencesError: boolean;
  activeConversation: ConversationSummary | null; draft: NewConversationDraft | null;
  conversationId: string | null; runtime: ConversationRuntime | null; isDraft: boolean;
  turnPreference: TurnPreferenceSelection;
  messages: LiveMessage[]; toolProjections: ToolProjection[];
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
export function ConversationRuntimeHost({
  children,
  identity: requestedIdentity,
}: {
  children: ReactNode;
  identity: ConversationIdentity;
}) {
  const queryClient = useQueryClient();
  const requestedIdentityKey = conversationIdentityKey(requestedIdentity);
  const identityLifetimeRef = useRef({
    identity: requestedIdentity,
    key: requestedIdentityKey,
    active: true,
  });
  if (identityLifetimeRef.current.key !== requestedIdentityKey) {
    identityLifetimeRef.current.active = false;
    identityLifetimeRef.current = {
      identity: requestedIdentity,
      key: requestedIdentityKey,
      active: true,
    };
  }
  const identityLifetime = identityLifetimeRef.current;
  const identity = identityLifetime.identity;
  const identityIsActive = () => (
    identityLifetimeRef.current === identityLifetime && identityLifetime.active
  );
  useEffect(() => {
    if (identityLifetimeRef.current === identityLifetime) identityLifetime.active = true;
    return () => {
      identityLifetime.active = false;
      const queryKey = queryKeys.conversations.all(identityLifetime.identity);
      void queryClient.cancelQueries({ queryKey });
      queryClient.removeQueries({ queryKey });
    };
  }, [identityLifetime, queryClient]);

  const activeConversationId = useConversationSurfaceState((state) => state.activeConversationId);
  const pendingDraft = useConversationSurfaceState((state) => state.pendingDraft);
  const updateDraft = useConversationSurfaceState((state) => state.updateDraft);
  const settingsOpen = useConversationSurfaceState((state) => state.settingsOpen);
  const conversationsQuery = useQuery({
    queryKey: queryKeys.conversations.list(identity),
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
    queryKey: queryKeys.conversations.readiness(identity),
    queryFn: loadConversationReadiness,
    staleTime: 30_000,
    enabled: selectedRuntime !== null || settingsOpen,
  });
  const readiness = readinessQuery.isError ? null : readinessQuery.data;
  const preferencesQuery = useQuery({
    queryKey: queryKeys.conversations.preferences(identity),
    queryFn: getConversationPreferences,
    staleTime: 30_000,
    enabled: selectedRuntime !== null || settingsOpen,
  });
  const preferences = preferencesQuery.isError || preferencesQuery.isFetching
    ? null
    : preferencesQuery.data;
  const setPreferenceMutation = useMutation({
    mutationFn: setConversationPreference,
    onSuccess: (nextPreferences) => {
      if (!identityIsActive()) return;
      queryClient.setQueryData(queryKeys.conversations.preferences(identity), nextPreferences);
    },
  });
  const renameConversationMutation = useMutation({
    mutationFn: ({ conversationId, title }: { conversationId: string; title: string }) => renameConversation(conversationId, title),
    onSuccess: (renamed) => {
      if (!identityIsActive()) return;
      queryClient.setQueryData<ConversationSummary[]>(queryKeys.conversations.list(identity), (current = []) => current.map(
        (conversation) => conversation.id === renamed.id ? renamed : conversation,
      ));
    },
  });
  const deleteConversationMutation = useMutation({
    mutationFn: deleteConversation,
    onSuccess: (_, conversationId) => {
      if (!identityIsActive()) return;
      let deleted: ConversationSummary | undefined;
      queryClient.setQueryData<ConversationSummary[]>(queryKeys.conversations.list(identity), (current = []) => {
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
    preferences,
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
  const coordinatorLifetimeRef = useRef<typeof identityLifetime | null>(null);
  if (coordinatorLifetimeRef.current !== identityLifetime) {
    coordinatorRef.current = new ConversationFirstSendCoordinator({
      createConversation,
      cacheSummary: (summary) => {
        if (!identityIsActive()) return;
        latestHostRef.current.queryClient.setQueryData<ConversationSummary[]>(
          queryKeys.conversations.list(identity),
          (current = []) => [summary, ...current.filter((item) => item.id !== summary.id)],
        );
      },
      selectConversation: (summary) => {
        if (!identityIsActive()) return;
        useConversationSurfaceState.getState().selectConversation(summary);
      },
      isCurrent: (conversationId) => {
        if (!identityIsActive()) return false;
        const state = useConversationSurfaceState.getState();
        return state.activeConversationId === conversationId
          && state.pendingDraft?.conversationId === conversationId;
      },
      handoff: (input) => {
        if (!identityIsActive()) {
          return Promise.reject(new Error('conversation_identity_no_longer_active'));
        }
        const runtimeHandle = latestHostRef.current.runtimeHandleRef.current;
        if (!runtimeHandle || runtimeHandle.conversationId !== input.conversationId) {
          return Promise.reject(new Error('conversation_runtime_binding_unavailable'));
        }
        return runtimeHandle.handoff(input);
      },
    });
    coordinatorLifetimeRef.current = identityLifetime;
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
    preferences,
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
      key={JSON.stringify([identity.userId, identity.organizationId, conversationIdForBinding(binding)])}
      identity={identity}
      binding={binding}
      retainedDraft={activeDraft}
      conversations={conversations}
      conversationsLoading={conversationsQuery.isLoading}
      conversationsError={conversationsQuery.isError}
      readiness={readiness}
      preferences={preferences}
      preferencesLoading={preferencesQuery.isLoading}
      preferencesError={preferencesQuery.isError}
      turnPreference={turnPreference}
      retryReadiness={() => { void readinessQuery.refetch(); }}
      coordinator={coordinatorRef.current!}
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
  identity,
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
  identity: ConversationIdentity;
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
  runtimeHandleRef: MutableRefObject<RuntimeHandle | null>;
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
  const [presentationRevision, setPresentationRevision] = useState(0);
  const [toolProjections, setToolProjections] = useState<ToolProjection[]>([]);
  const [turnEnded, setTurnEnded] = useState<string | null>(null);
  const refreshPresentation = useCallback(() => {
    setPresentationRevision((current) => current + 1);
  }, []);
  const messages = useMemo(
    () => toPresentationMessages(agent.messages),
    [agent, presentationRevision],
  );
  const activeTurnId = agent.isRunning ? conversationId : null;
  const refreshSummaries = useCallback(() => {
    void queryClient.invalidateQueries({
      queryKey: queryKeys.conversations.list(identity),
      refetchType: 'active',
    });
  }, [identity, queryClient]);

  useEffect(() => {
    setToolProjections([]);
    setTurnEnded(null);
    refreshPresentation();
  }, [conversationId, refreshPresentation]);
  useEffect(() => {
    if (!isReady) return;
    const subscription = agent.subscribe({
      onMessagesChanged: refreshPresentation,
      onCustomEvent: ({ event }) => {
        const projection = toolProjectionFromEvent(event.name, event.value);
        if (!projection) return;
        setToolProjections((current) => current.some((item) => item.id === projection.id)
          ? current
          : [...current, projection]);
      },
      onRunInitialized: () => {
        setTurnEnded(null);
        refreshPresentation();
      },
      onRunFinalized: () => {
        refreshPresentation();
        refreshSummaries();
      },
      onRunFailed: () => {
        setTurnEnded('This turn ended. Send a new message when you are ready.');
        refreshPresentation();
        refreshSummaries();
      },
      onRunErrorEvent: () => {
        setTurnEnded('This turn ended. Send a new message when you are ready.');
        refreshPresentation();
      },
    });
    return subscription.unsubscribe;
  }, [agent, isReady, refreshPresentation, refreshSummaries]);

  const issueRun = useCallback(async (input: TurnInput) => {
    if (!input.model.trim()) throw new Error('conversation_model_required');
    if (!input.reasoningEffort.trim()) throw new Error('conversation_reasoning_effort_required');
    if (!isReady) throw new Error('conversation_runtime_not_ready');
    if (agent.isRunning) throw new Error('conversation_turn_active');
    const turnId = newTurnId();
    setTurnEnded(null);
    agent.addMessage({ id: `user-${turnId}`, role: 'user', content: input.message });
    try {
      await agent.runAgent({
        runId: turnId,
        forwardedProps: { model: input.model, reasoningEffort: input.reasoningEffort },
      });
      refreshPresentation();
    } catch {
      setTurnEnded('This turn ended. Send a new message when you are ready.');
      refreshPresentation();
      throw new Error('conversation_turn_ended');
    }
  }, [agent, isReady, refreshPresentation]);
  const startExisting = useCallback(async (input: TurnInput) => {
    if (binding.kind !== 'existing') throw new Error('conversation_draft_not_promoted');
    await issueRun(input);
  }, [binding.kind, issueRun]);
  const handoffFirstSend = useCallback(async (input: ConversationFirstSend) => {
    if (input.conversationId !== conversationId) {
      throw new Error('conversation_runtime_binding_unavailable');
    }
    await issueRun({
      message: input.message,
      model: input.model,
      reasoningEffort: input.reasoningEffort,
    });
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

  const start = useCallback(async (input: TurnInput) => {
    if (binding.kind === 'existing') {
      await startExisting(input);
      useConversationSurfaceState.getState().completePromotedDraft(conversationId);
      return;
    }
    if (!binding.draft.provider) throw new Error('conversation_runtime_required');
    const title = conversationTitleFromMessage(input.message);
    updateDraft({
      provider: binding.draft.provider,
      model: input.model,
      reasoningEffort: input.reasoningEffort,
      message: input.message,
    });
    if (!isReady) throw new Error('conversation_runtime_not_ready');
    await coordinator.send({
      conversationId,
      runtime: binding.draft.provider,
      agentKey: binding.draft.agentKey,
      title,
      message: input.message,
      model: input.model,
      reasoningEffort: input.reasoningEffort,
    });
    useConversationSurfaceState.getState().completePromotedDraft(conversationId);
  }, [binding, conversationId, coordinator, isReady, startExisting, updateDraft]);
  const sendInput = useCallback(async (_message: string) => {
    throw new Error('conversation_turn_not_active');
  }, []);
  const interrupt = useCallback(async () => {
    if (!agent.isRunning) return;
    agent.abortRun();
    refreshPresentation();
  }, [agent, refreshPresentation]);

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
    messages,
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
    messages: [],
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

function toPresentationMessages(messages: readonly unknown[]): LiveMessage[] {
  return messages.flatMap((message, index) => {
    const record = asRecord(message);
    if (!record || !isConversationRole(record.role)) return [];
    const content = textContent(record.content);
    if (!content) return [];
    return [{
      id: typeof record.id === 'string' ? record.id : `copilotkit-${index}`,
      role: record.role,
      content,
    }];
  });
}

function toolProjectionFromEvent(name: string, value: unknown): ToolProjection | null {
  const payload = asRecord(value);
  if (name !== 'kiditem.provider_tool_status' || !payload
    || typeof payload.name !== 'string' || typeof payload.status !== 'string') return null;
  return {
    id: `tool-${payload.name}-${payload.status}`,
    title: payload.name,
    detail: `${payload.status}${typeof payload.detail === 'string' ? ` · ${payload.detail}` : ''}`,
  };
}

function isConversationRole(value: unknown): value is LiveMessage['role'] {
  return value === 'user' || value === 'assistant' || value === 'tool' || value === 'status';
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : null;
}

function textContent(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (!Array.isArray(value)) return null;
  const text = value.flatMap((part) => {
    const record = asRecord(part);
    return record?.type === 'text' && typeof record.text === 'string' ? [record.text] : [];
  }).join('');
  return text || null;
}
