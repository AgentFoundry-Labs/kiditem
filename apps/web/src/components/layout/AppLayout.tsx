'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useStore } from '@/store/useStore';
import { cn } from '@/lib/utils';
import PageSkeleton from '@/components/ui/PageSkeleton';
import { PanelSheet } from '@/components/panel/PanelSheet';
import { PanelErrorBoundary } from '@/components/panel/PanelErrorBoundary';
import { usePanelStream } from '@/components/panel/hooks/usePanelStream';
import ReadinessModal from '@/components/ReadinessModal';
import GlobalConfirmDialog from '@/components/GlobalConfirmDialog';
import GenerationCompletionWatcher from '@/components/GenerationCompletionWatcher';
import QuickActionFab from '@/components/QuickActionFab';
import { useAuth } from '@/hooks/useAuth';
import RebuildReadinessBanner from '@/components/RebuildReadinessBanner';
import { ConversationProvider } from '@/components/agent-interaction/ConversationProvider';
import { openConversation } from '@/components/agent-interaction/conversation-surface-state';
import Sidebar from './Sidebar';

function PanelMount() {
  usePanelStream();
  return <PanelSheet />;
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { sidebarOpen } = useStore();
  const auth = useAuth();
  const pathname = usePathname();
  const router = useRouter();

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

  if (isAgentWorkspace) {
    return <ConversationProvider>{children}</ConversationProvider>;
  }

  const isEditorRoute = pathname.includes('/editor');
  const isFinalSelectionRoute = pathname === '/sourcing-ai/final-selection';
  const isWingCatalogRoute = pathname === '/sourcing-ai/wing-catalog';
  const collapsedForEditor = isEditorRoute || !sidebarOpen;
  const showAutoReadinessModal = pathname === '/dashboard';

  const content = (
    <div className="min-h-screen bg-[var(--background)]">
      <Sidebar lockCollapsed={isEditorRoute} />
      <div
        className={cn(
          'transition-all duration-300',
          collapsedForEditor ? 'md:ml-[68px]' : 'md:ml-60'
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
      <PanelErrorBoundary>
        <PanelMount />
      </PanelErrorBoundary>
      {showAutoReadinessModal && <ReadinessModal autoOpenWhen="collectionIssue" />}
      <GlobalConfirmDialog />
      <GenerationCompletionWatcher />
      {isEditorRoute ? null : (
        <QuickActionFab
          onOpenConversation={() => {
            openConversation({ fixedAgentKey: null });
            router.push('/agent-os');
          }}
        />
      )}
    </div>
  );

  if (isEditorRoute) return content;

  return content;
}
