'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  GitBranch,
  Settings,
  ShoppingCart,
  Calculator,
  Package,
  Headphones,
  FileText,
  Tag,
  Megaphone,
  ChevronLeft,
  Zap,
} from 'lucide-react';
import { cn, getModuleColor } from '@/lib/utils';
import { useStore } from '@/shared/store/useStore';

const mainNav = [
  { href: '/', label: '대시보드', icon: LayoutDashboard },
  { href: '/workflows', label: '워크플로우', icon: GitBranch },
  { href: '/logs', label: '실행 로그', icon: FileText },
  { href: '/settings', label: '설정', icon: Settings },
];

const moduleNav = [
  { id: 'order' as const, href: '/modules/order', label: '주문관리', icon: ShoppingCart },
  { id: 'accounting' as const, href: '/modules/accounting', label: '회계/경리', icon: Calculator },
  { id: 'inventory' as const, href: '/modules/inventory', label: '재고관리', icon: Package },
  { id: 'cs' as const, href: '/modules/cs', label: 'CS관리', icon: Headphones },
  { id: 'report' as const, href: '/modules/report', label: '보고서', icon: FileText },
  { id: 'product' as const, href: '/modules/product', label: '상품관리', icon: Tag },
  { id: 'marketing' as const, href: '/modules/marketing', label: '마케팅', icon: Megaphone },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { sidebarOpen, toggleSidebar, modules } = useStore();

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 z-40 h-screen bg-[#0d0e13] border-r border-[#1e2028] transition-all duration-300 flex flex-col',
        sidebarOpen ? 'w-60' : 'w-[68px]'
      )}
    >
      {/* Logo */}
      <div className="flex items-center h-16 px-4 border-b border-[#1e2028]">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center flex-shrink-0">
            <Zap className="w-4 h-4 text-white" />
          </div>
          {sidebarOpen && (
            <div className="min-w-0">
              <h1 className="text-sm font-bold text-white truncate">KidItem</h1>
              <p className="text-[10px] text-gray-500 truncate">Workflow Auto System</p>
            </div>
          )}
        </div>
        <button
          onClick={toggleSidebar}
          className={cn(
            'ml-auto p-1.5 rounded-lg hover:bg-[#1a1d26] transition-colors text-gray-500',
            !sidebarOpen && 'rotate-180'
          )}
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
      </div>

      {/* Main Nav */}
      <nav className="px-3 py-4 space-y-1">
        {mainNav.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-200',
                isActive
                  ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                  : 'text-gray-400 hover:bg-[#1a1d26] hover:text-gray-200 border border-transparent'
              )}
            >
              <item.icon className="w-4 h-4 flex-shrink-0" />
              {sidebarOpen && <span className="truncate">{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Module Nav */}
      <div className="px-3 mt-2">
        {sidebarOpen && (
          <p className="px-3 mb-2 text-[10px] font-semibold text-gray-600 uppercase tracking-wider">
            Modules
          </p>
        )}
        <nav className="space-y-0.5">
          {moduleNav.map((item) => {
            const isActive = pathname === item.href;
            const moduleStatus = modules.find((m) => m.id === item.id);
            const color = getModuleColor(item.id);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-200 group',
                  isActive
                    ? 'bg-white/5 text-white border border-white/10'
                    : 'text-gray-500 hover:bg-[#1a1d26] hover:text-gray-300 border border-transparent'
                )}
              >
                <div
                  className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                  style={{
                    backgroundColor: moduleStatus?.isActive ? color : '#374151',
                    boxShadow: moduleStatus?.isActive ? `0 0 6px ${color}40` : 'none',
                  }}
                />
                {sidebarOpen && (
                  <>
                    <span className="truncate flex-1">{item.label}</span>
                    {moduleStatus && moduleStatus.isActive && (
                      <span className="text-[10px] text-gray-600">
                        {moduleStatus.activeWorkflows}
                      </span>
                    )}
                  </>
                )}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Footer */}
      {sidebarOpen && (
        <div className="mt-auto px-4 py-4 border-t border-[#1e2028]">
          <div className="flex items-center gap-2 text-[11px] text-gray-600">
            <div className="w-2 h-2 rounded-full bg-emerald-500 pulse-dot" />
            <span>시스템 정상 운영중</span>
          </div>
        </div>
      )}
    </aside>
  );
}
