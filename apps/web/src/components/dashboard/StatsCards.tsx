'use client';

import { GitBranch, Play, AlertTriangle, Clock, TrendingUp, Zap } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { formatTime, formatNumber } from '@/lib/utils';

export default function StatsCards() {
  const { getDashboardStats } = useStore();
  const stats = getDashboardStats();

  const cards = [
    {
      label: '활성 워크플로우',
      value: `${stats.activeWorkflows}/${stats.totalWorkflows}`,
      icon: GitBranch,
      color: 'text-blue-600',
      bgColor: 'from-blue-500/10 to-blue-600/5',
      borderColor: 'border-blue-500/20',
    },
    {
      label: '오늘 실행 횟수',
      value: formatNumber(stats.todayExecutions),
      icon: Play,
      color: 'text-green-600',
      bgColor: 'from-emerald-500/10 to-emerald-600/5',
      borderColor: 'border-emerald-500/20',
    },
    {
      label: '오늘 오류',
      value: stats.todayErrors.toString(),
      icon: AlertTriangle,
      color: stats.todayErrors > 0 ? 'text-red-400' : 'text-gray-500',
      bgColor: stats.todayErrors > 0 ? 'from-red-500/10 to-red-600/5' : 'from-gray-500/10 to-gray-600/5',
      borderColor: stats.todayErrors > 0 ? 'border-red-500/20' : 'border-gray-500/20',
    },
    {
      label: '오늘 절감 시간',
      value: formatTime(stats.totalSavedMinutes),
      icon: Clock,
      color: 'text-blue-400',
      bgColor: 'from-blue-500/10 to-blue-600/5',
      borderColor: 'border-blue-500/20',
      sub: `월 약 ${formatTime(stats.totalSavedMinutes * 22)}`,
    },
  ];

  return (
    <div className="grid grid-cols-4 gap-4">
      {cards.map((card) => (
        <div
          key={card.label}
          className={`glass-card bg-gradient-to-br ${card.bgColor} ${card.borderColor} p-5`}
        >
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs text-gray-500 mb-1">{card.label}</p>
              <p className={`stat-value ${card.color}`}>{card.value}</p>
              {card.sub && (
                <p className="text-[10px] text-gray-600 mt-1">{card.sub}</p>
              )}
            </div>
            <div className={`p-2 rounded-lg bg-gray-50 ${card.color}`}>
              <card.icon className="w-5 h-5" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
