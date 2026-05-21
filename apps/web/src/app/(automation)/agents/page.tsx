'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Clock, RefreshCw, XCircle } from 'lucide-react';
import PageSkeleton from '@/components/ui/PageSkeleton';
import { isApiError } from '@/lib/api-error';
import { cn, formatDateTime } from '@/lib/utils';
import { agentOsApi } from './lib/agent-os-api';
import type {
  AgentInstanceSummary,
  AgentRunRequestStatus,
  AgentRunStatus,
  AgentRunSummary,
} from '@kiditem/shared/agent-os';

type View = 'runs' | 'requests';

const RUN_STATUSES: AgentRunStatus[] = ['running', 'succeeded', 'failed', 'cancelled'];
const REQUEST_STATUSES: AgentRunRequestStatus[] = [
  'pending',
  'claimed',
  'coalesced',
  'skipped',
  'requires_approval',
  'succeeded',
  'failed',
  'cancelled',
];

function runStatusClass(status: string): string {
  switch (status) {
    case 'running':
    case 'claimed':
      return 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300';
    case 'succeeded':
      return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300';
    case 'failed':
      return 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300';
    case 'cancelled':
    case 'skipped':
    case 'coalesced':
      return 'bg-slate-200 text-slate-600 dark:bg-slate-700/40 dark:text-slate-300';
    case 'requires_approval':
      return 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300';
    case 'pending':
      return 'bg-slate-100 text-slate-600 dark:bg-slate-800/40 dark:text-slate-300';
    default:
      return 'bg-slate-100 text-slate-600 dark:bg-slate-800/40 dark:text-slate-300';
  }
}

function StatusIcon({ status }: { status: string }) {
  if (status === 'running' || status === 'claimed' || status === 'pending') {
    return <Clock size={12} />;
  }
  if (status === 'succeeded') return <CheckCircle2 size={12} />;
  if (status === 'failed') return <XCircle size={12} />;
  if (status === 'requires_approval') return <AlertTriangle size={12} />;
  return null;
}

function isRunningOrPending(items: { status: string }[]): boolean {
  return items.some((item) => item.status === 'running' || item.status === 'pending' || item.status === 'claimed');
}

