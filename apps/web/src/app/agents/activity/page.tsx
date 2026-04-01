'use client';

import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Activity, ChevronLeft, ChevronRight, List, BarChart3 } from 'lucide-react';
import { cn } from '@/lib/utils';
import PageSkeleton from '@/components/ui/PageSkeleton';
import { agentApi } from '@/lib/agent-api';
import { isApiError } from '@/lib/api-error';
import type { Agent, HeartbeatRun } from '@/lib/agent-types';
import { groupLabel } from './components/activity-utils';
import type { RunWithAgent } from './components/activity-utils';
import { TimelineView } from './components/TimelineView';
import { ActivityFeed } from './components/ActivityFeed';
import { ActivityFilters } from './components/ActivityFilters';

export default function ActivityPage() {
  const [runs, setRuns] = useState<RunWithAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());
  const [agentFilter, setAgentFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [timeRange, setTimeRange] = useState<string>('all');
  const [page, setPage] = useState(0);
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'feed' | 'timeline'>('feed');

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
      setError(null);
    } catch (err) {
      setError(isApiError(err) ? err.detail : '활동 이력을 불러오는데 실패했습니다.');
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
        <PageSkeleton variant="table" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-8">
      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-600">&times;</button>
        </div>
      )}
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <p className="text-xs text-gray-400">
          마지막 갱신: {lastRefreshed.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </p>
        <div className="flex items-center gap-1">
          <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden mr-2">
            <button
              onClick={() => setViewMode('feed')}
              className={cn(
                'p-1.5 transition-colors',
                viewMode === 'feed' ? 'bg-gray-100 text-gray-900' : 'text-gray-400 hover:bg-gray-50 hover:text-gray-700',
              )}
              title="피드"
            >
              <List className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setViewMode('timeline')}
              className={cn(
                'p-1.5 transition-colors',
                viewMode === 'timeline' ? 'bg-gray-100 text-gray-900' : 'text-gray-400 hover:bg-gray-50 hover:text-gray-700',
              )}
              title="타임라인"
            >
              <BarChart3 className="w-3.5 h-3.5" />
            </button>
          </div>
          <button
            onClick={fetchAll}
            className="p-1.5 text-gray-400 hover:text-gray-600 border border-gray-200 rounded-lg transition-colors"
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
        <div className="flex flex-col items-center justify-center py-16 text-gray-400 border border-gray-200 rounded-lg">
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

      {/* Pagination (feed only) */}
      {viewMode === 'feed' && totalPages > 1 && (
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
