'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  ShoppingCart,
  RotateCcw,
  Package,
  BarChart3,
  Warehouse,
  Image,
  Megaphone,
  Star,
  Trash2,
  MessageSquare,
  FileSpreadsheet,
  Settings,
  GitBranch,
  FileText,
  ChevronLeft,
  Zap,
  Search,
  Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useStore } from '@/store/useStore';
import { API_BASE } from '@/lib/api';

const operationsNav = [
  { href: '/', label: '대시보드', icon: LayoutDashboard },
  { href: '/coupang/orders', label: '주문 대시보드', icon: BarChart3 },
  { href: '/coupang/returns', label: '반품 대시보드', icon: RotateCcw },
  { href: '/orders', label: '주문 처리', icon: ShoppingCart },
  { href: '/returns', label: '반품/교환', icon: RotateCcw },
  { href: '/products', label: '상품 관리', icon: Package },
  { href: '/profit-loss', label: '손익표', icon: BarChart3 },
  { href: '/inventory', label: '재고/발주', icon: Warehouse },
  { href: '/thumbnails', label: '썸네일', icon: Image },
  { href: '/ads', label: '광고 관리', icon: Megaphone },
  { href: '/core-products', label: '핵심상품', icon: Star },
  { href: '/cleanup', label: '정리 대상', icon: Trash2 },
  { href: '/reviews', label: '리뷰', icon: MessageSquare },
  { href: '/reports', label: '리포트', icon: FileSpreadsheet },
  { href: '/settings', label: '설정/연동', icon: Settings },
];

const sourcingNav = [
  { href: '/sourcing', label: '소싱/수집', icon: Search },
  { href: '/generate', label: '콘텐츠 생성', icon: Sparkles },
];

const automationNav = [
  { href: '/workflows', label: '워크플로우', icon: GitBranch },
  { href: '/logs', label: '실행 로그', icon: FileText },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { sidebarOpen, toggleSidebar } = useStore();
  const [badgeCounts, setBadgeCounts] = useState<{ pendingAccept: number; pendingReturns: number } | null>(null);

  useEffect(() => {
    fetch(`${API_BASE}/api/coupang-dashboard`)
      .then((r) => r.json())
      .then((data) =>
        setBadgeCounts({ pendingAccept: data.pendingAccept, pendingReturns: data.pendingReturns })
      )
      .catch(() => {}); // silent fail — badge is supplementary
  }, []);

  const renderNavItem = (item: (typeof operationsNav)[number]) => {
    const isActive =
      item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
    return (
      <Link
        key={item.href}
        href={item.href}
        title={!sidebarOpen ? item.label : undefined}
        className={cn(
          'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-200',
          isActive
            ? 'bg-blue-50 text-blue-600 border border-blue-500/20'
            : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900 border border-transparent'
        )}
      >
        <item.icon className="w-4 h-4 flex-shrink-0" />
        {sidebarOpen && <span className="truncate">{item.label}</span>}
        {sidebarOpen && item.href === '/coupang/orders' && badgeCounts && badgeCounts.pendingAccept > 0 && (
          <span className="ml-auto text-xs font-semibold bg-blue-100 text-blue-700 rounded-full px-1.5 py-0.5 min-w-[18px] text-center">
            {badgeCounts.pendingAccept}
          </span>
        )}
        {sidebarOpen && item.href === '/returns' && badgeCounts && badgeCounts.pendingReturns > 0 && (
          <span className="ml-auto text-xs font-semibold bg-amber-100 text-amber-700 rounded-full px-1.5 py-0.5 min-w-[18px] text-center">
            {badgeCounts.pendingReturns}
          </span>
        )}
      </Link>
    );
  };

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 z-40 h-screen bg-white border-r border-gray-200 transition-all duration-300 flex flex-col',
        sidebarOpen ? 'w-60' : 'w-[68px]'
      )}
    >
      <div className="flex items-center h-16 px-4 border-b border-gray-200">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center flex-shrink-0">
            <Zap className="w-4 h-4 text-gray-900" />
          </div>
          {sidebarOpen && (
            <div className="min-w-0">
              <h1 className="text-sm font-bold text-gray-900 truncate">KidItem</h1>
              <p className="text-[10px] text-gray-500 truncate">셀러 관리 시스템</p>
            </div>
          )}
        </div>
        <button
          onClick={toggleSidebar}
          className={cn(
            'ml-auto p-1.5 rounded-lg hover:bg-gray-100 transition-colors text-gray-500',
            !sidebarOpen && 'rotate-180'
          )}
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-200">
        <nav className="px-3 py-3 space-y-0.5">
          {operationsNav.map(renderNavItem)}
        </nav>

        <div className="px-3 pb-3">
          {sidebarOpen && (
            <p className="px-3 mb-2 text-[10px] font-semibold text-gray-600 uppercase tracking-wider">
              Sourcing
            </p>
          )}
          {!sidebarOpen && (
            <div className="mx-3 mb-2 border-t border-gray-200" />
          )}
          <nav className="space-y-0.5">
            {sourcingNav.map(renderNavItem)}
          </nav>
        </div>

        <div className="px-3 pb-3">
          {sidebarOpen && (
            <p className="px-3 mb-2 text-[10px] font-semibold text-gray-600 uppercase tracking-wider">
              Automation
            </p>
          )}
          {!sidebarOpen && (
            <div className="mx-3 mb-2 border-t border-gray-200" />
          )}
          <nav className="space-y-0.5">
            {automationNav.map(renderNavItem)}
          </nav>
        </div>
      </div>

      {sidebarOpen && (
        <div className="px-4 py-4 border-t border-gray-200">
          <div className="flex items-center gap-2 text-[11px] text-gray-600">
            <div className="w-2 h-2 rounded-full bg-emerald-500 pulse-dot" />
            <span>시스템 정상 운영중</span>
          </div>
        </div>
      )}
    </aside>
  );
}
