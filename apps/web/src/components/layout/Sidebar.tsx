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
  Megaphone,
  MessageSquare,
  Settings,
  GitBranch,
  PanelLeftClose,
  PanelLeftOpen,
  ChevronDown,
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
  Layers,
  ClipboardList,
  Boxes,
  Truck,
  ScanLine,
  Handshake,
  Users,
  Building2,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useStore } from '@/store/useStore';

interface MenuItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

interface MenuSection {
  label: string;
  collapsible: boolean;
  items: MenuItem[];
}

const menuSections: MenuSection[] = [
  {
    label: '',
    collapsible: false,
    items: [
      { href: '/', label: '대시보드', icon: LayoutDashboard },
    ],
  },
  {
    label: '상품 파이프라인',
    collapsible: true,
    items: [
      { href: '/sourcing', label: '소싱/수집', icon: Search },
      { href: '/generate', label: '콘텐츠 생성', icon: Sparkles },
    ],
  },
  {
    label: '상품관리',
    collapsible: true,
    items: [
      { href: '/product-hub', label: '상품 관리', icon: Package },
      { href: '/reviews', label: '리뷰 관리', icon: MessageSquare },
      { href: '/option-masters', label: '옵션 마스터', icon: Layers },
      { href: '/ontology', label: '온톨로지', icon: GitBranch },
    ],
  },
  {
    label: '주문관리',
    collapsible: true,
    items: [
      { href: '/order-hub', label: '주문 처리', icon: ShoppingCart },
      { href: '/cs-management', label: 'CS 관리', icon: Headphones },
      { href: '/order-status-hub', label: '주문 현황', icon: ClipboardList },
      { href: '/unshipped-items', label: '미배송 조회', icon: AlertTriangle },
    ],
  },
  {
    label: '재고관리',
    collapsible: true,
    items: [
      { href: '/inventory-hub', label: '재고 관리', icon: Warehouse },
      { href: '/stock-ops', label: '재고 분석', icon: Boxes },
      { href: '/warehouses', label: '창고 관리', icon: Building2 },
    ],
  },
  {
    label: '출고/반품',
    collapsible: true,
    items: [
      { href: '/outbound', label: '출고 현황', icon: Truck },
      { href: '/returns', label: '반품 관리', icon: RotateCcw },
      { href: '/return-scan', label: '반품 스캔', icon: ScanLine },
    ],
  },
  {
    label: '거래처',
    collapsible: true,
    items: [
      { href: '/supplier-hub', label: '거래처 관리', icon: Handshake },
      { href: '/suppliers', label: '거래처 목록', icon: Users },
    ],
  },
  {
    label: '광고관리',
    collapsible: true,
    items: [
      { href: '/ads', label: '광고 대시보드', icon: Megaphone },
      { href: '/ads/campaigns', label: '캠페인 분석', icon: BarChart3 },
      { href: '/ads/strategy', label: 'ABC 전략', icon: Target },
      { href: '/ads/benchmark', label: '업계 벤치마크', icon: Activity },
      { href: '/ads/collect', label: '데이터 수집', icon: Download },
    ],
  },
  {
    label: '재무/분석',
    collapsible: true,
    items: [
      { href: '/profit-loss', label: '손익 분석', icon: TrendingUp },
      { href: '/sales-analysis', label: '매출 분석', icon: LineChart },
      { href: '/finance-hub', label: '정산 관리', icon: Wallet },
    ],
  },
  {
    label: '',
    collapsible: false,
    items: [
      { href: '/agents', label: 'Agent OS', icon: Bot },
      { href: '/settings', label: '설정', icon: Settings },
    ],
  },
];

const adsSubPaths = ['/ads/campaigns', '/ads/strategy', '/ads/benchmark', '/ads/collect'];

function isItemActive(href: string, pathname: string): boolean {
  if (href === '/') return pathname === '/';
  if (href === '/agents') return pathname.startsWith('/agents') || pathname.startsWith('/workflows') || pathname.startsWith('/marketplace');
  if (href === '/ads') {
    return pathname === '/ads' ||
      (pathname.startsWith('/ads/') && !adsSubPaths.some(sub => pathname.startsWith(sub)));
  }
  return pathname === href || pathname.startsWith(href + '/');
}

function findActiveSection(pathname: string): string | null {
  for (const section of menuSections) {
    if (!section.collapsible || !section.label) continue;
    for (const item of section.items) {
      if (isItemActive(item.href, pathname)) return section.label;
    }
  }
  return null;
}

