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
 * 자동 운전 스위치 — 쇼핑몰 홈 머리의 '쇼핑몰 현황' 왼쪽에 선다(사장님 2026-09-19 "자동운전 시간이랑 자동운전시작
 * 그거를 상단 쇼핑몰 현황 왼쪽에다가 해주고 그 영역을 없애놔줘"). 간격 고르기 · 지금 한 바퀴 · 시작/멈추기와 짧은 상태
 * 한 줄뿐이고, 마지막 한 바퀴 요약은 상태에 마우스를 올리면 보인다.
 *
 * 앱을 열었다고 스스로 돌지 않는다. 시작을 누르면 곧바로 한 바퀴를 돌고 그 뒤 정한 간격마다 돈다. 새로고침하면
 * 멈추고, 언제든 멈출 수 있다. 한 바퀴는 로그인 확인 → (업무시간이면) 주문수집이다.
 */
export function MallAgentLoopControls({
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
  const status = settings.enabled
    ? `자동 운전 ${busy ? STEP_LABEL[step] : '대기'}${nextRunAt !== null ? ` · 다음 ${timeAgo(new Date(nextRunAt))}` : ''}`
    : '자동 운전 꺼짐';
  const detail = [
    settings.enabled
      ? `${formatNumber(settings.intervalMin)}분마다 · 수집은 ${AGENT_LOOP_BUSINESS_START_HOUR}~${AGENT_LOOP_BUSINESS_END_HOUR}시`
      : '시작하면 곧바로 한 바퀴 돌고, 이 탭이 열려 있는 동안 이어집니다.',
    lastSummary
      ? `마지막 한 바퀴 ${lastRunAt ? timeAgo(new Date(lastRunAt)) : ''} — ${lastSummary}`
      : '아직 한 바퀴도 돌지 않았습니다.',
  ].join('\n');
  return (
    <div role="group" aria-label="에이전트 자동 운전" className="flex flex-wrap items-center gap-2">
      <span role="status" aria-label="자동 운전 상태" title={detail} className="inline-flex items-center gap-1.5 text-xs text-slate-500">
        <span
          aria-hidden
          className={cn(
            'h-2 w-2 flex-none rounded-full',
            settings.enabled ? (busy ? 'animate-pulse bg-amber-500' : 'bg-emerald-500') : 'bg-slate-300',
          )}
        />
        {status}
      </span>
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
      {settings.enabled ? (
        <button
          type="button"
          onClick={loop.runNow}
          disabled={busy}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RefreshCw size={12} className={cn(busy && 'animate-spin')} aria-hidden />
          지금 한 바퀴
        </button>
      ) : null}
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
        {settings.enabled ? '멈추기' : '자동 운전 시작'}
      </button>
    </div>
  );
}
