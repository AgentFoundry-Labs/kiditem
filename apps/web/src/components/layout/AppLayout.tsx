'use client';

import { useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';
import { useStore } from '@/store/useStore';
import { cn } from '@/lib/utils';
import Sidebar from './Sidebar';

const CopilotChat = dynamic(() => import('./CopilotChat'), { ssr: false });

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
    </div>
  );

  return (
    <CopilotChat onChatOpenChange={setChatOpen}>
      {content}
    </CopilotChat>
  );
}