export default function Sidebar() {
  const pathname = usePathname();
  const { sidebarOpen, toggleSidebar, setSidebarOpen } = useStore();
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => {
    const active = findActiveSection(pathname);
    return active ? new Set([active]) : new Set();
  });

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

  useEffect(() => {
    const active = findActiveSection(pathname);
    if (active) {
      setOpenGroups((prev) => {
        if (prev.has(active)) return prev;
        const next = new Set(prev);
        next.add(active);
        return next;
      });
    }
  }, [pathname]);

  const toggleGroup = (label: string) => {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
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
          'fixed left-0 top-0 z-50 h-screen bg-white border-r border-gray-200 transition-all duration-300 flex flex-col font-sans',
          sidebarOpen
            ? 'translate-x-0 w-60 md:translate-x-0 md:w-60'
            : '-translate-x-full w-60 md:translate-x-0 md:w-[68px]'
        )}
      >
        {/* Logo */}
        <div className="h-14 flex items-center px-5 border-b border-gray-100">
          {sidebarOpen ? (
            <>
              <Link href="/" className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-violet-500 flex items-center justify-center flex-shrink-0">
                  <span className="text-[12px] font-extrabold text-white">K</span>
                </div>
                <span className="text-[16px] font-bold text-gray-900 tracking-tight">Kiditem</span>
              </Link>
              <button
                onClick={toggleSidebar}
                className="ml-auto text-gray-400 hover:text-gray-600 p-1 rounded transition-colors"
              >
                <PanelLeftClose size={16} />
              </button>
            </>
          ) : (
            <button
              onClick={toggleSidebar}
              className="mx-auto text-gray-400 hover:text-gray-600 p-1 transition-colors"
            >
              <PanelLeftOpen size={16} />
            </button>
          )}
        </div>

        {/* Scrollable nav — collapsible sections */}
        <nav className="flex-1 py-2 overflow-y-auto" style={{ scrollbarWidth: 'none' }}>
          {menuSections.slice(0, -1).map((section, si) => {
            const isOpen = !section.collapsible || openGroups.has(section.label);
            const hasActiveChild = section.items.some(item =>
              isItemActive(item.href, pathname)
            );

            return (
              <div key={si}>
                {/* 구분선 */}
                {!sidebarOpen && si > 0 && (
                  <div className="mx-3 my-2 border-t border-gray-100" />
                )}

                {/* 그룹 라벨 (접힘식) */}
                {sidebarOpen && section.label && section.collapsible && (
                  <button
                    onClick={() => toggleGroup(section.label)}
                    className="w-full flex items-center justify-between px-5 pt-5 pb-1.5 group transition-colors"
                  >
                    <span className={cn(
                      'text-[14px] font-medium transition-colors',
                      hasActiveChild ? 'text-violet-500' : 'text-gray-700 group-hover:text-gray-900'
                    )}>
                      {section.label}
                    </span>
                    <ChevronDown
                      size={14}
                      className={cn(
                        'text-gray-300 group-hover:text-gray-400 transition-all duration-200',
                        isOpen ? '' : '-rotate-90'
                      )}
                    />
                  </button>
                )}

                {/* 아이템 목록 */}
                <div className={cn(
                  'space-y-0.5 px-3 overflow-hidden transition-all duration-200',
                  !sidebarOpen || !section.collapsible || isOpen
                    ? 'max-h-[500px] opacity-100 mt-1'
                    : 'max-h-0 opacity-0'
                )}>
                  {section.items.map((item) => {
                    const active = isItemActive(item.href, pathname);
                    const Icon = item.icon;

                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={cn(
                          'group flex items-center gap-3 px-3 py-2 rounded-lg text-[14px] transition-all duration-100 relative',
                          active
                            ? 'bg-violet-50 text-gray-900'
                            : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50',
                          !sidebarOpen && 'justify-center px-0'
                        )}
                        title={!sidebarOpen ? item.label : undefined}
                      >
                        {active && (
                          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-violet-500 rounded-r" />
                        )}
                        <Icon
                          size={18}
                          strokeWidth={active ? 2 : 1.5}
                          className={cn(
                            'shrink-0 transition-colors',
                            active ? 'text-violet-500' : 'text-gray-400 group-hover:text-gray-500'
                          )}
                        />
                        {sidebarOpen && (
                          <span className={active ? 'font-semibold' : 'font-medium'}>
                            {item.label}
                          </span>
                        )}
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>

        {/* Bottom pinned — Agent OS + 설정 */}
        <div className="border-t border-gray-100 px-3 py-2 space-y-0.5">
          {menuSections[menuSections.length - 1].items.map((item) => {
            const active = isItemActive(item.href, pathname);
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'group flex items-center gap-3 px-3 py-2 rounded-lg text-[14px] transition-all duration-100 relative',
                  active
                    ? 'bg-violet-50 text-gray-900'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50',
                  !sidebarOpen && 'justify-center px-0'
                )}
                title={!sidebarOpen ? item.label : undefined}
              >
                {active && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-violet-500 rounded-r" />
                )}
                <Icon
                  size={18}
                  strokeWidth={active ? 2 : 1.5}
                  className={cn(
                    'shrink-0 transition-colors',
                    active ? 'text-violet-500' : 'text-gray-400 group-hover:text-gray-500'
                  )}
                />
                {sidebarOpen && (
                  <span className={active ? 'font-semibold' : 'font-medium'}>
                    {item.label}
                  </span>
                )}
              </Link>
            );
          })}
          {sidebarOpen && (
            <div className="flex items-center gap-2 px-3 pt-2 pb-1">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 pulse-dot" />
              <span className="text-[11px] text-gray-400 font-mono tracking-wide">
                SYSTEM ONLINE
              </span>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
