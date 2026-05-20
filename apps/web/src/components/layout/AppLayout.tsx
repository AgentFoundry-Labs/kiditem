'use client';

import { useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';
import { useStore } from '@/store/useStore';
import { cn } from '@/lib/utils';
import Sidebar from './Sidebar';
import PageSkeleton from '@/components/ui/PageSkeleton';
import { PanelSheet } from '@/components/panel/PanelSheet';
import { PanelErrorBoundary } from '@/components/panel/PanelErrorBoundary';
import { usePanelStream } from '@/components/panel/hooks/usePanelStream';
import ReadinessModal from '@/components/ReadinessModal';
import GlobalConfirmDialog from '@/components/GlobalConfirmDialog';
import GenerationCompletionWatcher from '@/components/GenerationCompletionWatcher';
import QuickActionFab from '@/components/QuickActionFab';
import { useAuthSession } from '@/components/providers/AuthProvider';

const CopilotChat = dynamic(() => import('./CopilotChat'), { ssr: false });

function PanelMount() {
  usePanelStream();
  return <PanelSheet />;
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { sidebarOpen } = useStore();
  const { isLoading: authLoading } = useAuthSession();
  const pathname = usePathname();
  const [chatMounted, setChatMounted] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);

  const toggleChat = useCallback(() => {
    if (!chatMounted) {
      setChatMounted(true);
      setChatOpen(true);
      return;
    }
    const btn = document.querySelector('.copilotKitButton') as HTMLButtonElement | null;
    if (btn) btn.click();
  }, [chatMounted]);

  // 풀스크린 surface — sidebar/panel/copilot 없이 children 만 렌더.
  // - `/` (launcher) 와 `/agent-os` 는 자체 레이아웃 (main).
  // - `/login` 은 인증 진입점 (이 PR).
  if (pathname === '/' || pathname.startsWith('/agent-os') || pathname.startsWith('/login')) {
    return <>{children}</>;
  }

  const isEditorRoute = pathname.includes('/editor');
  const collapsedForEditor = isEditorRoute || !sidebarOpen;
  const showAutoReadinessModal = pathname === '/dashboard';

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[var(--background)] p-6">
        <PageSkeleton variant={pathname === '/dashboard' ? 'dashboard' : 'table'} />
      </div>
    );
  }

  const content = (
    <div className="min-h-screen bg-[var(--background)]">
      <Sidebar onChatToggle={toggleChat} chatOpen={chatOpen} lockCollapsed={isEditorRoute} />
      <div
        className={cn(
          'transition-all duration-300',
          collapsedForEditor ? 'md:ml-[68px]' : 'md:ml-60'
        )}
      >
        <main className={cn(isEditorRoute ? 'p-0' : 'p-6')}>{children}</main>
      </div>
      <PanelErrorBoundary>
        <PanelMount />
      </PanelErrorBoundary>
      {showAutoReadinessModal && <ReadinessModal autoOpenWhen="collectionIssue" />}
      <GlobalConfirmDialog />
      <GenerationCompletionWatcher />
      {isEditorRoute ? null : <QuickActionFab />}
    </div>
  );

  if (isEditorRoute || !chatMounted) return content;

  return (
    <>
      {content}
      <CopilotChat defaultOpen onChatOpenChange={setChatOpen} />
    </>
  );
}
