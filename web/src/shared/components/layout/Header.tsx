'use client';

import { Bell, Search, Clock } from 'lucide-react';
import { useStore } from '@/shared/store/useStore';
import { formatTime } from '@/lib/utils';
import { useEffect, useState } from 'react';

export default function Header() {
  const { getDashboardStats } = useStore();
  const stats = getDashboardStats();
  const [now, setNow] = useState('');

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

  return (
    <header className="h-14 border-b border-[#1e2028] bg-[#0d0e13]/80 backdrop-blur-xl flex items-center justify-between px-6">
      {/* Left - Search */}
      <div className="flex items-center gap-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600" />
          <input
            type="text"
            placeholder="워크플로우 검색..."
            className="w-72 pl-10 pr-4 py-2 bg-[#111318] border border-[#1e2028] rounded-lg text-sm text-gray-300 placeholder:text-gray-600 focus:outline-none focus:border-blue-500/30 transition-colors"
          />
        </div>
      </div>

      {/* Center - Quick Stats */}
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 pulse-dot" />
          <span>{stats.activeWorkflows} active</span>
        </div>
        <div className="text-xs text-gray-500">
          <span className="text-emerald-400 font-medium">{stats.todayExecutions}</span> 실행
        </div>
        {stats.todayErrors > 0 && (
          <div className="text-xs text-gray-500">
            <span className="text-red-400 font-medium">{stats.todayErrors}</span> 오류
          </div>
        )}
        <div className="text-xs text-gray-500">
          <span className="text-blue-400 font-medium">{formatTime(stats.totalSavedMinutes)}</span> 절감
        </div>
      </div>

      {/* Right */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5 text-xs text-gray-600">
          <Clock className="w-3.5 h-3.5" />
          <span>{now}</span>
        </div>
        <button className="relative p-2 rounded-lg hover:bg-[#1a1d26] transition-colors text-gray-500">
          <Bell className="w-4 h-4" />
          {stats.todayErrors > 0 && (
            <div className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-red-500" />
          )}
        </button>
      </div>
    </header>
  );
}
