'use client';

import { useStore } from '@/shared/store/useStore';
import { cn } from '@/lib/utils';
import Sidebar from './Sidebar';
import Header from './Header';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { sidebarOpen } = useStore();

  return (
    <div className="min-h-screen bg-[#0a0b0f]">
      <Sidebar />
      <div
        className={cn(
          'transition-all duration-300',
          sidebarOpen ? 'ml-60' : 'ml-[68px]'
        )}
      >
        <Header />
        <main className="p-6">{children}</main>
      </div>
    </div>
  );
}
