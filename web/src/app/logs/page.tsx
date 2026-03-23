'use client';

import { useState } from 'react';
import { CheckCircle, XCircle, Loader2, Filter, Clock, BarChart3 } from 'lucide-react';
import { useStore } from '@/shared/store/useStore';
import DataTable, { Column } from '@/shared/components/ui/DataTable';
import StatusBadge from '@/shared/components/ui/StatusBadge';
import MetricCard from '@/shared/components/ui/MetricCard';
import { cn, getModuleColor, timeAgo, formatNumber } from '@/lib/utils';
import type { ExecutionLog, ModuleCategory } from '@/shared/types';

export default function LogsPage() {
  const { executionLogs, getDashboardStats } = useStore();
  const stats = getDashboardStats();
  const [moduleFilter, setModuleFilter] = useState<ModuleCategory | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const filtered = executionLogs.filter((log) => {
    if (moduleFilter !== 'all' && log.module !== moduleFilter) return false;
    if (statusFilter !== 'all' && log.status !== statusFilter) return false;
    return true;
  });

  const successCount = executionLogs.filter((l) => l.status === 'success').length;
  const errorCount = executionLogs.filter((l) => l.status === 'error').length;
  const avgDuration = Math.round(
    executionLogs.filter((l) => l.duration).reduce((s, l) => s + (l.duration || 0), 0) /
    executionLogs.filter((l) => l.duration).length / 1000
  );

  const columns: Column<ExecutionLog>[] = [
    {
      key: 'status',
      header: '',
      width: '40px',
      render: (item) => {
        if (item.status === 'success') return <CheckCircle className="w-4 h-4 text-emerald-400" />;
        if (item.status === 'error') return <XCircle className="w-4 h-4 text-red-400" />;
        return <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />;
      },
    },
    {
      key: 'module',
      header: '모듈',
      render: (item) => (
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: getModuleColor(item.module) }} />
          <span className="text-xs">{item.module}</span>
        </div>
      ),
    },
    {
      key: 'workflowName',
      header: '워크플로우',
      render: (item) => <span className="text-gray-300 font-medium">{item.workflowName}</span>,
    },
    {
      key: 'message',
      header: '메시지',
      render: (item) => <span className="text-gray-400 truncate max-w-[300px] block">{item.message}</span>,
    },
    {
      key: 'statusBadge',
      header: '상태',
      align: 'center',
      render: (item) => {
        const v = item.status === 'success' ? 'success' as const : item.status === 'error' ? 'error' as const : 'info' as const;
        const l = item.status === 'success' ? '성공' : item.status === 'error' ? '오류' : '실행중';
        return <StatusBadge variant={v} dot>{l}</StatusBadge>;
      },
    },
    {
      key: 'duration',
      header: '소요시간',
      align: 'right',
      render: (item) => item.duration
        ? <span className="text-gray-500 font-mono text-[11px]">{(item.duration / 1000).toFixed(1)}s</span>
        : <span className="text-gray-700">-</span>,
    },
    {
      key: 'startedAt',
      header: '실행시간',
      align: 'right',
      render: (item) => <span className="text-gray-600 text-[11px]">{timeAgo(item.startedAt)}</span>,
    },
  ];

  return (
    <div className="space-y-6 max-w-[1200px]">
      <div>
        <h1 className="text-2xl font-bold text-white">Execution Logs</h1>
        <p className="text-sm text-gray-500 mt-1">전체 워크플로우 실행 기록</p>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-4 gap-3">
        <MetricCard label="오늘 총 실행" value={formatNumber(stats.todayExecutions)} color="text-blue-400" icon={<BarChart3 className="w-4 h-4" />} />
        <MetricCard label="성공" value={successCount} color="text-emerald-400" icon={<CheckCircle className="w-4 h-4" />} />
        <MetricCard label="오류" value={errorCount} color={errorCount > 0 ? 'text-red-400' : 'text-gray-500'} icon={<XCircle className="w-4 h-4" />} />
        <MetricCard label="평균 소요시간" value={`${avgDuration}초`} color="text-violet-400" icon={<Clock className="w-4 h-4" />} />
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4">
        <Filter className="w-4 h-4 text-gray-600" />
        <div className="flex gap-1">
          {(['all', 'order', 'accounting', 'inventory', 'cs', 'report'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setModuleFilter(m)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs transition-colors border',
                moduleFilter === m
                  ? 'bg-white/10 text-white border-white/10'
                  : 'text-gray-600 hover:text-gray-400 border-transparent'
              )}
            >
              {m === 'all' ? '전체' : m}
            </button>
          ))}
        </div>
        <div className="h-4 w-px bg-[#1e2028]" />
        <div className="flex gap-1">
          {['all', 'success', 'error', 'running'].map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs transition-colors border',
                statusFilter === s
                  ? 'bg-white/10 text-white border-white/10'
                  : 'text-gray-600 hover:text-gray-400 border-transparent'
              )}
            >
              {s === 'all' ? '전체' : s === 'success' ? '성공' : s === 'error' ? '오류' : '실행중'}
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
