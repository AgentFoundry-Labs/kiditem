'use client';

import { X, CheckCircle, XCircle, Loader2, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { StepStatusInfo } from '../lib/workflow-types';

interface NodeDetailPopoverProps {
  stepInfo: StepStatusInfo;
  position: { x: number; y: number };
  onClose: () => void;
}

const statusDisplay: Record<
  string,
  { label: string; color: string; icon: any }
> = {
  idle: { label: '대기', color: 'text-slate-500', icon: Clock },
  running: { label: '실행중', color: 'text-purple-600', icon: Loader2 },
  success: { label: '성공', color: 'text-green-600', icon: CheckCircle },
  error: { label: '실패', color: 'text-red-500', icon: XCircle },
};

function formatDuration(
  startedAt: string | Date | null | undefined,
  completedAt: string | Date | null | undefined,
): string {
  if (!startedAt) return '-';
  const start = new Date(startedAt).getTime();
  const end = completedAt ? new Date(completedAt).getTime() : Date.now();
  const diffMs = end - start;
  if (diffMs < 1000) return `${diffMs}ms`;
  return `${(diffMs / 1000).toFixed(1)}s`;
}

function truncateJson(data: Record<string, any> | null | undefined, maxLines = 5): string {
  if (!data) return '-';
  const str = JSON.stringify(data, null, 2);
  const lines = str.split('\n');
  if (lines.length <= maxLines) return str;
  return lines.slice(0, maxLines).join('\n') + '\n...';
}

export default function NodeDetailPopover({
  stepInfo,
  position,
  onClose,
}: NodeDetailPopoverProps) {
  const cfg = statusDisplay[stepInfo.status] ?? statusDisplay.idle;
  const StatusIcon = cfg.icon;

  return (
    <div
      className="absolute z-50 bg-white border border-slate-200 rounded-lg shadow-lg p-4 w-[320px]"
      style={{ right: 16, top: 16 }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className={cn('flex items-center gap-1.5 text-sm font-medium', cfg.color)}>
          <StatusIcon
            className={cn(
              'w-4 h-4',
              stepInfo.status === 'running' && 'animate-spin',
            )}
          />
          {cfg.label}
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Duration */}
      <div className="text-xs text-slate-500 mb-2">
        소요시간: {formatDuration(stepInfo.startedAt, stepInfo.completedAt)}
      </div>

      {/* Output preview */}
      {stepInfo.outputData && (
        <div className="mb-2">
          <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">
            Output
          </p>
          <pre className="text-[11px] text-slate-700 bg-slate-50 border border-slate-100 rounded p-2 overflow-auto max-h-[120px] whitespace-pre-wrap">
            {truncateJson(stepInfo.outputData)}
          </pre>
        </div>
      )}

      {/* Error */}
      {stepInfo.error && (
        <div>
          <p className="text-[10px] text-red-400 uppercase tracking-wider mb-1">
            Error
          </p>
          <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded p-2">
            {stepInfo.error}
          </p>
        </div>
      )}
    </div>
  );
}
