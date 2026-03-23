'use client';

import { CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { useStore } from '@/shared/store/useStore';
import { cn, getModuleColor, timeAgo, getStatusColor } from '@/lib/utils';

const statusIcons = {
  success: CheckCircle,
  error: XCircle,
  running: Loader2,
};

export default function ExecutionTimeline() {
  const { executionLogs } = useStore();

  return (
    <div className="glass-card p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-white">실행 타임라인</h2>
        <span className="text-[10px] text-gray-600">최근 실행 기록</span>
      </div>
      <div className="space-y-1">
        {executionLogs.slice(0, 10).map((log) => {
          const StatusIcon = statusIcons[log.status];
          const color = getModuleColor(log.module);

          return (
            <div
              key={log.id}
              className="flex items-center gap-3 py-2.5 px-3 rounded-lg hover:bg-white/[0.02] transition-colors group"
            >
              {/* Status Icon */}
              <StatusIcon
                className={cn(
                  'w-4 h-4 flex-shrink-0',
                  getStatusColor(log.status),
                  log.status === 'running' && 'animate-spin'
                )}
              />

              {/* Module indicator */}
              <div
                className="w-1 h-8 rounded-full flex-shrink-0"
                style={{ backgroundColor: color }}
              />

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-xs font-medium text-gray-300 truncate">
                    {log.workflowName}
                  </p>
                </div>
                <p className="text-[10px] text-gray-600 truncate">
                  {log.message}
                </p>
              </div>

              {/* Time & Duration */}
              <div className="text-right flex-shrink-0">
                <p className="text-[10px] text-gray-500">{timeAgo(log.startedAt)}</p>
                {log.duration && (
                  <p className="text-[10px] text-gray-700">
                    {(log.duration / 1000).toFixed(1)}s
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
