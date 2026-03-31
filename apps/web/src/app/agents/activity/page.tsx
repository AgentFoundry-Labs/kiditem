'use client';

import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Activity, Filter, ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { agentApi } from '@/lib/agent-api';
import { relativeTime } from '@/lib/agent-utils';
import { statusBadge, statusBadgeDefault } from '@/lib/status-colors';
import { SOURCE_LABELS } from '@/lib/agent-types';
import type { Agent, HeartbeatRun } from '@/lib/agent-types';

interface RunWithAgent extends HeartbeatRun {
  agentName: string;
  agentIcon: string | null;
}

const SOURCE_COLORS: Record<string, string> = {
  timer: 'bg-blue-100 text-blue-700',
  assignment: 'bg-violet-100 text-violet-700',
  on_demand: 'bg-cyan-100 text-cyan-700',
  automation: 'bg-amber-100 text-amber-700',
};

const AGENT_COLORS = [
  'bg-blue-100 text-blue-700',
  'bg-violet-100 text-violet-700',
  'bg-green-100 text-green-700',
  'bg-amber-100 text-amber-700',
  'bg-cyan-100 text-cyan-700',
  'bg-rose-100 text-rose-700',
  'bg-indigo-100 text-indigo-700',
  'bg-orange-100 text-orange-700',
];

function agentColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AGENT_COLORS[Math.abs(hash) % AGENT_COLORS.length];
}