export default function AgentOsOpsPage() {
  const [view, setView] = useState<View>('runs');
  const [instanceId, setInstanceId] = useState<string>('');
  const [runStatusFilter, setRunStatusFilter] = useState<AgentRunStatus | ''>('');
  const [requestStatusFilter, setRequestStatusFilter] = useState<AgentRunRequestStatus | ''>('');

  const instancesQuery = useQuery({
    queryKey: ['agent-os', 'instances'],
    queryFn: () => agentOsApi.listInstances(),
    staleTime: 60_000,
  });

  const runsQuery = useQuery({
    queryKey: ['agent-os', 'runs', { instanceId, status: runStatusFilter }],
    queryFn: () =>
      agentOsApi.listRuns({
        agentInstanceId: instanceId || undefined,
        status: runStatusFilter ? [runStatusFilter] : undefined,
        limit: 100,
      }),
    placeholderData: previousData => previousData,
    refetchInterval: (q) => (isRunningOrPending(q.state.data?.items ?? []) ? 15_000 : 60_000),
    enabled: view === 'runs',
  });

  const requestsQuery = useQuery({
    queryKey: ['agent-os', 'requests', { instanceId, status: requestStatusFilter }],
    queryFn: () =>
      agentOsApi.listRequests({
        agentInstanceId: instanceId || undefined,
        status: requestStatusFilter ? [requestStatusFilter] : undefined,
        limit: 100,
      }),
    placeholderData: previousData => previousData,
    refetchInterval: (q) => (isRunningOrPending(q.state.data?.items ?? []) ? 15_000 : 60_000),
    enabled: view === 'requests',
  });

  const instancesById = useMemo(() => {
    const map = new Map<string, AgentInstanceSummary>();
    for (const inst of instancesQuery.data ?? []) map.set(inst.id, inst);
    return map;
  }, [instancesQuery.data]);

  const activeQuery = view === 'runs' ? runsQuery : requestsQuery;
  const isRefreshing = activeQuery.isPlaceholderData;

  if (instancesQuery.isPending) return <PageSkeleton variant="table" />;

  if (instancesQuery.isError) {
    const err = instancesQuery.error;
    return (
      <div className="p-6">
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          에이전트 목록을 불러오지 못했습니다.{' '}
          {isApiError(err) ? err.detail : err instanceof Error ? err.message : ''}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-6">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[var(--text-primary)]">Agent OS — 운영</h1>
          <p className="text-xs text-[var(--text-tertiary)]">
            인스턴스 {instancesQuery.data?.length ?? 0}개 ·{' '}
            {view === 'runs'
              ? `실행 ${runsQuery.data?.items.length ?? 0}건`
              : `요청 ${requestsQuery.data?.items.length ?? 0}건`}
          </p>
        </div>
        <button
          type="button"
          onClick={() => activeQuery.refetch()}
          disabled={activeQuery.isFetching}
          className="btn-secondary inline-flex items-center gap-1.5 text-xs"
        >
          <RefreshCw size={13} className={activeQuery.isFetching ? 'animate-spin' : ''} /> 새로고침
        </button>
      </header>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface)] p-3">
        <div className="flex gap-1 rounded-lg bg-[var(--surface-sunken)] p-0.5">
          {(['runs', 'requests'] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={cn(
                'px-3 py-1 text-xs font-semibold rounded-md transition',
                view === v
                  ? 'bg-[var(--primary)] text-white'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--surface-raised)]',
              )}
            >
              {v === 'runs' ? '실행 (Runs)' : '요청 (Requests)'}
            </button>
          ))}
        </div>

        <select
          value={instanceId}
          onChange={(e) => setInstanceId(e.target.value)}
          className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-xs text-[var(--text-primary)]"
        >
          <option value="">전체 인스턴스</option>
          {(instancesQuery.data ?? []).map((inst) => (
            <option key={inst.id} value={inst.id}>
              {inst.name} ({inst.type})
            </option>
          ))}
        </select>

        {view === 'runs' ? (
          <select
            value={runStatusFilter}
            onChange={(e) => setRunStatusFilter(e.target.value as AgentRunStatus | '')}
            className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-xs text-[var(--text-primary)]"
          >
            <option value="">모든 상태</option>
            {RUN_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        ) : (
          <select
            value={requestStatusFilter}
            onChange={(e) => setRequestStatusFilter(e.target.value as AgentRunRequestStatus | '')}
            className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-xs text-[var(--text-primary)]"
          >
            <option value="">모든 상태</option>
            {REQUEST_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        )}
      </div>

      {isRefreshing ? (
        <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 shadow-sm" aria-live="polite">
          <RefreshCw size={13} className="animate-spin text-purple-600" />
          조건에 맞춰 Agent OS 데이터를 갱신 중입니다.
        </div>
      ) : null}

      {view === 'runs' ? (
        <div aria-busy={isRefreshing}>
          <RunsTable
            runs={runsQuery.data?.items ?? []}
            instancesById={instancesById}
            loading={runsQuery.isPending && !runsQuery.data}
          />
        </div>
      ) : (
        <div aria-busy={isRefreshing}>
          <RequestsTable
            requests={requestsQuery.data?.items ?? []}
            instancesById={instancesById}
            loading={requestsQuery.isPending && !requestsQuery.data}
          />
        </div>
      )}
    </div>
  );
}

