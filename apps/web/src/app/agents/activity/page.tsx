'use client';

import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Activity } from 'lucide-react';
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

  const fetchAll = useCallback(async () => {
    try {
      const agents: Agent[] = await agentApi.list();
      const allRuns = await Promise.all(
        agents.map(async (a) => {
          const agentRuns = await agentApi.getRuns(a.id, 30).catch(() => [] as HeartbeatRun[]);
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

  // Group runs by date label
  const grouped: { label: string; runs: RunWithAgent[] }[] = [];
  for (const run of runs) {
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
      <div className="p-8 max-w-3xl">
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
    <div className="p-8 max-w-3xl">
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

      {/* Empty state */}
      {runs.length === 0 && (
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

              return (
                <div
                  key={run.id}
                  className={cn(
                    'flex items-start gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50 transition-colors',
                    !isLast && 'border-b border-gray-50',
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

                      {/* Error */}
                      {run.error && (
                        <span className="text-[10px] text-red-500 truncate max-w-xs" title={run.error}>
                          {run.error.slice(0, 60)}{run.error.length > 60 ? '…' : ''}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Relative time */}
                  <span className="text-xs text-gray-400 shrink-0 mt-0.5">
                    {relativeTime(run.createdAt)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