function agentInitials(name: string): string {
  const words = name.trim().split(/\s+/);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function statusLabel(run: HeartbeatRun): string {
  const labels: Record<string, string> = {
    succeeded: '완료',
    failed: '실패',
    running: '실행 중',
    queued: '대기 중',
    timed_out: '시간 초과',
    cancelled: '취소됨',
  };
  return labels[run.status] ?? run.status;
}

function runDescription(run: RunWithAgent): string {
  const src = SOURCE_LABELS[run.invocationSource] ?? run.invocationSource;
  const stat = statusLabel(run);
  return `하트비트 실행 ${stat} (${src})`;
}

function groupLabel(dateStr: string): string {
  const today = new Date();
  const d = new Date(dateStr);
  const todayMid = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const dMid = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round((todayMid.getTime() - dMid.getTime()) / 86400_000);
  if (diffDays === 0) return '오늘';
  if (diffDays === 1) return '어제';
  if (diffDays < 7) return '이번 주';
  if (diffDays < 30) return '이번 달';
  return d.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long' });
}

export default function ActivityPage() {
  const [runs, setRuns] = useState<RunWithAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());
  const [agentFilter, setAgentFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [timeRange, setTimeRange] = useState<string>('all');
  const [page, setPage] = useState(0);
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      const agents: Agent[] = await agentApi.list();
      const allRuns = await Promise.all(
        agents.map(async (a) => {
          const agentRuns = await agentApi.getRuns(a.id, 50).catch(() => [] as HeartbeatRun[]);
          return agentRuns.map((r) => ({
            ...r,
            agentName: a.name,
            agentIcon: a.icon ?? null,
          }));
        }),
      );
      const merged = allRuns
        .flat()
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setRuns(merged);
      setLastRefreshed(new Date());
    } catch (err) {
      console.error('Failed to fetch activity:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 30_000);
    return () => clearInterval(interval);
  }, [fetchAll]);

  // Unique agent names for dropdown
  const agentNames = Array.from(new Set(runs.map((r) => r.agentName))).sort();

  // Filter runs
  const filteredRuns = runs.filter((run) => {
    if (agentFilter !== 'all' && run.agentName !== agentFilter) return false;
    if (statusFilter !== 'all' && run.status !== statusFilter) return false;
    if (timeRange !== 'all') {
      const now = Date.now();
      const todayStart = new Date().setHours(0, 0, 0, 0);
      const cutoff = timeRange === '오늘' ? todayStart : timeRange === '7일' ? now - 7 * 86400_000 : now - 30 * 86400_000;
      if (new Date(run.createdAt).getTime() < cutoff) return false;
    }
    return true;
  });

  // Pagination
  const PAGE_SIZE = 20;
  const totalPages = Math.ceil(filteredRuns.length / PAGE_SIZE);
  const pagedRuns = filteredRuns.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  // Group runs by date label
  const grouped: { label: string; runs: RunWithAgent[] }[] = [];
  for (const run of pagedRuns) {
    const label = groupLabel(run.createdAt);
    const existing = grouped.find((g) => g.label === label);
    if (existing) {
      existing.runs.push(run);
    } else {
      grouped.push({ label, runs: [run] });
    }
  }

  if (loading) {
    return (
      <div className="p-4 sm:p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-6 w-24 bg-gray-100 rounded" />
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-gray-100 shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3.5 bg-gray-100 rounded w-2/3" />
                <div className="h-3 bg-gray-100 rounded w-1/3" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <p className="text-xs text-gray-400">
          마지막 갱신: {lastRefreshed.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </p>
        <button
          onClick={fetchAll}
          className="p-1.5 text-gray-400 hover:text-gray-600 border border-gray-200 rounded-lg transition-colors"
          title="새로고침"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 mb-4 flex-wrap">
        <Filter className="w-4 h-4 text-gray-600 shrink-0" />
        <select
          value={agentFilter}
          onChange={(e) => { setAgentFilter(e.target.value); setPage(0); }}
          className="px-3 py-1.5 rounded-lg text-xs border border-gray-200 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-gray-300"
        >
          <option value="all">전체 에이전트</option>
          {agentNames.map((name) => (
            <option key={name} value={name}>{name}</option>
          ))}
        </select>
        <div className="h-4 w-px bg-gray-200" />
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
                  ? 'bg-white text-gray-900 border-gray-200'
                  : 'text-gray-600 hover:text-gray-500 border-transparent'
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
        <div className="h-4 w-px bg-gray-200" />
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
                  ? 'bg-white text-gray-900 border-gray-200'
                  : 'text-gray-600 hover:text-gray-500 border-transparent'
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <p className="text-xs text-gray-400 mb-4">{filteredRuns.length}건</p>

      {/* Empty state */}
      {filteredRuns.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400 border border-gray-200 rounded-lg">
          <Activity className="w-8 h-8 mb-2" />
          <p className="text-sm">아직 활동이 없습니다.</p>
        </div>
      )}

      {/* Feed */}
      {grouped.map((group) => (
        <div key={group.label} className="mb-6">
          {/* Date group header */}
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs font-medium text-gray-500">{group.label}</span>
            <div className="flex-1 h-px bg-gray-100" />
          </div>

          {/* Runs */}
          <div className="space-y-1">
            {group.runs.map((run, idx) => {
              const colorClass = agentColor(run.agentName);
              const initials = agentInitials(run.agentName);
              const srcColor = SOURCE_COLORS[run.invocationSource] ?? 'bg-gray-100 text-gray-600';
              const badgeClass = statusBadge[run.status] ?? statusBadgeDefault;
              const isLast = idx === group.runs.length - 1;
              const hasError = (run.status === 'failed' || run.status === 'timed_out') && (run.error || run.stderrExcerpt);
              const isExpanded = expandedRunId === run.id;

              return (
                <div key={run.id}>
                  <div
                    onClick={() => {
                      if (hasError) setExpandedRunId(isExpanded ? null : run.id);
                    }}
                    className={cn(
                      'flex items-start gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50 transition-colors cursor-default',
                      !isLast && !isExpanded && 'border-b border-gray-50',
                      hasError && 'cursor-pointer',
                    )}
                  >
                    {/* Agent avatar */}
                    <div
                      className={cn(
                        'w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-xs font-semibold mt-0.5',
                        colorClass,
                      )}
                    >
                      {run.agentIcon ?? initials}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start gap-2 flex-wrap">
                        <span className="text-sm font-medium text-gray-900">{run.agentName}</span>
                        <span className="text-sm text-gray-500 truncate flex-1 min-w-0">
                          {runDescription(run)}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        {/* Status badge */}
                        <span
                          className={cn(
                            'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium',
                            badgeClass,
                          )}
                        >
                          {statusLabel(run)}
                        </span>

                        {/* Source badge */}
                        <span
                          className={cn(
                            'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium',
                            srcColor,
                          )}
                        >
                          {SOURCE_LABELS[run.invocationSource] ?? run.invocationSource}
                        </span>

                        {/* Error preview */}
                        {run.error && !isExpanded && (
                          <span className="text-[10px] text-red-500 truncate max-w-xs" title={run.error}>
                            {run.error.slice(0, 60)}{run.error.length > 60 ? '...' : ''}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Expand indicator + time */}
                    <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
                      {hasError && (
                        <ChevronDown className={cn('w-3 h-3 text-gray-400 transition-transform', isExpanded && 'rotate-180')} />
                      )}
                      <span className="text-xs text-gray-400">
                        {relativeTime(run.createdAt)}
                      </span>
                    </div>
                  </div>

                  {/* Error expansion panel */}
                  {isExpanded && hasError && (
                    <div className="ml-11 mt-1 mb-2 p-3 bg-red-50 border border-red-100 rounded-lg">
                      {run.error && (
                        <div className="mb-2">
                          <span className="text-[10px] font-medium text-red-600 block mb-1">에러</span>
                          <pre className="text-[11px] text-red-700 whitespace-pre-wrap break-all font-mono">
                            {run.error}
                          </pre>
                        </div>
                      )}
                      {run.stderrExcerpt && (
                        <div>
                          <span className="text-[10px] font-medium text-red-600 block mb-1">stderr</span>
                          <pre className="text-[11px] text-red-700 whitespace-pre-wrap break-all font-mono max-h-40 overflow-y-auto">
                            {run.stderrExcerpt}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-6">
          <span className="text-xs text-gray-400">
            {filteredRuns.length}건 중 {page * PAGE_SIZE + 1}-{Math.min((page + 1) * PAGE_SIZE, filteredRuns.length)}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="p-1.5 rounded-lg hover:bg-gray-50 disabled:opacity-30 text-gray-500"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
              const start = Math.max(0, Math.min(page - 2, totalPages - 5));
              const pageNum = start + i;
              if (pageNum >= totalPages) return null;
              return (
                <button
                  key={pageNum}
                  onClick={() => setPage(pageNum)}
                  className={cn(
                    'w-8 h-8 rounded-lg text-xs transition-colors',
                    page === pageNum
                      ? 'bg-gray-900 text-white'
                      : 'text-gray-500 hover:bg-gray-50'
                  )}
                >
                  {pageNum + 1}
                </button>
              );
            })}
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="p-1.5 rounded-lg hover:bg-gray-50 disabled:opacity-30 text-gray-500"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
