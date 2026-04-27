'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  ShoppingCart,
  RotateCcw,
  Package,
  Warehouse,
  MessageSquare,
  Settings,
  PanelLeftClose,
  PanelLeftOpen,
  ChevronDown,
  Search,
  Sparkles,
  TrendingUp,
  Headphones,
  AlertTriangle,
  Bot,
  LineChart,
  Layers,
  ClipboardList,
  Boxes,
  Truck,
  ScanLine,
  ImageIcon,
  Handshake,
  Users,
  Building2,
  Wallet,
  Bell,
  Zap,
  Wand2,
  FolderOpen,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useStore } from '@/store/useStore';
import { usePanelStore } from '@/components/panel/lib/panel-store';

interface MenuItem {
  href: string;
  label: string;
  icon: LucideIcon;
  gatedReason?: string;
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
      { href: '/ad-ops', label: '광고전략 AI', icon: Zap },
      {
        href: '/thumbnails',
        label: '썸네일 AI',
        icon: ImageIcon,
        gatedReason: 'AI 썸네일 backend contract 준비 중',
      },
      { href: '/action-board', label: '액션 보드', icon: ClipboardList },
    ],
  },
  {
    label: '상품 파이프라인',
    collapsible: true,
    items: [
      { href: '/sourcing', label: '소싱/수집', icon: Search },
      { href: '/image-hub', label: '이미지 관리', icon: FolderOpen },
      { href: '/thumbnail-editor', label: '썸네일 편집기', icon: Wand2 },
      { href: '/generate', label: '콘텐츠 생성', icon: Sparkles },
    ],
  },
  {
    label: '상품관리',
    collapsible: true,
    items: [
      { href: '/product-hub', label: '상품 관리', icon: Package },
      {
        href: '/reviews',
        label: '리뷰 관리',
        icon: MessageSquare,
      },
      {
        href: '/products/options',
        label: '상품 옵션 관리',
        icon: Layers,
      },
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


export default function Sidebar({ onChatToggle, chatOpen }: { onChatToggle?: () => void; chatOpen?: boolean }) {
  const pathname = usePathname();
  const { sidebarOpen, toggleSidebar, setSidebarOpen } = useStore();
  const setPanelOpen = usePanelStore((s) => s.setOpen);
  // PR2에서 PanelAlertItem(kind='alert') 추가 시 이 필터 업데이트
  const unreadAlertCount = usePanelStore(
    (s) => Object.values(s.byId).filter((i) => i.kind === 'run' && i.status === 'failed').length
  );
  const runningCount = usePanelStore((s) => s.runningCount());

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
          'fixed left-0 top-0 z-50 h-screen bg-white border-r border-slate-200 transition-all duration-300 flex flex-col font-sans',
          sidebarOpen
            ? 'translate-x-0 w-60 md:translate-x-0 md:w-60'
            : '-translate-x-full w-60 md:translate-x-0 md:w-[68px]'
        )}
      >
        {/* Logo */}
        <div className="h-14 flex items-center px-5 border-b border-slate-100">
          {sidebarOpen ? (
            <>
              <Link href="/" className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-violet-500 flex items-center justify-center flex-shrink-0">
                  <span className="text-[12px] font-extrabold text-white">K</span>
                </div>
                <span className="text-[16px] font-bold text-slate-900 tracking-tight">Kiditem</span>
              </Link>
              <button
                onClick={toggleSidebar}
                className="ml-auto text-slate-400 hover:text-slate-600 p-1 rounded transition-colors"
              >
                <PanelLeftClose size={16} />
              </button>
            </>
          ) : (
            <button
              onClick={toggleSidebar}
              className="mx-auto text-slate-400 hover:text-slate-600 p-1 transition-colors"
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
                  <div className="mx-3 my-2 border-t border-slate-100" />
                )}

                {/* 그룹 라벨 (접힘식) */}
                {sidebarOpen && section.label && section.collapsible && (
                  <button
                    onClick={() => toggleGroup(section.label)}
                    className="w-full flex items-center justify-between px-5 pt-5 pb-1.5 group transition-colors"
                  >
                    <span className={cn(
                      'text-[14px] font-medium transition-colors',
                      hasActiveChild ? 'text-violet-500' : 'text-slate-700 group-hover:text-slate-900'
                    )}>
                      {section.label}
                    </span>
                    <ChevronDown
                      size={14}
                      className={cn(
                        'text-slate-300 group-hover:text-slate-400 transition-all duration-200',
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
                    const content = (
                      <>
                        {active && (
                          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-violet-500 rounded-r" />
                        )}
                        <Icon
                          size={18}
                          strokeWidth={active ? 2 : 1.5}
                          className={cn(
                            'shrink-0 transition-colors',
                            item.gatedReason
                              ? 'text-slate-300'
                              : active ? 'text-violet-500' : 'text-slate-400 group-hover:text-slate-500'
                          )}
                        />
                        {sidebarOpen && (
                          <>
                            <span className={active ? 'font-semibold' : 'font-medium'}>
                              {item.label}
                            </span>
                            {item.gatedReason && (
                              <span className="ml-auto rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-400">
                                준비 중
                              </span>
                            )}
                          </>
                        )}
                      </>
                    );

                    if (item.gatedReason) {
                      return (
                        <button
                          key={item.href}
                          type="button"
                          disabled
                          data-sidebar-gated-route={item.href}
                          aria-label={`${item.label} — 준비 중`}
                          className={cn(
                            'group flex w-full cursor-not-allowed items-center gap-3 rounded-lg px-3 py-2 text-left text-[14px] text-slate-300 opacity-75 relative',
                            !sidebarOpen && 'justify-center px-0'
                          )}
                          title={item.gatedReason}
                        >
                          {content}
                        </button>
                      );
                    }

                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={cn(
                          'group flex items-center gap-3 px-3 py-2 rounded-lg text-[14px] transition-all duration-100 relative',
                          active
                            ? 'bg-violet-50 text-slate-900'
                            : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50',
                          !sidebarOpen && 'justify-center px-0'
                        )}
                        title={!sidebarOpen ? item.label : undefined}
                      >
                        {content}
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>

        {/* Bottom pinned — Agent OS + 설정 */}
        <div className="border-t border-slate-100 px-3 py-2 space-y-0.5">
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
                    ? 'bg-violet-50 text-slate-900'
                    : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50',
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
                    active ? 'text-violet-500' : 'text-slate-400 group-hover:text-slate-500'
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
          {/* 알림 */}
          <button
            onClick={() => setPanelOpen(true)}
            className={cn(
              'w-full group flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-100',
              !sidebarOpen && 'justify-center px-0'
            )}
            title={!sidebarOpen ? '알림' : undefined}
          >
            <div className="relative shrink-0">
              <Bell size={18} strokeWidth={1.5} className="text-slate-400 group-hover:text-slate-500 transition-colors" />
              {unreadAlertCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] font-bold rounded-full min-w-[14px] h-[14px] flex items-center justify-center px-0.5">
                  {unreadAlertCount > 99 ? '99+' : unreadAlertCount}
                </span>
              )}
              {runningCount > 0 && (
                <span className="absolute -bottom-1 -right-1 w-2 h-2 rounded-full bg-violet-500 animate-pulse" />
              )}
            </div>
            {sidebarOpen && <span className="font-medium">알림</span>}
          </button>
          {/* AI 챗 토글 */}
          {onChatToggle && (
            <button
              onClick={onChatToggle}
              className={cn(
                'group flex items-center gap-3 px-3 py-2 rounded-lg text-[14px] transition-all duration-100 relative w-full',
                chatOpen
                  ? 'bg-violet-50 text-violet-700'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50',
                !sidebarOpen && 'justify-center px-0'
              )}
              title={!sidebarOpen ? 'AI 챗' : undefined}
            >
              <MessageSquare
                size={18}
                strokeWidth={chatOpen ? 2 : 1.5}
                className={cn(
                  'shrink-0 transition-colors',
                  chatOpen ? 'text-violet-500' : 'text-slate-400 group-hover:text-slate-500'
                )}
              />
              {sidebarOpen && <span className={chatOpen ? 'font-semibold' : 'font-medium'}>AI 챗</span>}
            </button>
          )}
        </div>
      </aside>
    </>
  );
}
