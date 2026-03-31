'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
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
  TrendingUp,
  Headphones,
  AlertTriangle,
  ClipboardList,
  ArrowUpDown,
  Network,
  Bot,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useStore } from '@/store/useStore';

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const navSections: NavSection[] = [
  {
    title: '소싱',
    items: [
      { href: '/sourcing', label: '소싱/수집', icon: Search },
      { href: '/generate', label: '콘텐츠 생성', icon: Sparkles },
    ],
  },
  {
    title: '주문',
    items: [
      { href: '/', label: '대시보드', icon: LayoutDashboard },
      { href: '/orders', label: '주문 조회', icon: ShoppingCart },
      { href: '/cs-management', label: 'CS 관리', icon: Headphones },
      { href: '/unshipped-items', label: '미배송 조회', icon: AlertTriangle },
    ],
  },
  {
    title: '상품',
    items: [
      { href: '/products', label: '상품 관리', icon: Package },
      { href: '/core-products', label: '핵심상품', icon: Star },
      { href: '/cleanup', label: '정리대상', icon: Trash2 },
    ],
  },
  {
    title: '재고',
    items: [
      { href: '/inventory', label: '재고 현황', icon: Warehouse },
      { href: '/purchase-orders', label: '발주 관리', icon: ClipboardList },
      { href: '/stock-movement', label: '입출고 현황', icon: ArrowUpDown },
    ],
  },
  {
    title: '출고',
    items: [
      { href: '/returns', label: '반품 관리', icon: RotateCcw },
    ],
  },
  {
    title: '분석',
    items: [
      { href: '/profit-loss', label: '손익 분석', icon: BarChart3 },
      { href: '/sales-analysis', label: '통합매출분석', icon: TrendingUp },
      { href: '/ads-hub', label: '광고 대시보드', icon: Megaphone },
    ],
  },
  {
    title: '운영',
    items: [
      { href: '/reviews', label: '리뷰 관리', icon: MessageSquare },
      { href: '/thumbnails', label: '썸네일 AI', icon: Image },
      { href: '/ontology', label: 'Ontology', icon: Network },
      { href: '/reports', label: '리포트', icon: FileSpreadsheet },
      { href: '/settings', label: '설정', icon: Settings },
    ],
  },
  {
    title: '자동화',
    items: [
      { href: '/workflows', label: '워크플로우', icon: GitBranch },
      { href: '/logs', label: '실행 로그', icon: FileText },
      { href: '/agents', label: '에이전트', icon: Bot },
    ],
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { sidebarOpen, toggleSidebar, setSidebarOpen } = useStore();

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    if (mq.matches) setSidebarOpen(false);
    const handler = (e: MediaQueryListEvent) => { if (e.matches) setSidebarOpen(false); };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [setSidebarOpen]);

  useEffect(() => {
    if (window.innerWidth < 768) setSidebarOpen(false);
  }, [pathname, setSidebarOpen]);

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href);

  return (
    <>
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/30 md:hidden"
          onClick={toggleSidebar}
        />
      )}
      <aside
        className={cn(
          'fixed left-0 top-0 z-50 h-screen bg-white border-r border-gray-200 transition-all duration-300 flex flex-col',
          sidebarOpen ? 'translate-x-0 w-60' : '-translate-x-full w-60',
          sidebarOpen ? 'md:translate-x-0 md:w-60' : 'md:translate-x-0 md:w-[68px]'
        )}
      >
        {/* Logo */}
        <div className="flex items-center h-16 px-4 border-b border-gray-200">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center flex-shrink-0">
              <Zap className="w-4 h-4 text-white" />
            </div>
            {sidebarOpen && (
              <div className="min-w-0">
                <h1 className="text-base font-bold text-gray-900 truncate">
                  KidItem
                </h1>
                <p className="text-[10px] text-gray-500 truncate">
                  셀러 관리 시스템
                </p>
              </div>
            )}
          </div>
          <button
            onClick={toggleSidebar}
            className={cn(
              'ml-auto p-2.5 rounded-lg hover:bg-gray-100 transition-colors text-gray-500',
              !sidebarOpen && 'rotate-180'
            )}
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        </div>

        {/* Navigation */}
        <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-200">
          {/* Standard nav sections */}
          {navSections.map((section, idx) => (
            <div key={section.title} className="px-3 pb-1">
              {sidebarOpen ? (
                <p
                  className={cn(
                    'px-3 mb-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider',
                    idx === 0 ? 'mt-3' : 'mt-4'
                  )}
                >
                  {section.title}
                </p>
              ) : (
                idx > 0 && <div className="mx-3 my-2 border-t border-gray-200" />
              )}
              <nav className="space-y-0.5">
                {section.items.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={!sidebarOpen ? item.label : undefined}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-200',
                      isActive(item.href)
                        ? 'bg-blue-50 text-blue-600 border border-blue-500/20'
                        : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900 border border-transparent'
                    )}
                  >
                    <item.icon className="w-4 h-4 flex-shrink-0" />
                    {sidebarOpen && (
                      <span className="truncate">{item.label}</span>
                    )}
                  </Link>
                ))}
              </nav>
            </div>
          ))}

        </div>

        {/* Status */}
        {sidebarOpen && (
          <div className="px-4 py-4 border-t border-gray-200">
            <div className="flex items-center gap-2 text-[11px] text-gray-600">
              <div className="w-2 h-2 rounded-full bg-emerald-500 pulse-dot" />
              <span>시스템 정상 운영중</span>
            </div>
          </div>
        )}
      </aside>
    </>
  );
}
