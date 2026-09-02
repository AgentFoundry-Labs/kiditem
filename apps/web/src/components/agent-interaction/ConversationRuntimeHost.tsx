'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAgent, useCapabilities, useCopilotKit } from '@copilotkit/react-core/v2';
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
import { createSecureRandomUuid } from '@/lib/secure-random-uuid';
import {
  ConversationFirstSendCoordinator,
  type PromotedConversationFirstSend,
} from './conversation-first-send.coordinator';
import { ConversationSettingsDialog } from './ConversationSettingsDialog';
import { capabilityApprovalInvocationIdFromAgUiEvent } from './capability-approval-event';
import { conversationTitleFromMessage } from './conversation-title';
import { selectTurnPreference, type TurnPreferenceSelection } from './conversation-preference-selection';
import {
  createConversation,
  deleteConversation,
  gatewayReadinessFromCapabilities,
  getConversationPreferences,
  listConversations,
  renameConversation,
  setConversationPreference,
  type ConversationPreferences,
  type ConversationRuntime,
  type ConversationSummary,
  type GatewayReadiness,
  type SetConversationPreferenceCommand,
} from './conversation-api';
import { useConversationSurfaceState, type NewConversationDraft } from './conversation-surface-state';

export type LiveMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
};

type TurnInput = { message: string; model: string; reasoningEffort: string };
type DraftPatch = Partial<Omit<NewConversationDraft, 'draftId'>>;

const TURN_FAILURE_NOTICE = '응답을 완료하지 못했습니다. 다시 시도해 주세요.';
const TURN_CONNECTION_NOTICE = '대화 연결이 끊어졌습니다. 다시 시도해 주세요.';
const HISTORY_CONNECTION_NOTICE = '대화 기록을 불러오지 못했습니다. 다시 시도해 주세요.';

export interface ConversationRuntimeContextValue {
  conversations: ConversationSummary[]; conversationsLoading: boolean; conversationsError: boolean;
  readiness: GatewayReadiness[] | null | undefined;
  preferences: ConversationPreferences | null | undefined; preferencesLoading: boolean; preferencesError: boolean;
  activeConversation: ConversationSummary | null; draft: NewConversationDraft | null;
  conversationId: string | null; runtime: ConversationRuntime | null; isDraft: boolean;
  identity: ConversationIdentity;
  approvalInvocationIds: readonly string[];
  turnPreference: TurnPreferenceSelection;
  messages: LiveMessage[];
  isRunning: boolean; turnEnded: string | null;
  start(input: TurnInput): Promise<void>;
  interrupt(): Promise<void>;
  refreshConversations(): Promise<void>;
  updateDraft(patch: DraftPatch): void;
  setPreference(input: SetConversationPreferenceCommand): Promise<ConversationPreferences>;
  renameConversation(conversationId: string, title: string): Promise<ConversationSummary>;
  deleteConversation(conversationId: string): Promise<void>;
}

