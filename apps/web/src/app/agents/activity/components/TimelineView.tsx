'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { SOURCE_LABELS } from '../../lib/agent-types';
import { agentColor, agentInitials, statusLabel } from '../lib/activity-utils';
import type { RunWithAgent } from '../lib/activity-utils';

const TIMELINE_BLOCK_COLORS: Record<string, string> = {
  succeeded: 'bg-green-400',
  failed: 'bg-red-400',
  running: 'bg-blue-400 animate-pulse',
  timed_out: 'bg-orange-400',
  queued: 'bg-violet-400',
  cancelled: 'bg-gray-300',
};
const TIMELINE_BLOCK_DEFAULT = 'bg-gray-300';

function getTimeRange(timeRange: string): { start: number; end: number; tickCount: number; tickLabel: (i: number) => string } {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const todayEnd = todayStart + 24 * 3600_000;

  if (timeRange === '오늘') {
    return {
      start: todayStart,
      end: todayEnd,
      tickCount: 12,
      tickLabel: (i) => `${i * 2}시`,
    };
  }
  if (timeRange === '7일') {
    const start = todayEnd - 7 * 86400_000;
    return {
      start,
      end: todayEnd,
      tickCount: 7,
      tickLabel: (i) => {
        const d = new Date(start + i * 86400_000);
        return `${d.getMonth() + 1}/${d.getDate()}`;
      },
    };
  }
  // 30일 or all
  const start = todayEnd - 30 * 86400_000;
  return {
    start,
    end: todayEnd,
    tickCount: 10,
    tickLabel: (i) => {
      const d = new Date(start + i * 3 * 86400_000);
      return `${d.getMonth() + 1}/${d.getDate()}`;
    },
  };
}

export function TimelineView({ runs, timeRange }: { runs: RunWithAgent[]; timeRange: string }) {
  const [hoveredRun, setHoveredRun] = useState<{ run: RunWithAgent; x: number; y: number } | null>(null);

  const range = getTimeRange(timeRange);
  const span = range.end - range.start;

  // Group by agent
  const agentGroups = new Map<string, RunWithAgent[]>();
  for (const run of runs) {
    const existing = agentGroups.get(run.agentName);
    if (existing) existing.push(run);
    else agentGroups.set(run.agentName, [run]);
  }
  const agents = Array.from(agentGroups.keys()).sort();

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      {/* Time axis header */}
      <div className="flex border-b border-gray-100">
        <div className="w-36 shrink-0 px-3 py-2 text-[10px] text-gray-400 font-medium border-r border-gray-100">
          에이전트
        </div>
        <div className="flex-1 relative h-8">
          {Array.from({ length: range.tickCount }, (_, i) => {
            const pct = (i / range.tickCount) * 100;
            return (
              <span
                key={i}
                className="absolute top-2 text-[10px] text-gray-400 -translate-x-1/2"
                style={{ left: `${pct}%` }}
              >
                {range.tickLabel(i)}
              </span>
            );
          })}
        </div>
      </div>

      {/* Agent rows */}
      {agents.map((agentName) => {
        const agentRuns = agentGroups.get(agentName)!;
        const colorClass = agentColor(agentName);
        const initials = agentInitials(agentName);

        return (
          <div key={agentName} className="flex border-b border-gray-50 last:border-0">
            {/* Agent label */}
            <div className="w-36 shrink-0 px-3 py-2 flex items-center gap-2 border-r border-gray-100">
              <div
                className={cn(
                  'w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-semibold shrink-0',
                  colorClass,
                )}
              >
                {initials}
              </div>
              <span className="text-xs text-gray-700 truncate">{agentName}</span>
            </div>

            {/* Timeline bar */}
            <div className="flex-1 relative h-10 bg-gray-50/50">
              {/* Grid lines */}
              {Array.from({ length: range.tickCount }, (_, i) => (
                <div
                  key={i}
                  className="absolute top-0 bottom-0 w-px bg-gray-100"
                  style={{ left: `${(i / range.tickCount) * 100}%` }}
                />
              ))}

              {/* Run blocks */}
              {agentRuns.map((run) => {
                const runStart = new Date(run.startedAt ?? run.createdAt).getTime();
                const runEnd = run.finishedAt
                  ? new Date(run.finishedAt).getTime()
                  : run.status === 'running'
                    ? Date.now()
                    : runStart + 60_000;
                const leftPct = Math.max(0, ((runStart - range.start) / span) * 100);
                const widthPct = Math.max(0.5, ((runEnd - runStart) / span) * 100);
                const blockColor = TIMELINE_BLOCK_COLORS[run.status] ?? TIMELINE_BLOCK_DEFAULT;

                if (leftPct > 100) return null;

                return (
                  <div
                    key={run.id}
                    className={cn(
                      'absolute top-2 h-6 rounded-sm cursor-pointer hover:opacity-80 transition-opacity',
                      blockColor,
                    )}
                    style={{
                      left: `${leftPct}%`,
                      width: `${Math.min(widthPct, 100 - leftPct)}%`,
                      minWidth: '4px',
                    }}
                    onMouseEnter={(e) => setHoveredRun({ run, x: e.clientX, y: e.clientY })}
                    onMouseLeave={() => setHoveredRun(null)}
                  />
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Empty state */}
      {agents.length === 0 && (
        <div className="flex items-center justify-center py-12 text-gray-400 text-sm">
          표시할 데이터가 없습니다.
        </div>
      )}

      {/* Hover tooltip */}
      {hoveredRun && (
        <div
          className="fixed z-50 px-3 py-2 bg-gray-900 text-white rounded-lg shadow-lg text-xs pointer-events-none"
          style={{ left: hoveredRun.x + 12, top: hoveredRun.y - 8 }}
        >
          <div className="font-medium">{hoveredRun.run.agentName}</div>
          <div className="text-gray-300 mt-0.5">
            {statusLabel(hoveredRun.run)} · {SOURCE_LABELS[hoveredRun.run.invocationSource] ?? hoveredRun.run.invocationSource}
          </div>
          <div className="text-gray-400 mt-0.5">
            {new Date(hoveredRun.run.startedAt ?? hoveredRun.run.createdAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
            {hoveredRun.run.finishedAt && (
              <> → {new Date(hoveredRun.run.finishedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}</>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
