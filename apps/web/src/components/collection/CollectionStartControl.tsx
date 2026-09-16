'use client';

import { AlertTriangle, Loader2, RefreshCw, XCircle } from 'lucide-react';
import type {
  CollectionControlNotice,
  CollectionControlView,
} from '@/hooks/use-collection-source-control';
import { COLLECTION_SOURCE_STATUS_RECHECKING_MESSAGE } from '@/lib/collection-source-status-query';
import { cn } from '@/lib/utils';

const NOTICE_CLASS: Record<CollectionControlNotice['tone'], string> = {
  refused: 'text-[var(--warning)]',
  error: 'text-[var(--danger)]',
  warning: 'text-[var(--warning)]',
  info: 'text-[var(--text-secondary)]',
};

function startButtonLabel(state: CollectionControlView['state'], startLabel: string): string {
  if (state === 'loading') return '상태 확인 중';
  if (state === 'unavailable') return '상태 확인 필요';
  if (state === 'starting') return '시작 요청 중…';
  return startLabel;
}

/**
 * One source's start control: start, the server-reported running scope, the
 * refusal or failure reason, and stop. Every mounted copy of a source renders
 * the same shared state; the route passes the actions in.
 */
export function CollectionStartControl({
  control,
  startLabel,
  startAriaLabel,
  stopTone = 'default',
  runningDisplay = 'scope',
  onStart,
  onStop,
  startBlockedReason = null,
  startTitle,
  runningLink,
  className,
}: {
  control: CollectionControlView;
  startLabel: string;
  /** 화면에 짧게 적을 때(여러 몰 카드의 '수집') 읽는 이름은 무엇을 시작하는지 밝힌다. */
  startAriaLabel?: string;
  /**
   * 중단 버튼의 색. 시작 버튼이 그 자리에 있던 화면(몰 카드)에서는 빨강이어야 지금 누르면
   * 멈춘다는 것이 보인다. 목록 옆에 작게 붙는 화면은 기본(테두리)을 쓴다.
   */
  stopTone?: 'default' | 'danger';
  /**
   * 수집 중일 때 무엇을 보여 줄지. `scope` 는 "수집 중 · 무엇" 과 중단 버튼을 함께 세운다.
   * `stop-only` 는 중단 버튼 하나만 시작 버튼이 있던 자리에 세운다 — 카드처럼 자리가 좁고
   * 무엇을 수집하는지 카드 머리가 이미 말하는 화면용이다.
   */
  runningDisplay?: 'scope' | 'stop-only';
  /** A source its own screen starts offers none; the control then shows only running and stop. */
  onStart?: () => void;
  onStop: () => void;
  /** A route-owned reason the start cannot be requested yet, shown in place of the start. */
  startBlockedReason?: string | null;
  /** What the start collects, for the start button's tooltip. */
  startTitle?: string;
  /** The screen that shows the running collection's progress and attention, opened in a new tab. */
  runningLink?: Readonly<{ href: string; label: string }>;
  className?: string;
}) {
  const { state, running, notice, statusRead, canStop, canStart = true } = control;
  const active = state === 'running' || state === 'stopping';
  const canRequestStart = (state === 'idle' || state === 'refused') && !startBlockedReason;
  const stopOnly = runningDisplay === 'stop-only';
  const runningScope = running?.scopeLabel ? `수집 중 · ${running.scopeLabel}` : '수집 중';

  return (
    <div className={cn('flex shrink-0 flex-col items-end gap-1.5', className)}>
      {active ? (
        <div
          className={cn(
            'flex flex-wrap items-center gap-2',
            stopOnly ? 'w-full justify-stretch' : 'justify-end',
          )}
        >
          {!stopOnly && (
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--primary)]">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {runningScope}
            </span>
          )}
          {canStop && (
            <button
              type="button"
              onClick={onStop}
              disabled={state === 'stopping'}
              aria-label={stopOnly ? '수집 중단' : undefined}
              title={stopOnly ? runningScope : undefined}
              className={cn(
                'inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition disabled:opacity-60',
                stopOnly && 'flex-1',
                stopTone === 'danger'
                  ? 'bg-[var(--danger)] text-white hover:brightness-95'
                  : 'border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]',
              )}
            >
              {stopOnly
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <XCircle className="h-3.5 w-3.5" />}
              {state === 'stopping' ? '중단 요청 중…' : stopOnly ? '중단' : '수집 중단'}
            </button>
          )}
          {runningLink && (
            <a
              href={runningLink.href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-semibold text-[var(--primary)] underline-offset-2 hover:underline"
            >
              {runningLink.label}
            </a>
          )}
        </div>
      ) : canStart && (
        <button
          type="button"
          onClick={onStart}
          disabled={!canRequestStart}
          title={startTitle}
          // 읽는 이름은 지금 버튼이 하는 말과 같아야 한다. '상태 확인 중'을 무엇을 시작하는지로
          // 덮으면 화면 읽기는 상태를 듣지 못한다 — 시작을 말할 때만 이름을 길게 준다.
          aria-label={startAriaLabel && startButtonLabel(state, startLabel) === startLabel
            ? startAriaLabel
            : undefined}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-[var(--primary)] px-3.5 py-2 text-xs font-semibold text-[var(--primary-contrast)] transition hover:bg-[var(--primary-hover)] disabled:opacity-60"
        >
          {state === 'starting' ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          {startButtonLabel(state, startLabel)}
        </button>
      )}
      <div className="max-w-xs space-y-0.5 text-right text-[11px]" aria-live="polite">
        {statusRead === 'unavailable' && (
          <p className="text-[var(--danger)]">수집 상태를 불러오지 못했습니다.</p>
        )}
        {statusRead === 'rechecking' && (
          <p className="text-[var(--text-muted)]">{COLLECTION_SOURCE_STATUS_RECHECKING_MESSAGE}</p>
        )}
        {startBlockedReason && !active && (
          <p className="text-[var(--warning)]">{startBlockedReason}</p>
        )}
        {notice && (
          <p className={NOTICE_CLASS[notice.tone]}>
            {notice.tone !== 'info' && <AlertTriangle className="mr-1 inline h-3 w-3" />}
            {notice.message}
          </p>
        )}
      </div>
    </div>
  );
}
