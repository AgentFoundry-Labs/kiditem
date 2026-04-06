'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { RefreshCw, Activity, List, BarChart3 } from 'lucide-react';
import { cn } from '@/lib/utils';
import PageSkeleton from '@/components/ui/PageSkeleton';
import { agentApi } from '../lib/agent-api';
import type { Agent, HeartbeatRun } from '../lib/agent-types';
import { queryKeys } from '@/lib/query-keys';
import { groupLabel } from './lib/activity-utils';
import type { RunWithAgent } from './lib/activity-utils';
import { TimelineView } from './components/TimelineView';
import { ActivityFeed } from './components/ActivityFeed';
import { ActivityFilters } from './components/ActivityFilters';
import { ActivityPagination } from './components/ActivityPagination';

const PAGE_SIZE = 20;

async function fetchAllActivity(): Promise<RunWithAgent[]> {
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
  return allRuns
    .flat()
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export default function ActivityPage() {
  const queryClient = useQueryClient();
  const [agentFilter, setAgentFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [timeRange, setTimeRange] = useState<string>('all');
  const [page, setPage] = useState(0);
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'feed' | 'timeline'>('feed');

  const { data: runs = [], isLoading: loading, error: queryError, dataUpdatedAt } = useQuery({
    queryKey: [...queryKeys.agents.all, 'activity'],
    queryFn: fetchAllActivity,
    refetchInterval: 30_000,
  });

  const error = queryError ? '활동 이력을 불러오는데 실패했습니다.' : null;
  const lastRefreshed = new Date(dataUpdatedAt || Date.now());

  const agentNames = Array.from(new Set(runs.map((r) => r.agentName))).sort();

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

  const totalPages = Math.ceil(filteredRuns.length / PAGE_SIZE);
  const pagedRuns = filteredRuns.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

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
        <PageSkeleton variant="table" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-8">
      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <p className="text-xs text-slate-400">
          마지막 갱신: {lastRefreshed.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </p>
        <div className="flex items-center gap-1">
          <div className="flex items-center border border-slate-200 rounded-lg overflow-hidden mr-2">
            <button
              onClick={() => setViewMode('feed')}
              className={cn(
                'p-1.5 transition-colors',
                viewMode === 'feed' ? 'bg-slate-100 text-slate-900' : 'text-slate-400 hover:bg-slate-50 hover:text-slate-700',
              )}
              title="피드"
            >
              <List className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setViewMode('timeline')}
              className={cn(
                'p-1.5 transition-colors',
                viewMode === 'timeline' ? 'bg-slate-100 text-slate-900' : 'text-slate-400 hover:bg-slate-50 hover:text-slate-700',
              )}
              title="타임라인"
            >
              <BarChart3 className="w-3.5 h-3.5" />
            </button>
          </div>
          <button
            onClick={() => queryClient.invalidateQueries({ queryKey: [...queryKeys.agents.all, 'activity'] })}
            className="p-1.5 text-slate-400 hover:text-slate-600 border border-slate-200 rounded-lg transition-colors"
            title="새로고침"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Filters */}
      <ActivityFilters
        agentFilter={agentFilter}
        setAgentFilter={setAgentFilter}
        statusFilter={statusFilter}
        setStatusFilter={setStatusFilter}
        timeRange={timeRange}
        setTimeRange={setTimeRange}
        agentNames={agentNames}
        setPage={setPage}
        filteredCount={filteredRuns.length}
      />

      {/* Empty state */}
      {filteredRuns.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-slate-400 border border-slate-200 rounded-lg">
          <Activity className="w-8 h-8 mb-2" />
          <p className="text-sm">아직 활동이 없습니다.</p>
        </div>
      )}

      {/* Timeline view */}
      {viewMode === 'timeline' && filteredRuns.length > 0 && (
        <TimelineView runs={filteredRuns} timeRange={timeRange} />
      )}

      {/* Feed */}
      {viewMode === 'feed' && (
        <ActivityFeed
          grouped={grouped}
          expandedRunId={expandedRunId}
          setExpandedRunId={setExpandedRunId}
        />
      )}

      {viewMode === 'feed' && (
        <ActivityPagination
          totalPages={totalPages}
          page={page}
          setPage={setPage}
          filteredCount={filteredRuns.length}
          pageSize={PAGE_SIZE}
        />
      )}
    </div>
  );
}
