'use client';

import { useStore } from '@/store/useStore';
import { cn } from '@/lib/utils';
import { usePathname } from 'next/navigation';
import Sidebar from './Sidebar';
import Header from './Header';
import ChatBot from '@/components/chat/ChatBot';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { sidebarOpen } = useStore();
  const pathname = usePathname();

  if (pathname.includes('/editor')) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar />
      <div
        className={cn(
          'transition-all duration-300',
          sidebarOpen ? 'md:ml-60' : 'md:ml-[68px]'
        )}
      >
        <Header />
        <main className="p-6">{children}</main>
      </div>
      <ChatBot />
    </div>
  );
}
