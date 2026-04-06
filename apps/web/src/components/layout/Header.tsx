'use client';

import { Bell, MinusCircle, AlertTriangle, Megaphone, Truck, TrendingDown, Menu } from 'lucide-react';
import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { useStore } from '@/store/useStore';
import type { AlertItem } from '@kiditem/shared';

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

export default function Header() {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const { toggleSidebar } = useStore();
  const qc = useQueryClient();

  const { data: alerts = [] } = useQuery({
    queryKey: ['alerts'],
    queryFn: () => apiClient.get<AlertItem[]>('/api/alerts?limit=10'),
  });
  const unreadCount = alerts.length;

  const markAsReadMutation = useMutation({
    mutationFn: (id: string) => apiClient.patch(`/api/alerts/${id}/read`, {}),
    onSuccess: (_, id) => {
      qc.setQueryData<AlertItem[]>(['alerts'], (old) => old?.filter(a => a.id !== id) ?? []);
    },
  });

  const markAllAsReadMutation = useMutation({
    mutationFn: () => apiClient.patch('/api/alerts/read-all', {}),
    onSuccess: () => {
      qc.setQueryData<AlertItem[]>(['alerts'], []);
    },
  });

  useEffect(() => {
    if (!dropdownOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [dropdownOpen]);

  const markAsRead = (id: string) => markAsReadMutation.mutate(id);
  const markAllAsRead = () => markAllAsReadMutation.mutate();

  const badgeLabel = unreadCount > 99 ? '99+' : String(unreadCount);

  return (
    <header className="h-14 border-b border-slate-200 bg-white flex items-center justify-between px-4 md:px-6 sticky top-0 z-30">
      <button
        onClick={toggleSidebar}
        className="p-2 rounded-lg hover:bg-slate-100 transition-colors text-slate-500 md:hidden"
      >
        <Menu className="w-5 h-5" />
      </button>
      <div className="flex-1" />
      <div className="flex items-center">
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setDropdownOpen((v) => !v)}
            className="relative p-2 rounded-lg hover:bg-slate-100 transition-colors text-slate-400"
          >
            <Bell className="w-4 h-4" />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-xs font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                {badgeLabel}
              </span>
            )}
          </button>

          {dropdownOpen && (
            <div className="absolute right-0 top-full mt-2 w-96 bg-white rounded-xl border border-slate-200 shadow-lg z-50 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm text-slate-900">알림</span>
                  {unreadCount > 0 && (
                    <span className="bg-red-100 text-red-700 text-xs font-medium px-1.5 py-0.5 rounded-full">{unreadCount}</span>
                  )}
                </div>
                {unreadCount > 0 && (
                  <button onClick={markAllAsRead} className="text-xs text-blue-600 hover:text-blue-800 font-medium">
                    모두 읽음
                  </button>
                )}
              </div>

              <div className="max-h-[400px] overflow-y-auto">
                {alerts.length === 0 ? (
                  <div className="px-4 py-8 text-center text-sm text-slate-400">새로운 알림이 없습니다</div>
                ) : (
                  alerts.map((alert) => (
                    <button
                      key={alert.id}
                      onClick={() => markAsRead(alert.id)}
                      className="w-full flex items-start gap-3 px-4 py-3 hover:bg-slate-50 transition-colors text-left border-b border-slate-50 last:border-b-0"
                    >
                      <div className="mt-0.5 shrink-0">{alertTypeIcon(alert.type)}</div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-slate-900 font-medium truncate">{alert.title}</p>
                        {alert.message && (
                          <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{alert.message}</p>
                        )}
                        <p className="text-xs text-slate-400 mt-1">{timeAgoShort(alert.createdAt)}</p>
                      </div>
                      <div className="mt-1.5 shrink-0">
                        <div className="w-2 h-2 rounded-full bg-blue-500" />
                      </div>
                    </button>
                  ))
                )}
              </div>

              {alerts.length > 0 && (
                <div className="border-t border-slate-100 px-4 py-2">
                  <button
                    onClick={() => { setDropdownOpen(false); router.push('/alerts'); }}
                    className="w-full text-center text-xs text-blue-600 hover:text-blue-800 font-medium py-1"
                  >
                    더보기
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