type RuntimeBinding = { kind: 'existing'; conversation: ConversationSummary } | { kind: 'draft'; draft: NewConversationDraft };
type RuntimeHandle = { conversationId: string; handoff(input: PromotedConversationFirstSend): Promise<void> };
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
  const closeSettings = useConversationSurfaceState((state) => state.closeSettings);
  const conversationsQuery = useQuery({
    queryKey: queryKeys.conversations.list(identity),
    queryFn: listConversations,
    staleTime: 15_000,
  });
  const refreshConversations = useCallback(async () => {
    await queryClient.refetchQueries({
      queryKey: queryKeys.conversations.list(identity),
      type: 'active',
    });
  }, [identity, queryClient]);
  const conversations = conversationsQuery.data ?? [];
  const activeConversation = activeConversationId
    ? conversations.find((conversation) => conversation.id === activeConversationId) ?? null
    : null;
  const activeDraft = activeConversationId === null ? pendingDraft : null;
  const binding: RuntimeBinding | null = activeConversation
    ? { kind: 'existing', conversation: activeConversation }
    : activeDraft
      ? { kind: 'draft', draft: activeDraft }
      : null;
  const selectedRuntime = binding?.kind === 'existing'
    ? binding.conversation.runtime
    : binding?.draft.provider ?? null;
  const capabilities = useCapabilities('conversation');
  const readiness = gatewayReadinessFromCapabilities(capabilities);
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
  const draftIsCurrent = (draftId: string, conversationId?: string) => {
    if (!identityIsActive()) return false;
    const state = useConversationSurfaceState.getState();
    return state.pendingDraft?.draftId === draftId
      && state.activeConversationId === (conversationId ?? null);
  };
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
      promoteDraft: (draftId, summary) => {
        if (!identityIsActive()) return;
        useConversationSurfaceState.getState().promoteDraft(draftId, summary);
      },
      isCurrent: draftIsCurrent,
      handoff: async (input) => {
        if (!identityIsActive()) {
          throw new Error('conversation_identity_no_longer_active');
        }
        // Let the external-store selection commit before a fast first run can
        // finish against the draft presentation binding.
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
        if (!draftIsCurrent(input.draftId, input.conversationId)) {
          throw new Error('conversation_runtime_binding_unavailable');
        }
        const runtimeHandle = latestHostRef.current.runtimeHandleRef.current;
        if (!runtimeHandle || runtimeHandle.conversationId !== input.conversationId) {
          throw new Error('conversation_runtime_binding_unavailable');
        }
        return runtimeHandle.handoff(input);
      },
    });
    coordinatorLifetimeRef.current = identityLifetime;
  }
  const previousDraftIdRef = useRef<string | null>(pendingDraft?.draftId ?? null);
  useEffect(() => {
    const currentDraftId = pendingDraft?.draftId ?? null;
    const previousDraftId = previousDraftIdRef.current;
    if (previousDraftId && previousDraftId !== currentDraftId) {
      coordinatorRef.current?.dispose(previousDraftId);
    }
    previousDraftIdRef.current = currentDraftId;
  }, [pendingDraft?.draftId]);
  const [settingsRun, setSettingsRun] = useState<{ conversationId: string | null; isRunning: boolean }>({
    conversationId: null,
    isRunning: false,
  });
  const reportSettingsRun = useCallback((conversationId: string, isRunning: boolean) => {
    setSettingsRun((current) => (
      current.conversationId === conversationId && current.isRunning === isRunning
        ? current
        : { conversationId, isRunning }
    ));
  }, []);
  const settingsIsRunning = settingsRun.conversationId === activeConversation?.id && settingsRun.isRunning;

  const inactiveValue = inactiveRuntimeValue({
    identity,
    conversations,
    conversationsLoading: conversationsQuery.isLoading,
    conversationsError: conversationsQuery.isError,
    readiness,
    preferences,
    preferencesLoading: preferencesQuery.isLoading,
    preferencesError: preferencesQuery.isError,
    turnPreference,
    refreshConversations,
    updateDraft,
    setPreference: setPreferenceMutation.mutateAsync,
    renameConversation: (conversationId, title) => renameConversationMutation.mutateAsync({ conversationId, title }),
    deleteConversation: deleteConversationMutation.mutateAsync,
  });
  return (
    <>
      {binding ? (
        <ActiveConversationRuntime
          key={JSON.stringify([identity.userId, identity.organizationId, conversationIdForBinding(binding)])}
          identity={identity}
          binding={binding}
          retainedDraft={pendingDraft}
          conversations={conversations}
          conversationsLoading={conversationsQuery.isLoading}
          conversationsError={conversationsQuery.isError}
          readiness={readiness}
          preferences={preferences}
          preferencesLoading={preferencesQuery.isLoading}
          preferencesError={preferencesQuery.isError}
          turnPreference={turnPreference}
          refreshConversations={refreshConversations}
          coordinator={coordinatorRef.current!}
          runtimeHandleRef={runtimeHandleRef}
          updateDraft={updateDraft}
          setPreference={setPreferenceMutation.mutateAsync}
          renameConversation={(conversationId, title) => renameConversationMutation.mutateAsync({ conversationId, title })}
          deleteConversation={deleteConversationMutation.mutateAsync}
          onRunningChange={reportSettingsRun}
        >
          {children}
        </ActiveConversationRuntime>
      ) : (
        <ConversationRuntimeContext.Provider value={inactiveValue}>
          {children}
        </ConversationRuntimeContext.Provider>
      )}
      <ConversationSettingsMount
        open={settingsOpen}
        onClose={closeSettings}
        conversations={conversations}
        activeConversationId={activeConversation?.id ?? null}
        isRunning={settingsIsRunning}
        preferences={preferences}
        preferencesLoading={preferencesQuery.isLoading}
        preferencesError={preferencesQuery.isError}
        readiness={readiness}
        onSavePreference={setPreferenceMutation.mutateAsync}
        onRenameConversation={(conversationId, title) => renameConversationMutation.mutateAsync({ conversationId, title })}
        onDeleteConversation={deleteConversationMutation.mutateAsync}
      />
    </>
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
  refreshConversations,
  coordinator,
  runtimeHandleRef,
  updateDraft,
  setPreference,
  renameConversation,
  deleteConversation,
  onRunningChange,
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
  refreshConversations(): Promise<void>;
  coordinator: ConversationFirstSendCoordinator;
  runtimeHandleRef: MutableRefObject<RuntimeHandle | null>;
  updateDraft(patch: Partial<Omit<NewConversationDraft, 'draftId'>>): void;
  setPreference(input: SetConversationPreferenceCommand): Promise<ConversationPreferences>;
  renameConversation(conversationId: string, title: string): Promise<ConversationSummary>;
  deleteConversation(conversationId: string): Promise<void>;
  onRunningChange(conversationId: string, isRunning: boolean): void;
  children: ReactNode;
}) {
  const queryClient = useQueryClient();
  const conversationId = conversationIdForBinding(binding);
  const activeConversation = binding.kind === 'existing' ? binding.conversation : null;
  const draft = binding.kind === 'draft' ? binding.draft : retainedDraft;
  const runtime = activeConversation?.runtime ?? draft?.provider ?? null;
  const { copilotkit } = useCopilotKit();
  const { agent, isReady } = useAgent({
    agentId: `kiditem-conversation:${conversationId}`,
    runtimeAgentId: 'conversation',
    threadId: conversationId,
  });
  const [presentationRevision, setPresentationRevision] = useState(0);
  const [turnEnded, setTurnEnded] = useState<string | null>(null);
  const [approvalInvocationIds, setApprovalInvocationIds] = useState<readonly string[]>([]);
  const connectionRef = useRef<{ agent: typeof agent; promise: Promise<void> } | null>(null);
  const refreshPresentation = useCallback(() => {
    setPresentationRevision((current) => current + 1);
  }, []);
  const receiveCapabilityApproval = useCallback((event: unknown) => {
    const invocationId = capabilityApprovalInvocationIdFromAgUiEvent(event);
    if (!invocationId) return;
    setApprovalInvocationIds((current) => (
      current.includes(invocationId) ? current : [...current, invocationId]
    ));
  }, []);
  const messages = useMemo(
    () => toPresentationMessages(agent.messages),
    [agent, presentationRevision],
  );
  const isRunning = agent.isRunning;
  useEffect(() => {
    onRunningChange(conversationId, isRunning);
    return () => onRunningChange(conversationId, false);
  }, [conversationId, isRunning, onRunningChange]);
  const refreshSummaries = useCallback(() => {
    void queryClient.invalidateQueries({
      queryKey: queryKeys.conversations.list(identity),
      refetchType: 'active',
    });
  }, [identity, queryClient]);
  const ensureConnected = useCallback((): Promise<void> => {
    if (!isReady) return Promise.reject(new Error('conversation_runtime_not_ready'));
    if (connectionRef.current?.agent === agent) return connectionRef.current.promise;
    const connection: { agent: typeof agent; promise: Promise<void> } = {
      agent,
      promise: Promise.resolve(),
    };
    connection.promise = Promise.resolve(copilotkit.connectAgent({ agent }))
      .then(() => undefined)
      .catch((error: unknown) => {
        if (connectionRef.current === connection) connectionRef.current = null;
        throw error;
      });
    connectionRef.current = connection;
    return connection.promise;
  }, [agent, copilotkit, isReady]);

  useEffect(() => {
    setTurnEnded(null);
    setApprovalInvocationIds([]);
    refreshPresentation();
  }, [conversationId, refreshPresentation]);
  useEffect(() => {
    if (!isReady) return;
    const subscription = agent.subscribe({
      onMessagesChanged: refreshPresentation,
      onRunInitialized: () => {
        setTurnEnded(null);
        refreshPresentation();
      },
      onRunFinalized: () => {
        setTurnEnded(null);
        refreshPresentation();
        refreshSummaries();
      },
      onRunFailed: () => {
        setTurnEnded(TURN_FAILURE_NOTICE);
        refreshPresentation();
        refreshSummaries();
      },
      onRunErrorEvent: () => {
        setTurnEnded(TURN_CONNECTION_NOTICE);
        refreshPresentation();
      },
      onCustomEvent: ({ event }) => {
        receiveCapabilityApproval(event);
      },
    });
    return subscription.unsubscribe;
  }, [agent, isReady, receiveCapabilityApproval, refreshPresentation, refreshSummaries]);
  useEffect(() => {
    if (binding.kind !== 'existing' || !isReady) return;
    void ensureConnected().catch(() => {
      setTurnEnded(HISTORY_CONNECTION_NOTICE);
    });
  }, [binding.kind, ensureConnected, isReady]);

  const issueRun = useCallback(async (input: TurnInput) => {
    if (!input.model.trim()) throw new Error('conversation_model_required');
    if (!input.reasoningEffort.trim()) throw new Error('conversation_reasoning_effort_required');
    if (!isReady) throw new Error('conversation_runtime_not_ready');
    if (agent.isRunning) throw new Error('conversation_turn_active');
    const turnId = newTurnId();
    setTurnEnded(null);
    agent.addMessage({ id: `user-${turnId}`, role: 'user', content: input.message });
    try {
      await copilotkit.runAgent({
        agent,
        runId: turnId,
        forwardedProps: { model: input.model, reasoningEffort: input.reasoningEffort },
      });
      refreshPresentation();
    } catch {
      setTurnEnded(TURN_FAILURE_NOTICE);
      refreshPresentation();
      throw new Error('conversation_turn_ended');
    }
  }, [agent, copilotkit, isReady, refreshPresentation]);
  const startExisting = useCallback(async (input: TurnInput) => {
    if (binding.kind !== 'existing') throw new Error('conversation_draft_not_promoted');
    await ensureConnected();
    await issueRun(input);
  }, [binding.kind, ensureConnected, issueRun]);
  const handoffFirstSend = useCallback(async (input: PromotedConversationFirstSend) => {
    if (input.conversationId !== conversationId) {
      throw new Error('conversation_runtime_binding_unavailable');
    }
    await ensureConnected();
    await issueRun({
      message: input.message,
      model: input.model,
      reasoningEffort: input.reasoningEffort,
    });
  }, [conversationId, ensureConnected, issueRun]);
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
      if (retainedDraft) {
        useConversationSurfaceState.getState().completePromotedDraft(retainedDraft.draftId);
      }
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
      draftId: binding.draft.draftId,
      runtime: binding.draft.provider,
      agentKey: binding.draft.agentKey,
      title,
      message: input.message,
      model: input.model,
      reasoningEffort: input.reasoningEffort,
    });
    useConversationSurfaceState.getState().completePromotedDraft(binding.draft.draftId);
  }, [binding, coordinator, isReady, retainedDraft, startExisting, updateDraft]);
  const interrupt = useCallback(async () => {
    if (!agent.isRunning) return;
    copilotkit.stopAgent({ agent });
    refreshPresentation();
  }, [agent, copilotkit, refreshPresentation]);

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
    identity,
    approvalInvocationIds,
    turnPreference,
    messages,
    isRunning,
    turnEnded,
    start,
    interrupt,
    refreshConversations,
    updateDraft,
    setPreference,
    renameConversation,
    deleteConversation,
  };
  return (
    <ConversationRuntimeContext.Provider value={value}>
      {children}
    </ConversationRuntimeContext.Provider>
  );
}

