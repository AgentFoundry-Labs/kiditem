'use client';

import { useState, useEffect } from 'react';
import {
  CheckCircle,
  XCircle,
  Loader2,
  Filter,
  Clock,
  BarChart3,
  AlertCircle,
} from 'lucide-react';
import DataTable, { Column } from '@/components/ui/DataTable';
import StatusBadge from '@/components/ui/StatusBadge';
import MetricCard from '@/components/ui/MetricCard';
import { cn, getModuleColor, timeAgo, formatNumber } from '@/lib/utils';
import PageSkeleton from '@/components/ui/PageSkeleton';
import { workflowApi } from '@/lib/workflow-api';
import type { WorkflowTemplate, WorkflowRun } from '@/lib/workflow-types';
import type { ExecutionLog, ModuleCategory } from '@/types';

export default function LogsPage() {
  const [logs, setLogs] = useState<ExecutionLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [moduleFilter, setModuleFilter] = useState<ModuleCategory | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  useEffect(() => {
    async function load() {
      try {
        const templates = await workflowApi.list();
        const runsArrays = await Promise.all(
          templates.map((t) => workflowApi.getRuns(t.id).catch(() => [] as WorkflowRun[])),
        );

        // Build a lookup for template info
        const templateMap = new Map<string, WorkflowTemplate>(
          templates.map((t) => [t.id, t]),
        );

        // Flatten all runs into ExecutionLog format
        const allLogs: ExecutionLog[] = runsArrays
          .flat()
          .map((run) => {
            const tpl = templateMap.get(run.templateId);
            const status: 'success' | 'error' | 'running' =
              run.status === 'completed'
                ? 'success'
                : run.status === 'failed'
                  ? 'error'
                  : 'running';
            const duration =
              run.completedAt && run.startedAt
                ? Date.parse(run.completedAt) - Date.parse(run.startedAt)
                : undefined;

            return {
              id: run.id,
              workflowId: run.templateId,
              workflowName: tpl?.name ?? 'Unknown',
              module: (tpl?.module ?? 'order') as ModuleCategory,
              status,
              startedAt: run.startedAt ?? run.createdAt,
              completedAt: run.completedAt ?? undefined,
              duration,
              message: run.error || '',
            };
          })
          .sort(
            (a, b) =>
              new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
          );

        setLogs(allLogs);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  const filtered = logs.filter((log) => {
    if (moduleFilter !== 'all' && log.module !== moduleFilter) return false;
    if (statusFilter !== 'all' && log.status !== statusFilter) return false;
    return true;
  });

  const successCount = logs.filter((l) => l.status === 'success').length;
  const errorCount = logs.filter((l) => l.status === 'error').length;
  const withDuration = logs.filter((l) => l.duration);
  const avgDuration =
    withDuration.length > 0
      ? Math.round(
          withDuration.reduce((s, l) => s + (l.duration || 0), 0) /
            withDuration.length /
            1000,
        )
      : 0;

  const columns: Column<ExecutionLog>[] = [
    {
      key: 'status',
      header: '',
      width: '40px',
      render: (item) => {
        if (item.status === 'success')
          return <CheckCircle className="w-4 h-4 text-green-600" />;
        if (item.status === 'error')
          return <XCircle className="w-4 h-4 text-red-400" />;
        return <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />;
      },
    },
    {
      key: 'module',
      header: '모듈',
      render: (item) => (
        <div className="flex items-center gap-2">
          <div
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: getModuleColor(item.module) }}
          />
          <span className="text-xs">{item.module}</span>
        </div>
      ),
    },
    {
      key: 'workflowName',
      header: '워크플로우',
      render: (item) => (
        <span className="text-gray-700 font-medium">{item.workflowName}</span>
      ),
    },
    {
      key: 'message',
      header: '메시지',
      render: (item) => (
        <span className="text-gray-500 truncate max-w-[300px] block">
          {item.message}
        </span>
      ),
    },
    {
      key: 'statusBadge',
      header: '상태',
      align: 'center',
      render: (item) => {
        const v =
          item.status === 'success'
            ? ('success' as const)
            : item.status === 'error'
              ? ('error' as const)
              : ('info' as const);
        const l =
          item.status === 'success'
            ? '성공'
            : item.status === 'error'
              ? '오류'
              : '실행중';
        return (
          <StatusBadge variant={v} dot>
            {l}
          </StatusBadge>
        );
      },
    },
    {
      key: 'duration',
      header: '소요시간',
      align: 'right',
      render: (item) =>
        item.duration ? (
          <span className="text-gray-500 font-mono text-[11px]">
            {(item.duration / 1000).toFixed(1)}s
          </span>
        ) : (
          <span className="text-gray-700">-</span>
        ),
    },
    {
      key: 'startedAt',
      header: '실행시간',
      align: 'right',
      render: (item) => (
        <span className="text-gray-600 text-[11px]">
          {timeAgo(item.startedAt)}
        </span>
      ),
    },
  ];

  if (loading) {
    return <PageSkeleton variant="table" />;
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64 gap-2 text-red-500">
        <AlertCircle className="w-5 h-5" />
        <span className="text-sm">{error}</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-[1200px]">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Execution Logs</h1>
        <p className="text-sm text-gray-500 mt-1">전체 워크플로우 실행 기록</p>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-4 gap-3">
        <MetricCard
          label="총 실행"
          value={formatNumber(logs.length)}
          color="text-blue-600"
          icon={<BarChart3 className="w-4 h-4" />}
        />
        <MetricCard
          label="성공"
          value={successCount}
          color="text-green-600"
          icon={<CheckCircle className="w-4 h-4" />}
        />
        <MetricCard
          label="오류"
          value={errorCount}
          color={errorCount > 0 ? 'text-red-400' : 'text-gray-500'}
          icon={<XCircle className="w-4 h-4" />}
        />
        <MetricCard
          label="평균 소요시간"
          value={`${avgDuration}초`}
          color="text-violet-400"
          icon={<Clock className="w-4 h-4" />}
        />
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4">
        <Filter className="w-4 h-4 text-gray-600" />
        <div className="flex gap-1">
          {(
            ['all', 'order', 'accounting', 'inventory', 'cs', 'report'] as const
          ).map((m) => (
            <button
              key={m}
              onClick={() => setModuleFilter(m)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs transition-colors border',
                moduleFilter === m
                  ? 'bg-white text-gray-900 border-gray-200'
                  : 'text-gray-600 hover:text-gray-500 border-transparent',
              )}
            >
              {m === 'all' ? '전체' : m}
            </button>
          ))}
        </div>
        <div className="h-4 w-px bg-gray-200" />
        <div className="flex gap-1">
          {['all', 'success', 'error', 'running'].map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs transition-colors border',
                statusFilter === s
                  ? 'bg-white text-gray-900 border-gray-200'
                  : 'text-gray-600 hover:text-gray-500 border-transparent',
              )}
            >
              {s === 'all'
                ? '전체'
                : s === 'success'
                  ? '성공'
                  : s === 'error'
                    ? '오류'
                    : '실행중'}
            </button>
          ))}
        </div>
      </div>

      {/* Log Table */}
      <DataTable
        columns={columns}
        data={filtered}
        pageSize={15}
        emptyMessage="해당 조건에 맞는 실행 로그가 없습니다."
      />
    </div>
  );
}
