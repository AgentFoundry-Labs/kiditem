'use client';

import { CheckCircle, XCircle, Loader2 } from 'lucide-react';
import StatusBadge from '@/components/ui/StatusBadge';
import type { Column } from './DataTable';
import { getModuleColor, timeAgo } from '@/lib/utils';
import type { ExecutionLog } from '@/types';

export function getLogColumns(): Column<ExecutionLog>[] {
  return [
    {
      key: 'status',
      header: '',
      width: '40px',
      render: (item) => {
        if (item.status === 'success') return <CheckCircle className="w-4 h-4 text-green-600" />;
        if (item.status === 'error') return <XCircle className="w-4 h-4 text-red-400" />;
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
        <span className="text-gray-500 truncate max-w-[300px] block">{item.message}</span>
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
          item.status === 'success' ? '성공' : item.status === 'error' ? '오류' : '실행중';
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
        <span className="text-gray-600 text-[11px]">{timeAgo(item.startedAt)}</span>
      ),
    },
  ];
}
