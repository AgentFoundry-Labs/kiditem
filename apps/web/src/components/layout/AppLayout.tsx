'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useStore } from '@/store/useStore';
import { cn } from '@/lib/utils';
import PageSkeleton from '@/components/ui/PageSkeleton';
import { PanelErrorBoundary } from '@/components/panel/PanelErrorBoundary';
import { usePanelStream } from '@/components/panel/hooks/usePanelStream';
import ReadinessModal from '@/components/ReadinessModal';
import GlobalConfirmDialog from '@/components/GlobalConfirmDialog';
import GenerationCompletionWatcher from '@/components/GenerationCompletionWatcher';
import QuickActionFab from '@/components/QuickActionFab';
import { useAuth } from '@/hooks/useAuth';
import RebuildReadinessBanner from '@/components/RebuildReadinessBanner';
import { ConversationProvider } from '@/components/agent-interaction/ConversationProvider';
import { ConversationRuntimeHost } from '@/components/agent-interaction/ConversationRuntimeHost';
import { conversationIdentityKey, type ConversationIdentity } from '@/lib/query-keys';
import {
  openConversation,
  useConversationSurfaceState,
} from '@/components/agent-interaction/conversation-surface-state';
import { RightAuxiliaryPanel } from './RightAuxiliaryPanel';
import { RightSurfaceLauncherProvider } from './right-surface-launcher-context';
import Sidebar from './Sidebar';

function NotificationDataMount() {
  usePanelStream();
  return null;
}