export function useConversationRuntime(): ConversationRuntimeContextValue {
  const value = useContext(ConversationRuntimeContext);
  if (!value) throw new Error('conversation_runtime_host_required');
  return value;
}

function ConversationSettingsMount({
  open,
  onClose,
  conversations,
  activeConversationId,
  isRunning,
  preferences,
  preferencesLoading,
  preferencesError,
  readiness,
  onSavePreference,
  onRenameConversation,
  onDeleteConversation,
}: {
  open: boolean;
  onClose(): void;
  conversations: ConversationSummary[];
  activeConversationId: string | null;
  isRunning: boolean;
  preferences: ConversationPreferences | null | undefined;
  preferencesLoading: boolean;
  preferencesError: boolean;
  readiness: GatewayReadiness[] | null | undefined;
  onSavePreference(input: SetConversationPreferenceCommand): Promise<ConversationPreferences>;
  onRenameConversation(conversationId: string, title: string): Promise<ConversationSummary>;
  onDeleteConversation(conversationId: string): Promise<void>;
}) {
  return (
    <ConversationSettingsDialog
      open={open}
      onClose={onClose}
      conversations={conversations}
      activeConversationId={activeConversationId}
      isRunning={isRunning}
      preferences={preferences}
      preferencesLoading={preferencesLoading}
      preferencesError={preferencesError}
      readiness={readiness}
      onSavePreference={onSavePreference}
      onRenameConversation={onRenameConversation}
      onDeleteConversation={onDeleteConversation}
    />
  );
}

