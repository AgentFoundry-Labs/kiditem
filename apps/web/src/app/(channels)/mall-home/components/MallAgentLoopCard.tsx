'use client';

import { Pause, Play, RefreshCw } from 'lucide-react';
import {
  AGENT_LOOP_BUSINESS_END_HOUR,
  AGENT_LOOP_BUSINESS_START_HOUR,
  AGENT_LOOP_INTERVAL_OPTIONS_MIN,
} from '@/lib/mall-agent-loop';
import { cn, formatNumber, timeAgo } from '@/lib/utils';
import type { MallAgentLoopState } from '@/lib/mall-agent-loop';

const STEP_LABEL: Record<MallAgentLoopState['step'], string> = {
  idle: '대기',
  login: '로그인 확인 중',
  orders: '주문수집 중',
};

/**
 * 자동 운전 — 앱이 열려 있는 동안 에이전트가 스스로 도는 고리의 상태와 스위치.
 *
 * 한 바퀴는 로그인 확인 → (업무시간이면) 주문수집이다. 사람이 누르지 않아도 돌고, 언제든
 * 멈출 수 있다. 되돌리기 어려운 일은 고리에 들어 있지 않다.
 */
export function MallAgentLoopCard({
  loop,
}: {
  loop: MallAgentLoopState & {
    setEnabled: (enabled: boolean) => void;
    setIntervalMin: (minutes: number) => void;
    runNow: () => void;
  };
}) {
  const { settings, step, lastRunAt, nextRunAt, lastSummary } = loop;
  const busy = step !== 'idle';
  return (
    <section className="card rounded-2xl" aria-label="에이전트 자동 운전">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={cn(
              'flex h-9 w-9 flex-none items-center justify-center rounded-xl',
              settings.enabled ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400',
            )}
          >
            {settings.enabled ? <Play size={15} aria-hidden /> : <Pause size={15} aria-hidden />}
          </span>
          <div className="min-w-0">
            <h2 className="section-title text-base">자동 운전</h2>
            <p role="status" aria-label="자동 운전 상태" className="mt-0.5 text-xs text-slate-500">
              {settings.enabled
                ? `${busy ? STEP_LABEL[step] : '대기'} · ${formatNumber(settings.intervalMin)}분마다 · 수집은 ${AGENT_LOOP_BUSINESS_START_HOUR}~${AGENT_LOOP_BUSINESS_END_HOUR}시`
                : '꺼짐 — 사람이 누를 때만 움직입니다.'}
              {settings.enabled && nextRunAt !== null
                ? ` · 다음 ${timeAgo(new Date(nextRunAt))}`
                : ''}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-0.5">
            {AGENT_LOOP_INTERVAL_OPTIONS_MIN.map((minutes) => (
              <button
                key={minutes}
                type="button"
                onClick={() => loop.setIntervalMin(minutes)}
                aria-pressed={settings.intervalMin === minutes}
                className={cn(
                  'rounded-md px-2 py-1 text-xs font-semibold tabular-nums transition',
                  settings.intervalMin === minutes ? 'bg-white text-slate-900' : 'text-slate-500 hover:text-slate-700',
                )}
              >
                {minutes}분
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={loop.runNow}
            disabled={busy}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw size={12} className={cn(busy && 'animate-spin')} aria-hidden />
            지금 한 바퀴
          </button>
          <button
            type="button"
            onClick={() => loop.setEnabled(!settings.enabled)}
            className={cn(
              'inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium',
              settings.enabled
                ? 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                : 'bg-primary text-white hover:opacity-90',
            )}
          >
            {settings.enabled ? <Pause size={12} aria-hidden /> : <Play size={12} aria-hidden />}
            {settings.enabled ? '멈추기' : '자동 운전 켜기'}
          </button>
        </div>
      </div>

      <p className="mt-2 text-xs text-slate-500">
        {lastSummary
          ? `마지막 한 바퀴 ${lastRunAt ? timeAgo(new Date(lastRunAt)) : ''} — ${lastSummary}`
          : '아직 한 바퀴도 돌지 않았습니다. 앱을 켜 두면 잠시 뒤 스스로 시작합니다.'}
      </p>
    </section>
  );
}
