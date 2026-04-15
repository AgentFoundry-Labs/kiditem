'use client';

import { useMemo } from 'react';
import { AlertCircle, CheckCircle2, Clock, PlayCircle, Radio } from 'lucide-react';
import VariantStatusBadge from '@/components/ui/StatusBadge';
import { cn, formatDateTime } from '@/lib/utils';
import type { AgentEvent, AgentWakeupRequest, HeartbeatRun } from '@kiditem/shared';
import {
  computeDurationMs,
  formatDurationMs,
  isDangerEvent,
  shortId,
  statusBadgeVariant,
} from '../../../lib/trace-utils';
import { PythonFallbackBox } from './PythonFallbackBox';

interface TraceTimelineProps {
  heartbeatRuns: HeartbeatRun[];
  events: AgentEvent[];
  wakeupRequests: AgentWakeupRequest[];
  onEventClick: (e: AgentEvent) => void;
}

export function TraceTimeline({
  heartbeatRuns,
  events,
  wakeupRequests,
  onEventClick,
}: TraceTimelineProps) {
  // runId → events[]
  const eventsByRun = useMemo(() => {
    const map = new Map<string, AgentEvent[]>();
    for (const ev of events) {
      const key = ev.runId ?? '__orphan__';
      const arr = map.get(key) ?? [];
      arr.push(ev);
      map.set(key, arr);
    }
    return map;
  }, [events]);

  // runId → wakeupRequest
  const wakeupByRun = useMemo(() => {
    const map = new Map<string, AgentWakeupRequest>();
    for (const w of wakeupRequests) {
      if (w.runId) map.set(w.runId, w);
    }
    return map;
  }, [wakeupRequests]);

  // runId 없는 wakeup (아직 run 미생성) — 타임라인에 '대기' 카드로 표시
  const pendingWakeups = wakeupRequests.filter((w) => !w.runId);

  if (heartbeatRuns.length === 0 && pendingWakeups.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-slate-200 bg-slate-50 py-12 text-sm text-slate-400">
        <Clock className="w-6 h-6 mb-2" />
        <p>아직 실행된 run 이 없습니다.</p>
      </div>
    );
  }

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-slate-700">실행 타임라인</h2>

      {pendingWakeups.map((w) => (
        <div
          key={w.id}
          className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-xs text-slate-600"
        >
          <div className="flex items-center gap-2">
            <Clock className="w-3.5 h-3.5" />
            <span>대기 중 wakeup</span>
            <span className="font-mono text-slate-400">{shortId(w.id)}</span>
            <span className="text-slate-400">· {w.source}</span>
            {w.coalescedCount > 0 && (
              <span className="rounded bg-violet-50 px-1.5 py-0.5 text-[10px] font-medium text-violet-600">
                {w.coalescedCount}개 요청 병합
              </span>
            )}
          </div>
          <div className="mt-1 text-slate-400">{formatDateTime(w.requestedAt)}</div>
        </div>
      ))}

      {heartbeatRuns.map((run) => {
        const runEvents = eventsByRun.get(run.id) ?? [];
        const wakeup = wakeupByRun.get(run.id);
        const durationMs = computeDurationMs(run.startedAt, run.finishedAt);

        return (
          <article
            key={run.id}
            className="rounded-lg border border-slate-200 bg-white px-4 py-3"
          >
            <header className="flex flex-wrap items-center gap-2">
              <PlayCircle className="w-4 h-4 text-slate-400" />
              <span className="font-mono text-xs text-slate-500">{shortId(run.id)}</span>
              <VariantStatusBadge variant={statusBadgeVariant(run.status)} dot>
                {run.status}
              </VariantStatusBadge>
              <span className="text-xs text-slate-400">
                {formatDateTime(run.startedAt)} · {formatDurationMs(durationMs)}
              </span>
              {run.exitCode != null && run.exitCode !== 0 && (
                <span className="rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-red-700">
                  exit {run.exitCode}
                </span>
              )}
              {run.errorCode && (
                <span className="rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-red-700">
                  {run.errorCode}
                </span>
              )}
              {wakeup?.coalescedCount && wakeup.coalescedCount > 0 ? (
                <span className="rounded bg-violet-50 px-1.5 py-0.5 text-[10px] font-medium text-violet-600">
                  {wakeup.coalescedCount}개 요청 병합
                </span>
              ) : null}
              <span className="ml-auto text-[10px] text-slate-400">
                {runEvents.length} events
              </span>
            </header>

            {run.error && (
              <div className="mt-2 flex items-start gap-1.5 rounded border border-red-100 bg-red-50 px-2 py-1.5 text-xs text-red-700">
                <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span className="break-all">{run.error}</span>
              </div>
            )}

            {runEvents.length > 0 ? (
              <ul className="mt-3 space-y-1.5 border-l border-slate-200 pl-3">
                {runEvents.map((ev) => {
                  const danger = isDangerEvent(ev.eventType);
                  return (
                    <li key={ev.id}>
                      <button
                        type="button"
                        onClick={() => onEventClick(ev)}
                        className={cn(
                          'w-full text-left rounded border px-2 py-1.5 text-xs transition-colors',
                          danger
                            ? 'border-red-300 bg-red-50 hover:bg-red-100'
                            : 'border-slate-200 bg-white hover:bg-slate-50',
                        )}
                      >
                        <div className="flex items-center gap-1.5">
                          {danger ? (
                            <AlertCircle className="w-3 h-3 text-red-500" />
                          ) : (
                            <Radio className="w-3 h-3 text-slate-400" />
                          )}
                          <span className="font-mono font-medium text-slate-800">
                            {ev.eventType}
                          </span>
                          {ev.category && (
                            <span className="text-slate-400">· {ev.category}</span>
                          )}
                          <span className="ml-auto text-[10px] text-slate-400">
                            {formatDateTime(ev.createdAt)}
                          </span>
                        </div>
                        {ev.detail && (
                          <p className="mt-0.5 text-slate-600 line-clamp-1">{ev.detail}</p>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <PythonFallbackBox
                stdoutExcerpt={run.stdoutExcerpt}
                stderrExcerpt={run.stderrExcerpt}
                resultJson={run.resultJson}
              />
            )}

            {run.finishedAt && (
              <div className="mt-2 flex items-center gap-1 text-[10px] text-slate-400">
                <CheckCircle2 className="w-3 h-3" />
                <span>종료 {formatDateTime(run.finishedAt)}</span>
              </div>
            )}
          </article>
        );
      })}
    </section>
  );
}
