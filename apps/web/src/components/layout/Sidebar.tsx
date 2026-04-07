'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect, useRef } from 'react';
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
  Bell,
  MinusCircle,
  TrendingDown,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { useStore } from '@/store/useStore';
import type { AlertItem } from '@kiditem/shared';

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
      { href: '/action-board', label: '액션 보드', icon: ClipboardList },
      { href: '/ad-ops', label: 'AI 광고 전략', icon: Zap },
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

function alertTypeIcon(type: string) {
  switch (type) {
    case 'minus_product': return <MinusCircle className="w-4 h-4 text-red-500" />;
    case 'profit_low': return <AlertTriangle className="w-4 h-4 text-orange-500" />;
    case 'ad_high': return <Megaphone className="w-4 h-4 text-amber-500" />;
    case 'stock_low': return <Truck className="w-4 h-4 text-blue-500" />;
    case 'grade_change': return <TrendingDown className="w-4 h-4 text-purple-500" />;
    default: return <Bell className="w-4 h-4 text-slate-400" />;
  }
}

function timeAgoShort(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return '방금';
  if (mins < 60) return `${mins}분 전`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}일 전`;
  return `${Math.floor(days / 30)}개월 전`;
}

export default function Sidebar() {
  const pathname = usePathname();
  const { sidebarOpen, toggleSidebar, setSidebarOpen } = useStore();
  const [alertOpen, setAlertOpen] = useState(false);
  const alertRef = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();

  const { data: alerts = [] } = useQuery({
    queryKey: ['alerts'],
    queryFn: () => apiClient.get<AlertItem[]>('/api/alerts?limit=10'),
  });
  const unreadCount = alerts.length;

  const markAsReadMutation = useMutation({
    mutationFn: (id: string) => apiClient.patch(`/api/alerts/${id}/read`, {}),
    onSuccess: (_, id) => { qc.setQueryData<AlertItem[]>(['alerts'], (old) => old?.filter(a => a.id !== id) ?? []); },
  });
  const markAllAsReadMutation = useMutation({
    mutationFn: () => apiClient.patch('/api/alerts/read-all', {}),
    onSuccess: () => { qc.setQueryData<AlertItem[]>(['alerts'], []); },
  });

  useEffect(() => {
    if (!alertOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (alertRef.current && !alertRef.current.contains(e.target as Node)) setAlertOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [alertOpen]);

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
          <div className="relative" ref={alertRef}>
            <button
              onClick={() => setAlertOpen((v) => !v)}
              className={cn(
                'group flex items-center gap-3 px-3 py-2 rounded-lg text-[14px] transition-all duration-100 relative w-full',
                'text-slate-500 hover:text-slate-700 hover:bg-slate-50',
                !sidebarOpen && 'justify-center px-0'
              )}
              title={!sidebarOpen ? '알림' : undefined}
            >
              <div className="relative shrink-0">
                <Bell size={18} strokeWidth={1.5} className="text-slate-400 group-hover:text-slate-500 transition-colors" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] font-bold rounded-full min-w-[14px] h-[14px] flex items-center justify-center px-0.5">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </div>
              {sidebarOpen && <span className="font-medium">알림</span>}
            </button>

            {alertOpen && (
              <div className={cn(
                'absolute bottom-full mb-2 w-80 bg-white rounded-xl border border-slate-200 shadow-lg z-50 overflow-hidden',
                sidebarOpen ? 'left-0' : 'left-full ml-2'
              )}>
                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm text-slate-900">알림</span>
                    {unreadCount > 0 && (
                      <span className="bg-red-100 text-red-700 text-xs font-medium px-1.5 py-0.5 rounded-full">{unreadCount}</span>
                    )}
                  </div>
                  {unreadCount > 0 && (
                    <button onClick={() => markAllAsReadMutation.mutate()} className="text-xs text-blue-600 hover:text-blue-800 font-medium">모두 읽음</button>
                  )}
                </div>
                <div className="max-h-[300px] overflow-y-auto">
                  {alerts.length === 0 ? (
                    <div className="px-4 py-8 text-center text-sm text-slate-400">새로운 알림이 없습니다</div>
                  ) : alerts.map((alert) => (
                    <button
                      key={alert.id}
                      onClick={() => markAsReadMutation.mutate(alert.id)}
                      className="w-full flex items-start gap-3 px-4 py-3 hover:bg-slate-50 transition-colors text-left border-b border-slate-50 last:border-b-0"
                    >
                      <div className="mt-0.5 shrink-0">{alertTypeIcon(alert.type)}</div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-slate-900 font-medium truncate">{alert.title}</p>
                        {alert.message && <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{alert.message}</p>}
                        <p className="text-xs text-slate-400 mt-1">{timeAgoShort(alert.createdAt)}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}
