'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Menu, Plus, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAgent } from '@copilotkit/react-core/v2';
import { queryKeys } from '@/lib/query-keys';
import { AgentConversationComposer } from './AgentConversationComposer';
import { AgentConversationMessage } from './AgentConversationMessage';
import { AgentConversationSidebar, agentConversationDestinations } from './AgentConversationSidebar';
import {
  createConversation,
  deleteConversation,
  getConversationHistory,
  interruptConversation,
  listConversations,
  loadConversationReadiness,
  renameConversation,
  sendConversationInput,
  type AgentConversationKey,
  type ConversationMessage,
  type ConversationRuntime,
  type ConversationSummary,
  type GatewayReadiness,
} from './conversation-api';
import { useConversationSurfaceState } from './conversation-surface-state';

type LiveMessage = Pick<ConversationMessage, 'id' | 'role' | 'content'>;
type ToolProjection = { id: string; title: string; detail?: string };

/** Agent-first workspace. Conversation content stays provider-owned, not in Web state. */
export function AgentConversationSurface() {
  const queryClient = useQueryClient();
  const selectedContext = useConversationSurfaceState((state) => state.selectedContext);
  const activeConversationId = useConversationSurfaceState((state) => state.activeConversationId);
  const pendingOpen = useConversationSurfaceState((state) => state.pendingOpen);
  const selectContext = useConversationSurfaceState((state) => state.selectContext);
  const selectConversation = useConversationSurfaceState((state) => state.selectConversation);
  const consumePendingOpen = useConversationSurfaceState((state) => state.consumePendingOpen);
  const [createOpen, setCreateOpen] = useState(false);
  const [initialDraft, setInitialDraft] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const conversationsQuery = useQuery({
    queryKey: queryKeys.conversations.list(),
    queryFn: listConversations,
    staleTime: 15_000,
  });
  const readinessQuery = useQuery({
    queryKey: queryKeys.conversations.readiness(),
    queryFn: loadConversationReadiness,
    staleTime: 30_000,
  });
  const conversations = conversationsQuery.data ?? [];
  const activeConversation = conversations.find((conversation) => conversation.id === activeConversationId) ?? null;

  useEffect(() => {
    if (!pendingOpen) return;
    setInitialDraft(pendingOpen.draft ?? '');
    setCreateOpen(true);
    consumePendingOpen();
  }, [consumePendingOpen, pendingOpen]);

  const create = useMutation({
    mutationFn: (runtime: ConversationRuntime) => createConversation({
      runtime,
      agentKey: selectedContext,
    }),
    onSuccess: (conversation) => {
      queryClient.setQueryData<ConversationSummary[]>(queryKeys.conversations.list(), (current = []) => [
        conversation,
        ...current.filter((item) => item.id !== conversation.id),
      ]);
      selectConversation(conversation);
      setCreateOpen(false);
    },
  });
  const rename = useMutation({
    mutationFn: ({ conversationId, title }: { conversationId: string; title: string }) => renameConversation(conversationId, title),
    onSuccess: (conversation) => {
      queryClient.setQueryData<ConversationSummary[]>(queryKeys.conversations.list(), (current = []) => current.map(
        (item) => item.id === conversation.id ? conversation : item,
      ));
    },
  });
  const remove = useMutation({
    mutationFn: deleteConversation,
    onSuccess: (_, conversationId) => {
      queryClient.setQueryData<ConversationSummary[]>(queryKeys.conversations.list(), (current = []) => current.filter(
        (item) => item.id !== conversationId,
      ));
      if (activeConversationId === conversationId) selectContext(selectedContext);
    },
  });
  const openNewConversation = useCallback(() => {
    setInitialDraft('');
    setCreateOpen(true);
    setDrawerOpen(false);
  }, []);
  const chooseContext = useCallback((context: AgentConversationKey | null) => {
    selectContext(context);
    setDrawerOpen(false);
  }, [selectContext]);
  const chooseConversation = useCallback((conversation: ConversationSummary) => {
    selectConversation(conversation);
    setDrawerOpen(false);
  }, [selectConversation]);
  const sidebar = (
    <AgentConversationSidebar
      conversations={conversations}
      selectedContext={selectedContext}
      activeConversationId={activeConversationId}
      onSelectContext={chooseContext}
      onSelectConversation={chooseConversation}
      onNewConversation={openNewConversation}
      onRename={(conversationId, title) => rename.mutate({ conversationId, title })}
      onDelete={(conversationId) => remove.mutate(conversationId)}
    />
  );
  const contextLabel = labelForContext(selectedContext);

  return (
    <div className="flex h-dvh overflow-hidden bg-background text-foreground">
      <aside className="hidden lg:flex">{sidebar}</aside>
      <Dialog.Root open={drawerOpen} onOpenChange={setDrawerOpen}>
        <Dialog.Trigger asChild>
          <button type="button" aria-label="Open conversations" className="fixed left-3 top-3 z-20 inline-flex min-h-10 min-w-10 items-center justify-center rounded-md border bg-background shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 max-lg:min-h-11 max-lg:min-w-11 lg:hidden">
            <Menu aria-hidden="true" size={20} />
          </button>
        </Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-black/25 motion-reduce:transition-none" />
          <Dialog.Content className="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[calc(100vw-2rem)] outline-none motion-reduce:transition-none">
            <Dialog.Title className="sr-only">Agent conversations</Dialog.Title>
            {sidebar}
            <Dialog.Close asChild>
              <button type="button" aria-label="Close conversations" className="absolute right-2 top-2 inline-flex min-h-10 min-w-10 items-center justify-center rounded-md bg-background/90 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 max-lg:min-h-11 max-lg:min-w-11">
                <X aria-hidden="true" size={18} />
              </button>
            </Dialog.Close>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header className="sticky top-0 z-10 shrink-0 border-b bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:px-6">
          <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-2 pl-11 max-sm:flex-col max-sm:items-stretch lg:pl-0">
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-[20px] font-semibold leading-[26px]">{activeConversation?.title ?? contextLabel}</h1>
              <p className="text-xs text-muted-foreground">{activeConversation ? `${contextLabel} · ${runtimeLabel(activeConversation.runtime)}` : 'Create a conversation to choose a runtime.'}</p>
            </div>
            <button type="button" onClick={openNewConversation} className="inline-flex min-h-10 items-center gap-1 rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 max-lg:min-h-11 max-sm:w-full max-sm:justify-center">
              <Plus aria-hidden="true" size={16} /> New conversation
            </button>
          </div>
        </header>
        {conversationsQuery.isError ? <p role="alert" className="mx-auto w-full max-w-3xl px-4 pt-4 text-sm text-destructive">Conversations could not be loaded.</p> : null}
        {activeConversation ? (
          <ConversationFlow
            key={activeConversation.id}
            conversation={activeConversation}
            readiness={readinessQuery.isError ? null : readinessQuery.data}
            initialDraft={initialDraft}
            onInitialDraftConsumed={() => setInitialDraft('')}
          />
        ) : (
          <EmptyConversationState label={contextLabel} onNewConversation={openNewConversation} />
        )}
      </main>
      <CreateConversationDialog
        open={createOpen}
        contextLabel={contextLabel}
        pending={create.isPending}
        error={create.isError}
        onOpenChange={setCreateOpen}
        onCreate={(runtime) => create.mutate(runtime)}
      />
    </div>
  );
}

