'use client';

import { useState } from 'react';
import { Clock, ChevronRight, ChevronDown } from 'lucide-react';
import { cn, formatDateTime } from '@/lib/utils';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { relativeTime, formatTokens, formatCost, formatDuration } from '../../lib/agent-utils';
import { SOURCE_LABELS } from '../../lib/agent-types';
import { RUN_STATUS_ICONS, FAILURE_TYPE_ICONS, SOURCE_BADGE_COLORS } from '../lib/constants';
import type { HeartbeatRun } from '../../lib/agent-types';

function RunDetail({ run }: { run: HeartbeatRun }) {
  const inputTokens = (run.usageJson?.inputTokens as number | undefined) ?? 0;
  const outputTokens = (run.usageJson?.outputTokens as number | undefined) ?? 0;
  const costCents = (run.usageJson?.costCents as number | undefined) ?? 0;
  const statusInfo = (run.failureType ? FAILURE_TYPE_ICONS[run.failureType] : undefined) ?? RUN_STATUS_ICONS[run.status] ?? { icon: Clock, colorClass: 'text-slate-400' };
  const StatusIcon = statusInfo.icon;
  const [stdoutOpen, setStdoutOpen] = useState(true);
  const [stderrOpen, setStderrOpen] = useState(true);

  return (
    <div className="h-full overflow-y-auto">
      {/* Detail header */}
      <div className="px-4 py-3 bg-slate-50 border-b border-slate-200">
        <div className="flex items-center gap-2 flex-wrap">
          <StatusIcon className={cn('w-3.5 h-3.5', statusInfo.colorClass, run.status === 'running' && 'animate-spin')} />
          <StatusBadge status={run.status} />
          <span className="font-mono text-xs text-slate-500">{run.id.slice(0, 16)}…</span>
          {run.exitCode !== null && (
            <span className="text-xs text-slate-500 ml-auto">exit: {run.exitCode}</span>
          )}
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Timing */}
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <span className="text-xs text-slate-500 block mb-0.5">시작</span>
            <span className="text-sm text-slate-900">
              {run.startedAt ? formatDateTime(run.startedAt) : '—'}
            </span>
          </div>
          <div>
            <span className="text-xs text-slate-500 block mb-0.5">종료</span>
            <span className="text-sm text-slate-900">
              {run.finishedAt ? formatDateTime(run.finishedAt) : '—'}
            </span>
          </div>
          <div>
            <span className="text-xs text-slate-500 block mb-0.5">소요</span>
            <span className="text-sm text-slate-900">{formatDuration(run.startedAt, run.finishedAt)}</span>
          </div>
          <div>
            <span className="text-xs text-slate-500 block mb-0.5">소스</span>
            <span className="text-sm text-slate-900">
              {SOURCE_LABELS[run.invocationSource] ?? run.invocationSource}
            </span>
          </div>
        </div>

        {/* Token usage */}
        {(inputTokens > 0 || outputTokens > 0 || costCents > 0) && (
          <div className="border border-slate-200 rounded-lg p-3 grid grid-cols-3 gap-3">
            <div>
              <span className="text-[11px] uppercase tracking-wide text-slate-400 block mb-0.5">입력 토큰</span>
              <span className="text-sm font-semibold tabular-nums">{formatTokens(inputTokens)}</span>
            </div>
            <div>
              <span className="text-[11px] uppercase tracking-wide text-slate-400 block mb-0.5">출력 토큰</span>
              <span className="text-sm font-semibold tabular-nums">{formatTokens(outputTokens)}</span>
            </div>
            <div>
              <span className="text-[11px] uppercase tracking-wide text-slate-400 block mb-0.5">비용</span>
              <span className="text-sm font-semibold tabular-nums">{formatCost(costCents)}</span>
            </div>
          </div>
        )}

        {/* Session info */}
        {(run.sessionIdBefore || run.sessionIdAfter) && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className="text-xs text-slate-500 block mb-0.5">이전 세션</span>
              <span className="text-xs font-mono text-slate-700 truncate block">
                {run.sessionIdBefore ? run.sessionIdBefore.slice(0, 20) + '…' : '—'}
              </span>
            </div>
            <div>
              <span className="text-xs text-slate-500 block mb-0.5">이후 세션</span>
              <span className="text-xs font-mono text-slate-700 truncate block">
                {run.sessionIdAfter ? run.sessionIdAfter.slice(0, 20) + '…' : '—'}
              </span>
            </div>
          </div>
        )}

        {/* Error */}
        {run.error && (
          <div className="p-3 bg-red-50 border border-red-100 rounded-lg text-xs text-red-700">
            <p className="font-medium mb-1">에러</p>
            {run.error}
          </div>
        )}

        {/* Stdout */}
        {run.stdoutExcerpt && (
          <div>
            <button
              className="flex items-center gap-1.5 text-xs font-medium text-slate-600 mb-2 hover:text-slate-900 transition-colors"
              onClick={() => setStdoutOpen(v => !v)}
            >
              {stdoutOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              Stdout
            </button>
            {stdoutOpen && (
              <pre className="text-xs bg-slate-50 border border-slate-200 rounded-lg p-3 max-h-72 overflow-auto whitespace-pre-wrap text-slate-800 leading-relaxed">
                {run.stdoutExcerpt}
              </pre>
            )}
          </div>
        )}

        {/* Stderr */}
        {run.stderrExcerpt && (
          <div>
            <button
              className="flex items-center gap-1.5 text-xs font-medium text-red-600 mb-2 hover:text-red-800 transition-colors"
              onClick={() => setStderrOpen(v => !v)}
            >
              {stderrOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              Stderr
            </button>
            {stderrOpen && (
              <pre className="text-xs bg-red-50 border border-red-100 rounded-lg p-3 max-h-72 overflow-auto whitespace-pre-wrap text-red-700 leading-relaxed">
                {run.stderrExcerpt}
              </pre>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function RunsTab({
  runs,
  selectedRunId,
  onSelectRun,
}: {
  runs: HeartbeatRun[];
  selectedRunId: string | null;
  onSelectRun: (id: string | null) => void;
}) {
  const sorted = [...runs].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  const effectiveSelectedId = selectedRunId ?? sorted[0]?.id ?? null;
  const selectedRun = sorted.find((r) => r.id === effectiveSelectedId) ?? null;

  if (sorted.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-slate-400">
        <Clock className="w-8 h-8 mb-3" />
        <p className="text-sm">실행 이력이 없습니다.</p>
      </div>
    );
  }

  return (
    <div className="flex gap-4 min-h-[500px]">
      {/* Run list */}
      <div className="w-72 shrink-0 border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-3 py-2 bg-slate-50 border-b border-slate-200">
          <span className="text-xs font-medium text-slate-600">실행 목록</span>
          <span className="text-xs text-slate-400 ml-1.5">({sorted.length})</span>
        </div>
        <div className="overflow-y-auto max-h-[600px]">
          {sorted.map((run) => {
            const isSelected = effectiveSelectedId === run.id;
            const statusInfo = (run.failureType ? FAILURE_TYPE_ICONS[run.failureType] : undefined) ?? RUN_STATUS_ICONS[run.status] ?? { icon: Clock, colorClass: 'text-slate-400' };
            const StatusIcon = statusInfo.icon;
            const sourceBadgeClass = SOURCE_BADGE_COLORS[run.invocationSource] ?? 'bg-slate-100 text-slate-600';

            return (
              <button
                key={run.id}
                className={cn(
                  'w-full text-left px-3 py-3 border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors',
                  isSelected && 'bg-blue-50 border-l-2 border-l-blue-600',
                )}
                onClick={() => onSelectRun(run.id)}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <StatusIcon className={cn('w-3.5 h-3.5 shrink-0', statusInfo.colorClass, run.status === 'running' && 'animate-spin')} />
                  <StatusBadge status={run.status} />
                </div>
                <div className="flex items-center justify-between gap-1">
                  <span className="text-xs text-slate-400 font-mono">{run.id.slice(0, 8)}</span>
                  <span className={cn('inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium', sourceBadgeClass)}>
                    {SOURCE_LABELS[run.invocationSource] ?? run.invocationSource}
                  </span>
                </div>
                <div className="text-[11px] text-slate-400 mt-1">{relativeTime(run.createdAt)}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Run detail */}
      <div className="flex-1 border border-slate-200 rounded-lg overflow-hidden">
        {selectedRun ? (
          <RunDetail run={selectedRun} />
        ) : (
          <div className="flex items-center justify-center h-full text-slate-400 text-sm">
            실행을 선택하세요.
          </div>
        )}
      </div>
    </div>
  );
}
