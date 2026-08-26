'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { Menu, X } from 'lucide-react';
import { useCallback, useState } from 'react';
import { ConversationFlow } from './ConversationFlow';
import { ConversationFolderTree } from './ConversationFolderTree';
import { ConversationHeader } from './ConversationHeader';
import { useConversationRuntime } from './ConversationRuntimeHost';
import { conversationContextFor } from './conversation-context.catalog';
import type { AgentConversationKey, ConversationSummary } from './conversation-api';
import { useConversationSurfaceState } from './conversation-surface-state';
import { useNewConversationDraft } from './useNewConversationDraft';

/** Full-height Agent OS history presentation over the route-stable runtime. */
export function AgentConversationSurface() {
  return <AgentConversationSurfaceLayout />;
}

function AgentConversationSurfaceLayout() {
  const runtime = useConversationRuntime();
  const selectedContext = useConversationSurfaceState((state) => state.selectedContext);
  const activeConversationId = useConversationSurfaceState((state) => state.activeConversationId);
  const selectContext = useConversationSurfaceState((state) => state.selectContext);
  const selectConversation = useConversationSurfaceState((state) => state.selectConversation);
  const openSettings = useConversationSurfaceState((state) => state.openSettings);
  const { openConversation } = useNewConversationDraft();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const context = conversationContextFor(
    runtime.activeConversation?.agentKey ?? runtime.draft?.agentKey ?? selectedContext,
  );

  const closeDrawer = useCallback(() => setDrawerOpen(false), []);
  const openDrawer = useCallback(() => setDrawerOpen(true), []);

  const openDraft = useCallback((agentKey: AgentConversationKey | null) => {
    openConversation({ fixedAgentKey: agentKey });
    closeDrawer();
  }, [closeDrawer, openConversation]);
  const chooseContext = useCallback((agentKey: AgentConversationKey | null) => {
    selectContext(agentKey);
    closeDrawer();
  }, [closeDrawer, selectContext]);
  const chooseConversation = useCallback((conversation: ConversationSummary) => {
    selectConversation(conversation);
    closeDrawer();
  }, [closeDrawer, selectConversation]);
  const renderTree = () => (
    <ConversationFolderTree
      conversations={runtime.conversations}
      selectedContext={selectedContext}
      activeConversationId={activeConversationId}
      onSelectContext={chooseContext}
      onSelectConversation={chooseConversation}
      onNewConversation={openDraft}
      onOpenSettings={openSettings}
      activeTurnId={runtime.activeTurnId}
      onRenameConversation={runtime.renameConversation}
      onDeleteConversation={runtime.deleteConversation}
    />
  );

  return (
    <Dialog.Root open={drawerOpen} onOpenChange={setDrawerOpen}>
      <div className="flex h-dvh overflow-hidden bg-background text-foreground">
        <main className="order-2 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <ConversationHeader
            contextLabel={context.label}
            title={runtime.activeConversation?.title ?? null}
            onOpenFolders={openDrawer}
            folderControl={(
              <Dialog.Trigger asChild>
                <button
                  type="button"
                  aria-label="대화 목록 열기"
                  className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-md border hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 max-lg:min-h-11 max-lg:min-w-11 lg:hidden"
                >
                  <Menu aria-hidden="true" size={20} />
                </button>
              </Dialog.Trigger>
            )}
          />
          {runtime.conversationsError ? <p role="alert" className="mx-auto w-full max-w-3xl px-4 pt-4 text-sm text-destructive">대화 목록을 불러올 수 없습니다.</p> : null}
          {runtime.conversationId ? <ConversationFlow /> : <EmptyConversationState contextLabel={context.label} onNewConversation={() => openDraft(selectedContext)} />}
        </main>

        <aside className="order-1 hidden min-h-0 lg:flex">
          {renderTree()}
        </aside>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-black/25" />
          <Dialog.Content aria-label="대화 목록" aria-describedby={undefined} className="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[calc(100vw-2rem)] outline-none">
            <Dialog.Title className="sr-only">대화 목록</Dialog.Title>
            {renderTree()}
            <Dialog.Close asChild>
              <button type="button" aria-label="대화 목록 닫기" className="absolute right-2 top-2 inline-flex min-h-10 min-w-10 items-center justify-center rounded-md bg-background/90 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 max-lg:min-h-11 max-lg:min-w-11">
                <X aria-hidden="true" size={18} />
              </button>
            </Dialog.Close>
          </Dialog.Content>
        </Dialog.Portal>
      </div>
    </Dialog.Root>
  );
}

function EmptyConversationState({
  contextLabel,
  onNewConversation,
}: {
  contextLabel: string;
  onNewConversation(): void;
}) {
  return (
    <section className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-4 py-16 sm:px-6">
      <h2 className="text-lg font-semibold">{contextLabel}</h2>
      <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">새 대화를 시작하면 선택한 대화 엔진과 모델을 고를 수 있습니다.</p>
      <button type="button" onClick={onNewConversation} className="mt-5 inline-flex min-h-10 w-fit items-center gap-1 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 max-lg:min-h-11">
        새 AI 대화 시작
      </button>
    </section>
  );
}