function inactiveRuntimeValue({
  identity,
  conversations,
  conversationsLoading,
  conversationsError,
  readiness,
  preferences,
  preferencesLoading,
  preferencesError,
  turnPreference,
  refreshConversations,
  updateDraft,
  setPreference,
  renameConversation,
  deleteConversation,
}: Pick<ConversationRuntimeContextValue,
  | 'identity'
  | 'conversations'
  | 'conversationsLoading'
  | 'conversationsError'
  | 'readiness'
  | 'preferences'
  | 'preferencesLoading'
  | 'preferencesError'
  | 'turnPreference'
  | 'refreshConversations'
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
    identity,
    approvalInvocationIds: [],
    turnPreference,
    messages: [],
    isRunning: false,
    turnEnded: null,
    start: noActiveConversation,
    interrupt: noActiveConversation,
    refreshConversations,
    updateDraft,
    setPreference,
    renameConversation,
    deleteConversation,
  };
}

function conversationIdForBinding(binding: RuntimeBinding): string {
  return binding.kind === 'existing' ? binding.conversation.id : `draft:${binding.draft.draftId}`;
}

function newTurnId(): string {
  try {
    return createSecureRandomUuid();
  } catch {
    throw new Error('conversation_turn_id_unavailable');
  }
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

function isConversationRole(value: unknown): value is LiveMessage['role'] {
  return value === 'user' || value === 'assistant';
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