function ConversationFlow({
  conversation,
  readiness,
  initialDraft,
  onInitialDraftConsumed,
}: {
  conversation: ConversationSummary;
  readiness: GatewayReadiness[] | null | undefined;
  initialDraft: string;
  onInitialDraftConsumed(): void;
}) {
  const queryClient = useQueryClient();
  const conversationLifetime = useRef<{ conversationId: string } | null>({
    conversationId: conversation.id,
  });
  const { agent, isReady } = useAgent({
    agentId: `kiditem-conversation:${conversation.id}`,
    runtimeAgentId: 'conversation',
    threadId: conversation.id,
  });
  const [activeTurnId, setActiveTurnId] = useState<string | null>(null);
  const [turnEnded, setTurnEnded] = useState<string | null>(null);
  const [liveMessages, setLiveMessages] = useState<LiveMessage[]>([]);
  const [toolProjections, setToolProjections] = useState<ToolProjection[]>([]);
  const terminalHistoryRefresh = useRef<Promise<void> | null>(null);
  const terminalHistoryPending = useRef(false);
  const historyBaseline = useRef<Map<string, number> | null>(null);
  const liveMessagesRef = useRef<LiveMessage[]>([]);
  const setLiveSnapshot = useCallback((messages: LiveMessage[]) => {
    liveMessagesRef.current = messages;
    setLiveMessages(messages);
  }, []);
  const history = useQuery({
    queryKey: queryKeys.conversations.history(conversation.id),
    queryFn: () => getConversationHistory(conversation.id),
    staleTime: 15_000,
  });
  useEffect(() => {
    const lifetime = { conversationId: conversation.id };
    conversationLifetime.current = lifetime;
    return () => {
      if (conversationLifetime.current === lifetime) conversationLifetime.current = null;
    };
  }, [conversation.id]);
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
        await queryClient.invalidateQueries({
          queryKey: queryKeys.conversations.history(conversation.id),
          refetchType: 'none',
        });
        const refreshedHistory = await queryClient.fetchQuery({
          queryKey: queryKeys.conversations.history(conversation.id),
          queryFn: () => getConversationHistory(conversation.id),
          staleTime: 0,
        });
        clearCoveredLiveState(refreshedHistory);
      } catch {
        // Preserve live text and tool status when the provider history refresh fails.
      }
    })();
    terminalHistoryRefresh.current = refresh;
    void refresh.finally(() => {
      if (terminalHistoryRefresh.current === refresh) terminalHistoryRefresh.current = null;
    });
    return refresh;
  }, [clearCoveredLiveState, conversation.id, queryClient]);

  useEffect(() => {
    setLiveSnapshot([]);
    setToolProjections([]);
    setActiveTurnId(null);
    setTurnEnded(null);
    terminalHistoryPending.current = false;
    historyBaseline.current = null;
  }, [conversation.id, setLiveSnapshot]);

  useEffect(() => {
    if (history.data) clearCoveredLiveState(history.data);
  }, [clearCoveredLiveState, history.data]);

  useEffect(() => {
    if (!isReady) return;
    const subscription = agent.subscribe({
      onMessagesChanged: ({ messages }) => setLiveSnapshot(toLiveMessages(messages)),
      onCustomEvent: ({ event }) => {
        const projection = toolProjectionFromEvent(event.name, event.value);
        if (projection) setToolProjections((current) => current.some((item) => item.id === projection.id) ? current : [...current, projection]);
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

  const start = async ({ message, model, reasoningEffort }: { message: string; model: string; reasoningEffort: string }) => {
    if (!isReady) throw new Error('conversation_runtime_not_ready');
    const lifetime = conversationLifetime.current;
    if (!lifetime || lifetime.conversationId !== conversation.id) {
      throw new Error('conversation_no_longer_active');
    }
    const providerHistory = history.data ?? await queryClient.fetchQuery({
      queryKey: queryKeys.conversations.history(conversation.id),
      queryFn: () => getConversationHistory(conversation.id),
      staleTime: 0,
    });
    if (conversationLifetime.current !== lifetime) {
      throw new Error('conversation_no_longer_active');
    }
    if (!providerHistory) throw new Error('conversation_history_unavailable');
    const turnId = newTurnId();
    setTurnEnded(null);
    setActiveTurnId(turnId);
    terminalHistoryPending.current = false;
    historyBaseline.current = messageCoverageCounts(providerHistory);
    agent.addMessage({ id: `user-${turnId}`, role: 'user', content: message });
    try {
      await agent.runAgent({
        runId: turnId,
        forwardedProps: { model, reasoningEffort },
      });
    } catch {
      setTurnEnded('This turn ended. Send a new message when you are ready.');
      terminalHistoryPending.current = true;
      void reconcileTerminalHistory();
      throw new Error('conversation_turn_ended');
    } finally {
      setActiveTurnId(null);
    }
  };
  const input = async (message: string) => {
    if (!activeTurnId) throw new Error('conversation_turn_not_active');
    await sendConversationInput(conversation.id, activeTurnId, message);
  };
  const interrupt = async () => {
    if (!activeTurnId) return;
    await interruptConversation(conversation.id, activeTurnId);
    setActiveTurnId(null);
    setTurnEnded('This turn was interrupted. Send a new message when you are ready.');
    terminalHistoryPending.current = true;
    void reconcileTerminalHistory();
  };
  const historyMessages = history.data ?? [];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <section aria-label="Conversation messages" className="mx-auto w-full max-w-3xl flex-1 space-y-4 overflow-y-auto px-4 py-6 sm:px-6">
        {history.isLoading ? <p role="status" className="text-sm text-muted-foreground">Loading provider history…</p> : null}
        {history.isError ? <p role="alert" className="text-sm text-destructive">Provider history could not be loaded.</p> : null}
        {historyMessages.map((message) => <AgentConversationMessage key={message.id} message={message} />)}
        {liveMessages.map((message) => <AgentConversationMessage key={`live-${message.id}`} message={message} live />)}
        <ToolStatusCards projections={toolProjections} />
        {turnEnded ? <p role="status" aria-live="polite" className="text-sm text-muted-foreground">{turnEnded}</p> : null}
      </section>
      <div className="mx-auto w-full max-w-3xl px-4 sm:px-6">
        <AgentConversationComposer
          label={conversation.title}
          runtime={conversation.runtime}
          readiness={readiness}
          initialDraft={initialDraft}
          activeTurnId={activeTurnId}
          onStart={start}
          onInput={input}
          onInterrupt={interrupt}
        />
      </div>
      {initialDraft ? <DraftConsumption onConsumed={onInitialDraftConsumed} /> : null}
    </div>
  );
}

function DraftConsumption({ onConsumed }: { onConsumed(): void }) {
  useEffect(() => onConsumed(), [onConsumed]);
  return null;
}

function ToolStatusCards({ projections }: { projections: ToolProjection[] }) {
  if (!projections.length) return null;
  return (
    <section aria-label="Live provider tool details" className="space-y-2">
      {projections.map((projection) => (
        <article key={projection.id} className="rounded-lg border bg-card p-3 text-sm">
          <p className="font-medium">{projection.title}</p>
          {projection.detail ? <p className="mt-1 text-muted-foreground">{projection.detail}</p> : null}
        </article>
      ))}
    </section>
  );
}

function EmptyConversationState({ label, onNewConversation }: { label: string; onNewConversation(): void }) {
  return (
    <section className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-4 py-16 sm:px-6">
      <h2 className="text-lg font-semibold">{label} conversations</h2>
      <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">Choose a provider runtime when creating a conversation. Runtime and Agent context stay fixed after creation.</p>
      <button type="button" onClick={onNewConversation} className="mt-5 inline-flex min-h-10 w-fit items-center gap-1 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 max-lg:min-h-11">
        <Plus aria-hidden="true" size={16} /> New conversation
      </button>
    </section>
  );
}

function CreateConversationDialog({
  open,
  contextLabel,
  pending,
  error,
  onOpenChange,
  onCreate,
}: {
  open: boolean;
  contextLabel: string;
  pending: boolean;
  error: boolean;
  onOpenChange(open: boolean): void;
  onCreate(runtime: ConversationRuntime): void;
}) {
  const [runtime, setRuntime] = useState<ConversationRuntime | ''>('');
  useEffect(() => {
    if (open) setRuntime('');
  }, [open]);
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/25" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border bg-background p-5 shadow-lg outline-none">
          <Dialog.Title className="text-base font-semibold">New {contextLabel} conversation</Dialog.Title>
          <Dialog.Description className="mt-1 text-sm text-muted-foreground">Choose the provider runtime for this conversation. It cannot be changed later.</Dialog.Description>
          <label className="mt-4 grid gap-1 text-sm font-medium">
            Runtime
            <select aria-label="Runtime" value={runtime} onChange={(event) => setRuntime(event.target.value as ConversationRuntime | '')} className="min-h-10 rounded-md border bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 max-lg:min-h-11">
              <option value="">Select runtime</option>
              <option value="codex_cli">Codex CLI</option>
              <option value="claude_cli">Claude CLI</option>
            </select>
          </label>
          {!runtime ? <p className="mt-2 text-sm text-muted-foreground">A runtime selection is required.</p> : null}
          {error ? <p role="alert" className="mt-3 text-sm text-destructive">Conversation could not be created.</p> : null}
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <Dialog.Close asChild><button type="button" className="min-h-10 rounded-md border px-3 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 max-lg:min-h-11">Cancel</button></Dialog.Close>
            <button type="button" disabled={!runtime || pending} onClick={() => runtime && onCreate(runtime)} className="min-h-10 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 max-lg:min-h-11">Create conversation</button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function labelForContext(context: AgentConversationKey | null): string {
  return agentConversationDestinations.find((destination) => destination.key === context)?.label ?? 'General';
}

function runtimeLabel(runtime: ConversationRuntime): string {
  return runtime === 'codex_cli' ? 'Codex CLI' : 'Claude CLI';
}

function newTurnId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `turn-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function toLiveMessages(messages: readonly unknown[]): LiveMessage[] {
  return messages.flatMap((message, index) => {
    const record = asRecord(message);
    if (!record) return [];
    const role = record.role;
    if (role !== 'user' && role !== 'assistant' && role !== 'tool') return [];
    const content = textContent(record.content);
    if (!content) return [];
    const id = typeof record.id === 'string' ? record.id : `live-${index}`;
    return [{ id, role, content }];
  });
}

function toolProjectionFromEvent(name: string, value: unknown): ToolProjection | null {
  const payload = asRecord(value);
  if (name === 'kiditem.provider_tool_status' && payload && typeof payload.name === 'string' && typeof payload.status === 'string') {
    return { id: `tool-${payload.name}-${payload.status}`, title: payload.name, detail: `${payload.status}${typeof payload.detail === 'string' ? ` · ${payload.detail}` : ''}` };
  }
  return null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : null;
}

function textContent(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (!Array.isArray(value)) return null;
  const text = value.flatMap((part) => {
    const record = asRecord(part);
    return record && record.type === 'text' && typeof record.text === 'string' ? [record.text] : [];
  }).join('');
  return text || null;
}

/** One terminal refresh may lag provider flush; clear only a covered live snapshot. */
function historyCoversLiveMessages(
  history: readonly ConversationMessage[],
  liveMessages: readonly LiveMessage[],
  baseline: ReadonlyMap<string, number>,
): boolean {
  const available = messageCoverageCounts(history);
  const required = messageCoverageCounts(liveMessages);
  for (const [key, count] of required) {
    if ((available.get(key) ?? 0) < (baseline.get(key) ?? 0) + count) return false;
  }
  return true;
}

/** Baseline counts prevent an older identical message from covering a new turn. */
function messageCoverageCounts(
  messages: readonly Pick<ConversationMessage, 'role' | 'content'>[],
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const message of messages) {
    const key = messageCoverageKey(message);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

function messageCoverageKey(message: Pick<ConversationMessage, 'role' | 'content'>): string {
  return `${message.role}\u0000${message.content}`;
}
