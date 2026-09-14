'use client';

import { AlertTriangle, Loader2, RefreshCw, XCircle } from 'lucide-react';
import type {
  CollectionControlNotice,
  CollectionControlView,
} from '@/hooks/use-collection-source-control';
import { COLLECTION_SOURCE_STATUS_RECHECKING_MESSAGE } from '@/lib/collection-source-status-query';
import { cn } from '@/lib/utils';

const NOTICE_CLASS: Record<CollectionControlNotice['tone'], string> = {
  refused: 'text-amber-700',
  error: 'text-[var(--danger)]',
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
  onStart,
  onStop,
  startBlockedReason = null,
  startTitle,
  runningLink,
  className,
}: {
  control: CollectionControlView;
  startLabel: string;
  onStart: () => void;
  onStop: () => void;
  /** A route-owned reason the start cannot be requested yet, shown in place of the start. */
  startBlockedReason?: string | null;
  /** What the start collects, for the start button's tooltip. */
  startTitle?: string;
  /** The screen that shows the running collection's progress and attention, opened in a new tab. */
  runningLink?: Readonly<{ href: string; label: string }>;
  className?: string;
}) {
  const { state, running, notice, statusRead, canStop } = control;
  const active = state === 'running' || state === 'stopping';
  const canRequestStart = (state === 'idle' || state === 'refused') && !startBlockedReason;

  return (
    <div className={cn('flex shrink-0 flex-col items-end gap-1.5', className)}>
      {active ? (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--primary)]">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {running?.scopeLabel ? `수집 중 · ${running.scopeLabel}` : '수집 중'}
          </span>
          {canStop && (
            <button
              type="button"
              onClick={onStop}
              disabled={state === 'stopping'}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] px-3 py-2 text-xs font-semibold text-[var(--text-secondary)] transition hover:bg-[var(--surface-sunken)] disabled:opacity-60"
            >
              <XCircle className="h-3.5 w-3.5" />
              {state === 'stopping' ? '중단 요청 중…' : '수집 중단'}
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
      ) : (
        <button
          type="button"
          onClick={onStart}
          disabled={!canRequestStart}
          title={startTitle}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--primary)] px-3.5 py-2 text-xs font-semibold text-[var(--primary-contrast)] transition hover:bg-[var(--primary-hover)] disabled:opacity-60"
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
          <p className="text-amber-700">{startBlockedReason}</p>
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
