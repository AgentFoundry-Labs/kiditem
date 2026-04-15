'use client';

import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { statusBadge, statusBadgeDefault } from '@/lib/status-colors';
import { relativeTime } from '../../lib/agent-utils';
import { SOURCE_LABELS } from '../../lib/agent-types';
import { agentColor, agentInitials, statusLabel, runDescription, SOURCE_COLORS } from '../lib/activity-utils';
import type { RunWithAgent } from '../lib/activity-utils';

export function ActivityFeed({
  grouped,
  expandedRunId,
  setExpandedRunId,
}: {
  grouped: { label: string; runs: RunWithAgent[] }[];
  expandedRunId: string | null;
  setExpandedRunId: (id: string | null) => void;
}) {
  return (
    <>
      {grouped.map((group) => (
        <div key={group.label} className="mb-6">
          {/* Date group header */}
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs font-medium text-slate-500">{group.label}</span>
            <div className="flex-1 h-px bg-slate-100" />
          </div>

          {/* Runs */}
          <div className="space-y-1">
            {group.runs.map((run, idx) => {
              const colorClass = agentColor(run.agentName);
              const initials = agentInitials(run.agentName);
              const srcColor = SOURCE_COLORS[run.invocationSource] ?? 'bg-slate-100 text-slate-600';
              const badgeClass = statusBadge[run.status] ?? statusBadgeDefault;
              const isLast = idx === group.runs.length - 1;
              const hasError = run.status === 'failed' && (run.error || run.stderrExcerpt);
              const isExpanded = expandedRunId === run.id;

              return (
                <div key={run.id}>
                  <div
                    onClick={() => {
                      if (hasError) setExpandedRunId(isExpanded ? null : run.id);
                    }}
                    className={cn(
                      'flex items-start gap-3 px-3 py-2.5 rounded-lg hover:bg-slate-50 transition-colors cursor-default',
                      !isLast && !isExpanded && 'border-b border-slate-50',
                      hasError && 'cursor-pointer',
                    )}
                  >
                    {/* Agent avatar */}
                    <div
                      className={cn(
                        'w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-xs font-semibold mt-0.5',
                        colorClass,
                      )}
                    >
                      {run.agentIcon ?? initials}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start gap-2 flex-wrap">
                        <span className="text-sm font-medium text-slate-900">{run.agentName}</span>
                        <span className="text-sm text-slate-500 truncate flex-1 min-w-0">
                          {runDescription(run)}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        {/* Status badge */}
                        <span
                          className={cn(
                            'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium',
                            badgeClass,
                          )}
                        >
                          {statusLabel(run)}
                        </span>

                        {/* Source badge */}
                        <span
                          className={cn(
                            'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium',
                            srcColor,
                          )}
                        >
                          {SOURCE_LABELS[run.invocationSource] ?? run.invocationSource}
                        </span>

                        {/* Error preview */}
                        {run.error && !isExpanded && (
                          <span className="text-[10px] text-red-500 truncate max-w-xs" title={run.error}>
                            {run.error.slice(0, 60)}{run.error.length > 60 ? '...' : ''}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Expand indicator + time */}
                    <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
                      {hasError && (
                        <ChevronDown className={cn('w-3 h-3 text-slate-400 transition-transform', isExpanded && 'rotate-180')} />
                      )}
                      <span className="text-xs text-slate-400">
                        {relativeTime(run.createdAt)}
                      </span>
                    </div>
                  </div>

                  {/* Error expansion panel */}
                  {isExpanded && hasError && (
                    <div className="ml-11 mt-1 mb-2 p-3 bg-red-50 border border-red-100 rounded-lg">
                      {run.error && (
                        <div className="mb-2">
                          <span className="text-[10px] font-medium text-red-600 block mb-1">에러</span>
                          <pre className="text-[11px] text-red-700 whitespace-pre-wrap break-all font-mono">
                            {run.error}
                          </pre>
                        </div>
                      )}
                      {run.stderrExcerpt && (
                        <div>
                          <span className="text-[10px] font-medium text-red-600 block mb-1">stderr</span>
                          <pre className="text-[11px] text-red-700 whitespace-pre-wrap break-all font-mono max-h-40 overflow-y-auto">
                            {run.stderrExcerpt}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </>
  );
}
