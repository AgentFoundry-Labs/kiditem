'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { Menu, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { CollapsibleSidebarShell } from '@/components/layout/CollapsibleSidebarShell';
import { SidebarBrandLink } from '@/components/layout/SidebarBrandLink';
import { useStore } from '@/store/useStore';
import { CapabilityInvocationCard } from './CapabilityInvocationCard';
import { dedupeCapabilityApprovalInvocationIds } from './capability-approval-event';
import { ConversationFlow } from './ConversationFlow';
import { ConversationEmptyState } from './ConversationEmptyState';
import { ConversationFolderTree } from './ConversationFolderTree';
import { ConversationHeader } from './ConversationHeader';
import { useConversationRuntime } from './ConversationRuntimeHost';
import { conversationContextFor } from './conversation-context.catalog';
import type { AgentConversationKey, ConversationSummary } from './conversation-api';
import { useConversationSurfaceState } from './conversation-surface-state';
import { useNewConversationDraft } from './useNewConversationDraft';

/** Full-height Agent OS history presentation over the route-stable runtime. */
export function AgentConversationSurface({
  fallbackApprovalInvocationId,
}: {
  fallbackApprovalInvocationId?: string | null;
}) {
  return <AgentConversationSurfaceLayout fallbackApprovalInvocationId={fallbackApprovalInvocationId} />;
}

function AgentConversationSurfaceLayout({
  fallbackApprovalInvocationId,
}: {
  fallbackApprovalInvocationId?: string | null;
}) {
  const runtime = useConversationRuntime();
  const sidebarOpen = useStore((state) => state.sidebarOpen);
  const toggleSidebar = useStore((state) => state.toggleSidebar);
  const selectedContext = useConversationSurfaceState((state) => state.selectedContext);
  const activeConversationId = useConversationSurfaceState((state) => state.activeConversationId);
  const pendingDraft = useConversationSurfaceState((state) => state.pendingDraft);
  const selectConversation = useConversationSurfaceState((state) => state.selectConversation);
  const ensureDraft = useConversationSurfaceState((state) => state.ensureDraft);
  const openSettings = useConversationSurfaceState((state) => state.openSettings);
  const { openConversation } = useNewConversationDraft();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const context = conversationContextFor(
    runtime.activeConversation?.agentKey ?? runtime.draft?.agentKey ?? selectedContext,
  );
  const approvalInvocationIds = dedupeCapabilityApprovalInvocationIds(
    runtime.approvalInvocationIds,
    fallbackApprovalInvocationId,
  );
  const approvalContent = approvalInvocationIds.length > 0
    ? approvalInvocationIds.map((invocationId) => (
      <CapabilityInvocationCard key={invocationId} invocationId={invocationId} identity={runtime.identity} />
    ))
    : undefined;

  useEffect(() => {
    if (activeConversationId !== null || pendingDraft) return;
    ensureDraft({ fixedAgentKey: selectedContext });
  }, [activeConversationId, ensureDraft, pendingDraft, selectedContext]);
  useEffect(() => {
    if (!runtime.conversationsError) return;
    void runtime.refreshConversations();
  }, [runtime.conversationsError, runtime.refreshConversations]);

  const closeDrawer = useCallback(() => setDrawerOpen(false), []);
  const openDrawer = useCallback(() => setDrawerOpen(true), []);

  const openDraft = useCallback((agentKey: AgentConversationKey | null, message?: string) => {
    openConversation({ fixedAgentKey: agentKey, draft: message });
    closeDrawer();
  }, [closeDrawer, openConversation]);
  const chooseConversation = useCallback((conversation: ConversationSummary) => {
    selectConversation(conversation);
    closeDrawer();
  }, [closeDrawer, selectConversation]);
  const renderTree = (collapsed = false) => (
    <ConversationFolderTree
      conversations={runtime.conversations}
      selectedContext={selectedContext}
      activeConversationId={activeConversationId}
      onSelectConversation={chooseConversation}
      onNewConversation={openDraft}
      onOpenSettings={openSettings}
      isRunning={runtime.isRunning}
      onRenameConversation={runtime.renameConversation}
      onDeleteConversation={runtime.deleteConversation}
      collapsed={collapsed}
    />
  );

  return (
    <Dialog.Root open={drawerOpen} onOpenChange={setDrawerOpen}>
      <div className="flex h-dvh overflow-hidden bg-background text-foreground">
        <div className="hidden lg:block">
          <CollapsibleSidebarShell
            expanded={sidebarOpen}
            mobile={false}
            mobileOpen={false}
            desktopBreakpoint="lg"
            onDesktopToggle={toggleSidebar}
            home={(
              <SidebarBrandLink
                href="/dashboard"
                ariaLabel="대시보드로 돌아가기"
                title="대시보드로 돌아가기"
                showLabel={sidebarOpen}
              />
            )}
            body={renderTree(!sidebarOpen)}
          />
        </div>
        <main className={`flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background ${sidebarOpen ? 'lg:pl-[256px]' : 'lg:pl-[64px]'}`}>
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
          <ConversationFlow
            supplementalContent={approvalContent}
            emptyState={!runtime.activeConversation ? (
              <ConversationEmptyState
                contextLabel={context.label}
                description={context.description}
                suggestions={context.suggestions}
                onSuggestion={(message) => runtime.updateDraft({ message })}
              />
            ) : undefined}
          />
        </main>

        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-black/25 lg:hidden" />
          <Dialog.Content aria-label="대화 목록" aria-describedby={undefined} className="fixed inset-y-0 left-0 z-50 flex w-[256px] max-w-[calc(100vw-2rem)] outline-none lg:hidden">
            <Dialog.Title className="sr-only">대화 목록</Dialog.Title>
            {renderTree()}
            <Dialog.Close asChild>
              <button type="button" aria-label="대화 목록 닫기" className="absolute right-2 top-2 inline-flex min-h-10 min-w-10 items-center justify-center rounded-md bg-card shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 max-lg:min-h-11 max-lg:min-w-11">
                <X aria-hidden="true" size={18} />
              </button>
            </Dialog.Close>
          </Dialog.Content>
        </Dialog.Portal>
      </div>
    </Dialog.Root>
  );
}
