'use client';

import { Bell, Search, Clock, MinusCircle, AlertTriangle, Megaphone, Truck, TrendingDown } from 'lucide-react';
import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { API_BASE } from '@/lib/api';

interface AlertItem {
  id: string;
  type: string;
  title: string;
  message: string | null;
  severity: string;
  isRead: boolean;
  createdAt: string;
}

function alertTypeIcon(type: string) {
  switch (type) {
    case 'minus_product': return <MinusCircle className="w-4 h-4 text-red-500" />;
    case 'profit_low': return <AlertTriangle className="w-4 h-4 text-orange-500" />;
    case 'ad_high': return <Megaphone className="w-4 h-4 text-amber-500" />;
    case 'stock_low': return <Truck className="w-4 h-4 text-blue-500" />;
    case 'grade_change': return <TrendingDown className="w-4 h-4 text-purple-500" />;
    default: return <Bell className="w-4 h-4 text-gray-400" />;
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
  const [now, setNow] = useState('');
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    const update = () => {
      setNow(new Date().toLocaleString('ko-KR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }));
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, []);

  const fetchAlerts = useCallback(() => {
    fetch(`${API_BASE}/api/alerts?limit=10`)
      .then((r) => r.json())
      .then((data: AlertItem[]) => {
        setAlerts(data);
        setUnreadCount(data.length);
      })
      .catch(() => {
        setAlerts([]);
        setUnreadCount(0);
      });
  }, []);

  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);

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

  const markAsRead = async (id: string) => {
    await fetch(`${API_BASE}/api/alerts/${id}/read`, { method: 'PATCH' });
    setAlerts((prev) => prev.filter((a) => a.id !== id));
    setUnreadCount((prev) => Math.max(0, prev - 1));
  };

  const markAllAsRead = async () => {
    await fetch(`${API_BASE}/api/alerts/read-all`, { method: 'PATCH' });
    setAlerts([]);
    setUnreadCount(0);
  };

  const badgeLabel = unreadCount > 99 ? '99+' : String(unreadCount);

  return (
    <header className="h-16 border-b border-gray-200 bg-white flex items-center justify-between px-6 sticky top-0 z-30">
      <div className="flex items-center gap-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
           <input
             type="text"
             placeholder="검색..."
             suppressHydrationWarning
             className="w-64 pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-700 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300 transition-colors"
           />
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          <Clock className="w-3.5 h-3.5" />
          <span>{now}</span>
        </div>
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setDropdownOpen((v) => !v)}
            className="relative p-2 rounded-lg hover:bg-gray-100 transition-colors text-gray-400"
          >
            <Bell className="w-4 h-4" />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-xs font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                {badgeLabel}
              </span>
            )}
          </button>

          {dropdownOpen && (
            <div className="absolute right-0 top-full mt-2 w-96 bg-white rounded-xl border border-gray-200 shadow-lg z-50 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm text-gray-900">알림</span>
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
                  <div className="px-4 py-8 text-center text-sm text-gray-400">새로운 알림이 없습니다</div>
                ) : (
                  alerts.map((alert) => (
                    <button
                      key={alert.id}
                      onClick={() => markAsRead(alert.id)}
                      className="w-full flex items-start gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left border-b border-gray-50 last:border-b-0"
                    >
                      <div className="mt-0.5 shrink-0">{alertTypeIcon(alert.type)}</div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-900 font-medium truncate">{alert.title}</p>
                        {alert.message && (
                          <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{alert.message}</p>
                        )}
                        <p className="text-xs text-gray-400 mt-1">{timeAgoShort(alert.createdAt)}</p>
                      </div>
                      <div className="mt-1.5 shrink-0">
                        <div className="w-2 h-2 rounded-full bg-blue-500" />
                      </div>
                    </button>
                  ))
                )}
              </div>

              {alerts.length > 0 && (
                <div className="border-t border-gray-100 px-4 py-2">
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
