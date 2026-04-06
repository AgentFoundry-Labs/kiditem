'use client';

import { Filter } from 'lucide-react';
import { cn } from '@/lib/utils';

export function ActivityFilters({
  agentFilter,
  setAgentFilter,
  statusFilter,
  setStatusFilter,
  timeRange,
  setTimeRange,
  agentNames,
  setPage,
  filteredCount,
}: {
  agentFilter: string;
  setAgentFilter: (v: string) => void;
  statusFilter: string;
  setStatusFilter: (v: string) => void;
  timeRange: string;
  setTimeRange: (v: string) => void;
  agentNames: string[];
  setPage: (v: number) => void;
  filteredCount: number;
}) {
  return (
    <>
      <div className="flex items-center gap-4 mb-4 flex-wrap">
        <Filter className="w-4 h-4 text-slate-600 shrink-0" />
        <select
          value={agentFilter}
          onChange={(e) => { setAgentFilter(e.target.value); setPage(0); }}
          className="px-3 py-1.5 rounded-lg text-xs border border-slate-200 bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-slate-300"
        >
          <option value="all">전체 에이전트</option>
          {agentNames.map((name) => (
            <option key={name} value={name}>{name}</option>
          ))}
        </select>
        <div className="h-4 w-px bg-slate-200" />
        <div className="flex gap-1">
          {([
            { key: 'all', label: '전체' },
            { key: 'succeeded', label: '완료' },
            { key: 'failed', label: '실패' },
            { key: 'timed_out', label: '시간초과' },
            { key: 'running', label: '실행중' },
          ] as const).map((s) => (
            <button
              key={s.key}
              onClick={() => { setStatusFilter(s.key); setPage(0); }}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs transition-colors border',
                statusFilter === s.key
                  ? 'bg-white text-slate-900 border-slate-200'
                  : 'text-slate-600 hover:text-slate-500 border-transparent'
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
        <div className="h-4 w-px bg-slate-200" />
        <div className="flex gap-1">
          {([
            { key: 'all', label: '전체' },
            { key: '오늘', label: '오늘' },
            { key: '7일', label: '7일' },
            { key: '30일', label: '30일' },
          ] as const).map((t) => (
            <button
              key={t.key}
              onClick={() => { setTimeRange(t.key); setPage(0); }}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs transition-colors border',
                timeRange === t.key
                  ? 'bg-white text-slate-900 border-slate-200'
                  : 'text-slate-600 hover:text-slate-500 border-transparent'
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <p className="text-xs text-slate-400 mb-4">{filteredCount}건</p>
    </>
  );
}
