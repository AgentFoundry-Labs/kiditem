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
  MessageSquare,
  FileSpreadsheet,
  Settings,
  GitBranch,
  ChevronLeft,
  Zap,
  Search,
  Sparkles,
  TrendingUp,
  Headphones,
  AlertTriangle,
  Bot,
  Target,
  LineChart,
  Activity,
  Download,
  Coins,
  BookOpen,
  Store,
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

// Design Ref: §3.1 — Option C: dashboardItem + navSections + bottomItem 3변수 분리
const dashboardItem: NavItem = {
  href: '/', label: '대시보드', icon: LayoutDashboard,
};

const navSections: NavSection[] = [
  {
    title: '상품 파이프라인',
    items: [
      { href: '/sourcing', label: '소싱/수집', icon: Search },
      { href: '/generate', label: '콘텐츠 생성', icon: Sparkles },
      { href: '/products', label: '상품 관리', icon: Package },
      { href: '/thumbnails', label: '썸네일 AI', icon: Image },
    ],
  },
  {
    title: '주문·물류',
    items: [
      { href: '/orders', label: '주문 조회', icon: ShoppingCart },
      { href: '/cs-management', label: 'CS 관리', icon: Headphones },
      { href: '/unshipped-items', label: '미배송 조회', icon: AlertTriangle },
      { href: '/purchase-orders', label: '발주 관리', icon: Package },
      { href: '/returns', label: '반품 관리', icon: RotateCcw },
      { href: '/inventory', label: '재고 현황', icon: Warehouse },
      { href: '/reviews', label: '리뷰 관리', icon: MessageSquare },
    ],
  },
  {
    title: '광고 관리',
    items: [
      { href: '/ads', label: '광고 대시보드', icon: Megaphone },
      { href: '/ads/campaigns', label: '캠페인 분석', icon: BarChart3 },
      { href: '/ads/strategy', label: 'ABC 전략', icon: Target },
      { href: '/ads/benchmark', label: '업계 벤치마크', icon: Activity },
      { href: '/ads/collect', label: '데이터 수집', icon: Download },
    ],
  },
  {
    title: '분석',
    items: [
      { href: '/profit-loss', label: '손익 분석', icon: TrendingUp },
      { href: '/sales-analysis', label: '통합매출분석', icon: LineChart },
      { href: '/reports', label: '리포트', icon: FileSpreadsheet },
    ],
  },
  {
    title: '에이전트',
    items: [
      { href: '/agents', label: '에이전트 관리', icon: Bot },
      { href: '/workflows', label: '워크플로우', icon: GitBranch },
      { href: '/marketplace', label: '마켓플레이스', icon: Store },
      { href: '/agents/activity', label: '활동 로그', icon: Activity },
      { href: '/agents/costs', label: '비용 분석', icon: Coins },
      { href: '/agents/skills', label: '스킬 카탈로그', icon: BookOpen },
    ],
  },
];

const bottomItem: NavItem = {
  href: '/settings', label: '설정', icon: Settings,
};

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

  // Design Ref: §6 — 에이전트 서브페이지 활성 표시를 위한 정확 매칭
  const agentSubPaths = ['/agents/activity', '/agents/costs', '/agents/skills'];
  const adsSubPaths = ['/ads/campaigns', '/ads/strategy', '/ads/benchmark', '/ads/collect'];
  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    if (href === '/agents') {
      return pathname === '/agents' ||
        (pathname.startsWith('/agents/') &&
         !agentSubPaths.some(sub => pathname.startsWith(sub)));
    }
    if (href === '/ads') {
      return pathname === '/ads' ||
        (pathname.startsWith('/ads/') &&
         !adsSubPaths.some(sub => pathname.startsWith(sub)));
    }
    return pathname.startsWith(href);
  };

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
          'fixed left-0 top-0 z-50 h-screen bg-gray-50/80 border-r border-gray-100 transition-all duration-300 flex flex-col',
          sidebarOpen ? 'translate-x-0 w-60' : '-translate-x-full w-60',
          sidebarOpen ? 'md:translate-x-0 md:w-60' : 'md:translate-x-0 md:w-[68px]'
        )}
      >
        {/* Logo */}
        <div className="flex items-center h-16 px-4 border-b border-gray-100">
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
                  Agent OS
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

        {/* Dashboard — 섹션 밖 단독 */}
        <div className="px-3 pt-3 pb-1">
          <nav>
            <Link
              href={dashboardItem.href}
              title={!sidebarOpen ? dashboardItem.label : undefined}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-200',
                isActive(dashboardItem.href)
                  ? 'bg-white text-gray-900 border border-gray-200 shadow-sm'
                  : 'text-gray-500 hover:bg-gray-100/70 hover:text-gray-700 border border-transparent'
              )}
            >
              <dashboardItem.icon className="w-4 h-4 flex-shrink-0" />
              {sidebarOpen && (
                <span className="truncate">{dashboardItem.label}</span>
              )}
            </Link>
          </nav>
        </div>

        {/* Sections — 스크롤 영역 */}
        <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-200">
          {navSections.map((section, idx) => (
            <div key={section.title} className="px-3 pb-1">
              {sidebarOpen ? (
                <p
                  className={cn(
                    'px-3 mb-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider',
                    idx === 0 ? 'mt-2' : 'mt-4'
                  )}
                >
                  {section.title}
                </p>
              ) : (
                <div className="mx-3 my-2 border-t border-gray-100" />
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
                        ? 'bg-white text-gray-900 border border-gray-200 shadow-sm'
                        : 'text-gray-500 hover:bg-gray-100/70 hover:text-gray-700 border border-transparent'
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

        {/* Bottom — 설정 하단 고정 */}
        <div className="border-t border-gray-100 px-3 py-2">
          <nav>
            <Link
              href={bottomItem.href}
              title={!sidebarOpen ? bottomItem.label : undefined}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-200',
                isActive(bottomItem.href)
                  ? 'bg-white text-gray-900 border border-gray-200 shadow-sm'
                  : 'text-gray-500 hover:bg-gray-100/70 hover:text-gray-700 border border-transparent'
              )}
            >
              <bottomItem.icon className="w-4 h-4 flex-shrink-0" />
              {sidebarOpen && (
                <span className="truncate">{bottomItem.label}</span>
              )}
            </Link>
          </nav>
          {sidebarOpen && (
            <div className="flex items-center gap-2 text-[11px] text-gray-600 px-3 pt-2 pb-1">
              <div className="w-2 h-2 rounded-full bg-emerald-500 pulse-dot" />
              <span>시스템 정상 운영중</span>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