function ConversationRuntimeShell({
  children,
  identity,
}: {
  children: React.ReactNode;
  identity: ConversationIdentity;
}) {
  return (
    <ConversationProvider>
      <ConversationRuntimeHost identity={identity}>{children}</ConversationRuntimeHost>
    </ConversationProvider>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const {
    sidebarOpen,
    activeRightSurface,
    selectRightSurface,
    closeRightSurface,
    resetRightSurface,
  } = useStore();
  const auth = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const launcherRef = useRef<HTMLElement | null>(null);
  const authenticatedIdentityRef = useRef<string | null>(null);
  const activeConversationId = useConversationSurfaceState((state) => state.activeConversationId);
  const resetConversationSurface = useConversationSurfaceState((state) => state.reset);
  const authenticatedIdentity = auth.status === 'ready' && auth.user?.organizationId
    ? { userId: auth.user.id, organizationId: auth.user.organizationId }
    : null;
  const authenticatedIdentityKey = authenticatedIdentity
    ? conversationIdentityKey(authenticatedIdentity)
    : null;

  // Public/isolated surfaces render their own layout. `/agent-os` is fullscreen
  // too, but remains a protected surface before its provider can mount.
  const isPublicOrIsolatedSurface =
    pathname === '/' ||
    pathname.startsWith('/login') ||
    pathname.startsWith('/detail-page-client-render');
  const isAgentWorkspace = pathname.startsWith('/agent-os');

  useEffect(() => {
    if (isPublicOrIsolatedSurface) return;
    if (auth.status !== 'anonymous') return;
    const nextPath = `${pathname}${window.location.search}`;
    router.replace(`/login?next=${encodeURIComponent(nextPath)}`);
  }, [auth.status, isPublicOrIsolatedSurface, pathname, router]);

  useEffect(() => {
    // A refetch may briefly report loading while retaining the same session.
    // Keep the last ready identity until auth resolves before deciding whether
    // ephemeral cross-user UI state must be discarded.
    if (auth.status === 'loading') return;

    const previousIdentity = authenticatedIdentityRef.current;
    if (previousIdentity && previousIdentity !== authenticatedIdentityKey) {
      resetRightSurface();
      resetConversationSurface();
    }
    authenticatedIdentityRef.current = authenticatedIdentityKey;
  }, [auth.status, authenticatedIdentityKey, resetConversationSurface, resetRightSurface]);

  if (isPublicOrIsolatedSurface) {
    return <>{children}</>;
  }

  if (auth.status === 'loading' || auth.status === 'anonymous') {
    return (
      <div className="min-h-screen bg-[var(--background)] p-6">
        <PageSkeleton variant={pathname === '/dashboard' ? 'dashboard' : 'table'} />
      </div>
    );
  }

  if (auth.status === 'no_organization') {
    return (
      <div className="min-h-screen bg-[var(--background)] p-6">
        <div className="mx-auto mt-20 max-w-md rounded-lg border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          <h1 className="text-base font-semibold">조직 연결이 필요합니다</h1>
          <p className="mt-2">
            로그인은 되었지만 활성 조직 멤버십이 없습니다. 관리자에게 조직 초대를 요청해주세요.
          </p>
          <button
            type="button"
            onClick={() => void auth.logout()}
            className="mt-4 rounded-md bg-amber-900 px-3 py-2 text-sm font-medium text-white hover:bg-amber-800"
          >
            로그인으로 돌아가기
          </button>
        </div>
      </div>
    );
  }

  if (auth.status === 'error') {
    return (
      <div className="min-h-screen bg-[var(--background)] p-6">
        <div className="mx-auto mt-20 max-w-md rounded-lg border border-red-200 bg-red-50 p-5 text-sm text-red-900">
          <h1 className="text-base font-semibold">로그인 상태를 확인하지 못했습니다</h1>
          <p className="mt-2">잠시 후 다시 시도하거나 다시 로그인해주세요.</p>
          <button
            type="button"
            onClick={() => void auth.logout()}
            className="mt-4 rounded-md bg-red-900 px-3 py-2 text-sm font-medium text-white hover:bg-red-800"
          >
            다시 로그인
          </button>
        </div>
      </div>
    );
  }

  const isEditorRoute = pathname.includes('/editor');
  const isFinalSelectionRoute = pathname === '/sourcing-ai/final-selection';
  const isWingCatalogRoute = pathname === '/sourcing-ai/wing-catalog';
  const collapsedForEditor = isEditorRoute || !sidebarOpen;
  const showAutoReadinessModal = pathname === '/dashboard';
  const visibleRightSurface = isAgentWorkspace && activeRightSurface === 'ai_chat'
    ? null
    : activeRightSurface;
  const auxiliaryVisible = visibleRightSurface !== null;

  const selectRightSurfaceFromLauncher = (
    surface: Exclude<typeof activeRightSurface, null>,
    launcher: HTMLElement,
  ) => {
    launcherRef.current = launcher;
    selectRightSurface(surface);
  };

  const openGeneralConversation = (launcher: HTMLElement) => {
    launcherRef.current = launcher;
    if (activeRightSurface === 'ai_chat') {
      selectRightSurface('ai_chat');
      return;
    }
    if (activeConversationId) {
      selectRightSurface('ai_chat');
      return;
    }
    openConversation({ fixedAgentKey: null });
  };

  const openConversationFromLauncher = (
    input: Parameters<typeof openConversation>[0],
    launcher: HTMLElement,
  ) => {
    launcherRef.current = launcher;
    openConversation(input);
  };

  const content = (
    <div className="min-h-screen bg-[var(--background)]">
      <Sidebar
        lockCollapsed={isEditorRoute}
        onChatToggle={openGeneralConversation}
        chatOpen={activeRightSurface === 'ai_chat'}
        onNotificationToggle={(launcher) => selectRightSurfaceFromLauncher('notifications', launcher)}
        notificationsOpen={activeRightSurface === 'notifications'}
      />
      <div
        data-testid="dashboard-content-offset"
        className={cn(
          'transition-[margin] duration-150 motion-reduce:transition-none',
          collapsedForEditor ? 'md:ml-[64px]' : 'md:ml-[256px]'
        )}
      >
        <RebuildReadinessBanner />
        <main
          className={cn(
            isEditorRoute || isWingCatalogRoute ? 'p-0' : isFinalSelectionRoute ? 'p-3' : 'p-6',
          )}
        >
          {children}
        </main>
      </div>
      {showAutoReadinessModal && <ReadinessModal autoOpenWhen="collectionIssue" />}
      <GlobalConfirmDialog />
      <GenerationCompletionWatcher />
      {isEditorRoute ? null : (
        <QuickActionFab
          onOpenConversation={openGeneralConversation}
          isAuxiliarySurfaceOpen={activeRightSurface !== null}
        />
      )}
    </div>
  );

  return (
    <ConversationRuntimeShell key={authenticatedIdentityKey} identity={authenticatedIdentity!}>
      <NotificationDataMount />
      <RightSurfaceLauncherProvider openConversationFromLauncher={openConversationFromLauncher}>
        <div
          data-testid="authenticated-work-surface"
          className={cn(
            'min-w-0 transition-[margin] duration-150 motion-reduce:transition-none',
            auxiliaryVisible && '2xl:mr-[352px]',
          )}
        >
          {isAgentWorkspace ? children : content}
        </div>
      </RightSurfaceLauncherProvider>
      <PanelErrorBoundary>
        <RightAuxiliaryPanel
          activeRightSurface={visibleRightSurface}
          onClose={closeRightSurface}
          launcherRef={launcherRef}
        />
      </PanelErrorBoundary>
    </ConversationRuntimeShell>
  );
}
