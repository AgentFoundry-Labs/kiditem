'use client';

import { useState } from 'react';
import { queryKeys } from '@/lib/query-keys';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle } from 'lucide-react';
import DataTable from './components/DataTable';
import PageSkeleton from '@/components/ui/PageSkeleton';
import { isApiError } from '@/lib/api-error';
import { workflowApi } from '@/lib/workflow-api';
import type { WorkflowTemplate, WorkflowRun } from '@/lib/workflow-types';
import type { ExecutionLog, ModuleCategory } from '@/types';
import { LogMetrics } from './components/LogMetrics';
import { LogFilters } from './components/LogFilters';
import { getLogColumns } from './components/log-columns';

export default function LogsPage() {
  const [moduleFilter, setModuleFilter] = useState<ModuleCategory | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const { data: logs = [], isLoading: loading, error: queryError } = useQuery({
    queryKey: queryKeys.logs.list(),
    queryFn: async () => {
      const templates = await workflowApi.list();
      const runsArrays = await Promise.all(
        templates.map((t) => workflowApi.getRuns(t.id).catch(() => [] as WorkflowRun[])),
      );

      const templateMap = new Map<string, WorkflowTemplate>(
        templates.map((t) => [t.id, t]),
      );

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

      return allLogs;
    },
  });

  const error = queryError
    ? isApiError(queryError)
      ? queryError.detail
      : '실행 로그를 불러오는데 실패했습니다.'
    : null;

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

  if (loading) return <PageSkeleton variant="table" />;

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
      <LogMetrics
        totalCount={logs.length}
        successCount={successCount}
        errorCount={errorCount}
        avgDuration={avgDuration}
      />
      <LogFilters
        moduleFilter={moduleFilter}
        statusFilter={statusFilter}
        onModuleFilter={setModuleFilter}
        onStatusFilter={setStatusFilter}
      />
      <DataTable
        columns={getLogColumns()}
        data={filtered}
        pageSize={15}
        emptyMessage="해당 조건에 맞는 실행 로그가 없습니다."
      />
    </div>
  );
}