function RunsTable({
  runs,
  instancesById,
  loading,
}: {
  runs: AgentRunSummary[];
  instancesById: Map<string, AgentInstanceSummary>;
  loading: boolean;
}) {
  if (loading) {
    return <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface)] p-6 text-sm text-[var(--text-tertiary)]">로딩 중…</div>;
  }
  if (runs.length === 0) {
    return (
      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface)] p-12 text-center text-sm text-[var(--text-tertiary)]">
        해당 조건의 실행이 없습니다.
      </div>
    );
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--border-subtle)] bg-[var(--surface)]">
      <table className="w-full text-xs">
        <thead className="text-left text-[var(--text-tertiary)]">
          <tr className="border-b border-[var(--border-subtle)]">
            <th className="px-3 py-2 font-medium">상태</th>
            <th className="px-3 py-2 font-medium">에이전트</th>
            <th className="px-3 py-2 font-medium">유형</th>
            <th className="px-3 py-2 font-medium">트리거</th>
            <th className="px-3 py-2 font-medium">모델</th>
            <th className="px-3 py-2 font-medium">시작</th>
            <th className="px-3 py-2 font-medium">종료</th>
            <th className="px-3 py-2 font-medium">에러</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => {
            const instance = instancesById.get(run.agentInstanceId);
            return (
              <tr key={run.id} className="border-b border-[var(--border-subtle)] last:border-b-0">
                <td className="px-3 py-2">
                  <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium', runStatusClass(run.status))}>
                    <StatusIcon status={run.status} />
                    {run.status}
                  </span>
                </td>
                <td className="px-3 py-2 text-[var(--text-primary)]">
                  {instance?.name ?? run.agentInstanceId.slice(0, 8)}
                </td>
                <td className="px-3 py-2 text-[var(--text-secondary)]">{run.agentType}</td>
                <td className="px-3 py-2 text-[var(--text-secondary)]">{run.invocationSource}</td>
                <td className="px-3 py-2 text-[var(--text-secondary)]">
                  {run.adapterType} / {run.model}
                </td>
                <td className="px-3 py-2 text-[var(--text-secondary)] whitespace-nowrap">{formatDateTime(run.startedAt)}</td>
                <td className="px-3 py-2 text-[var(--text-secondary)] whitespace-nowrap">
                  {run.finishedAt ? formatDateTime(run.finishedAt) : '-'}
                </td>
                <td className="px-3 py-2 text-rose-600">
                  {run.errorCode ? (
                    <span title={run.errorMessage ?? ''} className="font-mono text-[11px]">
                      {run.errorCode}
                    </span>
                  ) : (
                    '-'
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function RequestsTable({
  requests,
  instancesById,
  loading,
}: {
  requests: import('@kiditem/shared/agent-os').AgentRunRequestSummary[];
  instancesById: Map<string, AgentInstanceSummary>;
  loading: boolean;
}) {
  if (loading) {
    return <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface)] p-6 text-sm text-[var(--text-tertiary)]">로딩 중…</div>;
  }
  if (requests.length === 0) {
    return (
      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface)] p-12 text-center text-sm text-[var(--text-tertiary)]">
        해당 조건의 요청이 없습니다.
      </div>
    );
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--border-subtle)] bg-[var(--surface)]">
      <table className="w-full text-xs">
        <thead className="text-left text-[var(--text-tertiary)]">
          <tr className="border-b border-[var(--border-subtle)]">
            <th className="px-3 py-2 font-medium">상태</th>
            <th className="px-3 py-2 font-medium">에이전트</th>
            <th className="px-3 py-2 font-medium">유형</th>
            <th className="px-3 py-2 font-medium">소스</th>
            <th className="px-3 py-2 font-medium">시도</th>
            <th className="px-3 py-2 font-medium">예약</th>
            <th className="px-3 py-2 font-medium">claimedAt</th>
            <th className="px-3 py-2 font-medium">finishedAt</th>
            <th className="px-3 py-2 font-medium">에러</th>
          </tr>
        </thead>
        <tbody>
          {requests.map((req) => {
            const instance = instancesById.get(req.agentInstanceId);
            return (
              <tr key={req.id} className="border-b border-[var(--border-subtle)] last:border-b-0">
                <td className="px-3 py-2">
                  <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium', runStatusClass(req.status))}>
                    <StatusIcon status={req.status} />
                    {req.status}
                  </span>
                </td>
                <td className="px-3 py-2 text-[var(--text-primary)]">
                  {instance?.name ?? req.agentInstanceId.slice(0, 8)}
                </td>
                <td className="px-3 py-2 text-[var(--text-secondary)]">{req.agentType}</td>
                <td className="px-3 py-2 text-[var(--text-secondary)]">{req.source}</td>
                <td className="px-3 py-2 text-[var(--text-secondary)]">
                  {req.attempts} / {req.maxAttempts}
                </td>
                <td className="px-3 py-2 text-[var(--text-secondary)] whitespace-nowrap">{formatDateTime(req.scheduledFor)}</td>
                <td className="px-3 py-2 text-[var(--text-secondary)] whitespace-nowrap">
                  {req.claimedAt ? formatDateTime(req.claimedAt) : '-'}
                </td>
                <td className="px-3 py-2 text-[var(--text-secondary)] whitespace-nowrap">
                  {req.finishedAt ? formatDateTime(req.finishedAt) : '-'}
                </td>
                <td className="px-3 py-2 text-rose-600">
                  {req.lastErrorCode ? (
                    <span title={req.lastErrorMessage ?? ''} className="font-mono text-[11px]">
                      {req.lastErrorCode}
                    </span>
                  ) : (
                    '-'
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
