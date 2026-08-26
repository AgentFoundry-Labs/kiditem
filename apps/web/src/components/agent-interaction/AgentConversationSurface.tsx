'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Menu, Plus, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { queryKeys } from '@/lib/query-keys';
import { ConversationFlow } from './ConversationFlow';
import { useConversationRuntime } from './ConversationRuntimeHost';
import { AgentConversationSidebar, agentConversationDestinations } from './AgentConversationSidebar';
import {
  deleteConversation,
  renameConversation,
  type AgentConversationKey,
  type ConversationRuntime,
  type ConversationSummary,
} from './conversation-api';
import { useConversationSurfaceState } from './conversation-surface-state';
import { useNewConversationDraft } from './useNewConversationDraft';

/** Agent-first workspace layout. Runtime lifetime lives above this presentation. */
export function AgentConversationSurface() {
  return <AgentConversationSurfaceLayout />;
}

function AgentConversationSurfaceLayout() {
  const queryClient = useQueryClient();
  const selectedContext = useConversationSurfaceState((state) => state.selectedContext);
  const activeConversationId = useConversationSurfaceState((state) => state.activeConversationId);
  const selectContext = useConversationSurfaceState((state) => state.selectContext);
  const selectConversation = useConversationSurfaceState((state) => state.selectConversation);
  const { openConversation, updateDraft, discardDraft } = useNewConversationDraft();
  const runtime = useConversationRuntime();
  const [createOpen, setCreateOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const autoOpenedDraftRef = useRef<string | null>(null);
  const conversations = runtime.conversations;
  const activeConversation = runtime.activeConversation;
  const activeDraft = runtime.isDraft ? runtime.draft : null;
  const contextLabel = labelForContext(selectedContext);

  useEffect(() => {
    if (!activeDraft || activeDraft.provider || autoOpenedDraftRef.current === activeDraft.conversationId) return;
    autoOpenedDraftRef.current = activeDraft.conversationId;
    setCreateOpen(true);
  }, [activeDraft]);

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
    const draft = openConversation({ fixedAgentKey: selectedContext });
    autoOpenedDraftRef.current = draft.conversationId;
    setCreateOpen(true);
    setDrawerOpen(false);
  }, [openConversation, selectedContext]);
  const chooseContext = useCallback((context: AgentConversationKey | null) => {
    selectContext(context);
    setDrawerOpen(false);
  }, [selectContext]);
  const chooseConversation = useCallback((conversation: ConversationSummary) => {
    selectConversation(conversation);
    setDrawerOpen(false);
  }, [selectConversation]);
  const chooseRuntime = useCallback((provider: ConversationRuntime) => {
    updateDraft({ provider });
    setCreateOpen(false);
  }, [updateDraft]);
  const cancelCreate = useCallback(() => {
    setCreateOpen(false);
    discardDraft();
  }, [discardDraft]);
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
  const headerTitle = activeConversation?.title
    ?? (activeDraft?.message.trim() || contextLabel);

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
              <h1 className="truncate text-[20px] font-semibold leading-[26px]">{headerTitle}</h1>
              <p className="text-xs text-muted-foreground">
                {activeConversation
                  ? `${contextLabel} · ${runtimeLabel(activeConversation.runtime)}`
                  : activeDraft?.provider
                    ? `${contextLabel} · ${runtimeLabel(activeDraft.provider)}`
                    : 'Choose a runtime before sending the first message.'}
              </p>
            </div>
            <button type="button" onClick={openNewConversation} className="inline-flex min-h-10 items-center gap-1 rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 max-lg:min-h-11 max-sm:w-full max-sm:justify-center">
              <Plus aria-hidden="true" size={16} /> New conversation
            </button>
          </div>
        </header>
        {runtime.conversationsError ? <p role="alert" className="mx-auto w-full max-w-3xl px-4 pt-4 text-sm text-destructive">Conversations could not be loaded.</p> : null}
        {activeConversation || activeDraft ? (
          <ConversationFlow key={runtime.conversationId ?? 'conversation'} />
        ) : (
          <EmptyConversationState label={contextLabel} onNewConversation={openNewConversation} />
        )}
      </main>
      <CreateConversationDialog
        open={createOpen}
        contextLabel={contextLabel}
        onOpenChange={setCreateOpen}
        onCancel={cancelCreate}
        onCreate={chooseRuntime}
      />
    </div>
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
  onOpenChange,
  onCancel,
  onCreate,
}: {
  open: boolean;
  contextLabel: string;
  onOpenChange(open: boolean): void;
  onCancel(): void;
  onCreate(runtime: ConversationRuntime): void;
}) {
  const [runtime, setRuntime] = useState<ConversationRuntime | ''>('');
  useEffect(() => {
    if (open) setRuntime('');
  }, [open]);
  return (
    <Dialog.Root open={open} onOpenChange={(next) => {
      onOpenChange(next);
      if (!next) onCancel();
    }}>
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
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <Dialog.Close asChild><button type="button" className="min-h-10 rounded-md border px-3 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 max-lg:min-h-11">Cancel</button></Dialog.Close>
            <button type="button" disabled={!runtime} onClick={() => runtime && onCreate(runtime)} className="min-h-10 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 max-lg:min-h-11">Create conversation</button>
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
