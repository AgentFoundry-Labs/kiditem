'use client';

import { useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';
import { useStore } from '@/store/useStore';
import { cn } from '@/lib/utils';
import Sidebar from './Sidebar';
import { PanelSheet } from '@/components/panel/PanelSheet';
import { PanelErrorBoundary } from '@/components/panel/PanelErrorBoundary';
import { usePanelStream } from '@/components/panel/hooks/usePanelStream';

const CopilotChat = dynamic(() => import('./CopilotChat'), { ssr: false });

function PanelMount() {
  usePanelStream();
  return <PanelSheet />;
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { sidebarOpen } = useStore();
  const pathname = usePathname();
  const [chatOpen, setChatOpen] = useState(false);

  const toggleChat = useCallback(() => {
    const btn = document.querySelector('.copilotKitButton') as HTMLButtonElement | null;
    if (btn) btn.click();
  }, []);

  if (pathname.includes('/editor')) {
    return <>{children}</>;
  }

  const content = (
    <div className="min-h-screen bg-slate-50">
      <Sidebar onChatToggle={toggleChat} chatOpen={chatOpen} />
      <div
        className={cn(
          'transition-all duration-300',
          sidebarOpen ? 'md:ml-60' : 'md:ml-[68px]'
        )}
      >
        <main className="p-6">{children}</main>
      </div>
      <PanelErrorBoundary>
        <PanelMount />
      </PanelErrorBoundary>
    </div>
  );

  return (
    <CopilotChat onChatOpenChange={setChatOpen}>
      {content}
    </CopilotChat>
  );
}
