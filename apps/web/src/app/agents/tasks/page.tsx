'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ExternalLink, Inbox, RefreshCw } from 'lucide-react';
import VariantStatusBadge from '@/components/ui/StatusBadge';
import PageSkeleton from '@/components/ui/PageSkeleton';
import { Pagination } from '@/components/ui/Pagination';
import { DateRangePicker } from '@/components/ui/DateRangePicker';
import { queryKeys } from '@/lib/query-keys';
import { cn, formatDateTime } from '@/lib/utils';
import { fetchAgentTasksList } from '../lib/agent-api';
import {
  computeDurationMs,
  formatDurationMs,
  shortId,
  statusBadgeVariant,
} from './lib/trace-utils';

const STATUS_OPTIONS = [
  { value: '', label: '전체' },
  { value: 'queued', label: '대기' },
  { value: 'running', label: '실행중' },
  { value: 'succeeded', label: '성공' },
  { value: 'failed', label: '실패' },
  { value: 'cancelled', label: '취소' },
];

const PAGE_SIZE = 20;

function toYmd(d: Date | undefined): string | undefined {
  if (!d) return undefined;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default function AgentTasksPage() {
  const router = useRouter();
  const [status, setStatus] = useState('');
  const [agentTypeRaw, setAgentTypeRaw] = useState('');
  const [agentType, setAgentType] = useState('');
  const [range, setRange] = useState<{ from?: Date; to?: Date } | undefined>(undefined);
  const [page, setPage] = useState(1);

  // agentType debounce 300ms
  useEffect(() => {
    const t = setTimeout(() => setAgentType(agentTypeRaw.trim()), 300);
    return () => clearTimeout(t);
  }, [agentTypeRaw]);

  const params = useMemo(
    () => ({
      status: status || undefined,
      agentType: agentType || undefined,
      from: toYmd(range?.from),
      to: toYmd(range?.to),
      page,
      limit: PAGE_SIZE,
    }),
    [status, agentType, range, page],
  );

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: queryKeys.agents.tasksList(params),
    queryFn: () => fetchAgentTasksList(params),
    refetchInterval: 30_000,
  });

  // 필터 변경 시 1페이지로 리셋
  useEffect(() => { setPage(1); }, [status, agentType, range]);

  if (isLoading) {
    return (
      <div className="p-4 sm:p-8">
        <PageSkeleton variant="table" />
      </div>
    );
  }

  const items = data?.items ?? [];
  const total = data?.total ?? 0;

  return (
    <div className="p-4 sm:p-8">
      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          태스크 목록을 불러오지 못했습니다.
          {error instanceof Error ? ` (${error.message})` : ''}
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-end gap-2">
        <div>
          <label className="block text-xs text-slate-500 mb-1">상태</label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white text-slate-900"
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">에이전트 타입</label>
          <input
            type="text"
            value={agentTypeRaw}
            onChange={(e) => setAgentTypeRaw(e.target.value)}
            placeholder="예: ad-strategy"
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white text-slate-900 w-48"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">생성 기간</label>
          <DateRangePicker
            value={range?.from || range?.to ? { from: range?.from, to: range?.to } : undefined}
            onChange={(r) => setRange(r ? { from: r.from, to: r.to } : undefined)}
          />
        </div>
        <div className="ml-auto flex items-center gap-2 text-xs text-slate-500">
          <span>총 {total}건</span>
          <button
            onClick={() => refetch()}
            className="p-1.5 text-slate-400 hover:text-slate-600 border border-slate-200 rounded-lg"
            title="새로고침"
            aria-label="새로고침"
          >
            <RefreshCw className={cn('w-3.5 h-3.5', isFetching && 'animate-spin')} />
          </button>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-slate-200 bg-white py-16 text-slate-400">
          <Inbox className="w-8 h-8 mb-2" />
          <p className="text-sm">조건에 맞는 태스크가 없습니다.</p>
        </div>
      ) : (
        <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className="px-3 py-2 text-left font-medium">ID</th>
                <th className="px-3 py-2 text-left font-medium">에이전트</th>
                <th className="px-3 py-2 text-left font-medium">상태</th>
                <th className="px-3 py-2 text-left font-medium">시작</th>
                <th className="px-3 py-2 text-left font-medium">종료</th>
                <th className="px-3 py-2 text-left font-medium">소요</th>
                <th className="px-3 py-2 text-left font-medium">워크플로우</th>
                <th className="px-3 py-2 text-right font-medium">액션</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((task) => {
                const durationMs = computeDurationMs(task.startedAt, task.completedAt);
                return (
                  <tr
                    key={task.id}
                    onClick={() => router.push(`/agents/tasks/${task.id}/trace`)}
                    className="cursor-pointer hover:bg-slate-50"
                  >
                    <td className="px-3 py-2 font-mono text-xs text-slate-600">{shortId(task.id)}</td>
                    <td className="px-3 py-2 font-mono text-xs text-slate-700">{task.agentType}</td>
                    <td className="px-3 py-2">
                      <VariantStatusBadge variant={statusBadgeVariant(task.status)} dot>
                        {task.status}
                      </VariantStatusBadge>
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-600">{formatDateTime(task.startedAt)}</td>
                    <td className="px-3 py-2 text-xs text-slate-600">{formatDateTime(task.completedAt)}</td>
                    <td className="px-3 py-2 text-xs text-slate-600">{formatDurationMs(durationMs)}</td>
                    <td className="px-3 py-2 text-xs">
                      {task.workflowRunId ? (
                        <a
                          href={`/workflows/runs/${task.workflowRunId}`}
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-1 text-violet-600 hover:underline font-mono"
                        >
                          {shortId(task.workflowRunId)}
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      ) : (
                        <span className="text-slate-300">-</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(`/agents/tasks/${task.id}/trace`);
                        }}
                        className="text-xs text-violet-600 hover:underline"
                      >
                        Trace →
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <Pagination page={page} limit={PAGE_SIZE} total={total} onPageChange={setPage} />
        </div>
      )}
    </div>
  );
}
