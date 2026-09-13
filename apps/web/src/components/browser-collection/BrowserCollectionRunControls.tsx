'use client';

import type { BrowserCollectionSessionView } from '@kiditem/shared/browser-collection-session';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import {
  isBrowserCollectionSessionLocallyRunning,
  sendBrowserCollectionControl,
  type BrowserCollectionControlAction,
  updateBrowserCollectionSessionCache,
} from '@/lib/browser-collection-session';
import { cn } from '@/lib/utils';

type BrowserCollectionRunControlsProps = {
  session: BrowserCollectionSessionView;
  className?: string;
  showCancel?: boolean;
};

export function BrowserCollectionRunControls({
  session,
  className,
  showCancel = true,
}: BrowserCollectionRunControlsProps) {
  const queryClient = useQueryClient();
  const [busyControlAction, setBusyControlAction] =
    useState<BrowserCollectionControlAction | null>(null);
  const isRunning = isBrowserCollectionSessionLocallyRunning(session);
  const needsAttention = session.attention !== null;

  if (!isRunning && !needsAttention) return null;

  const runControl = async (action: BrowserCollectionControlAction) => {
    if (busyControlAction !== null) return;
    setBusyControlAction(action);
    try {
      const response = await sendBrowserCollectionControl(session.attemptId, action);
      if (response) {
        updateBrowserCollectionSessionCache(queryClient, response);
      }
    } catch (error) {
      console.warn(`[browser-collection] ${action} failed`, error);
      toast.error(
        error instanceof Error
          ? error.message
          : '브라우저 수집 제어 요청에 실패했습니다.',
      );
    } finally {
      setBusyControlAction(null);
    }
  };

  const progress =
    session.progress.total > 0
      ? Math.min(1, session.progress.current / session.progress.total)
      : 0;
  const buttonClassName =
    'rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-sm text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] disabled:cursor-wait disabled:opacity-60';
  const showOpenTabButton = needsAttention && Boolean(session.attention?.canOpenTab);
  const showCancelButton = showCancel && (isRunning || needsAttention);
  const hasAnyControlButton = showOpenTabButton || showCancelButton;

  return (
    <div
      className={cn(
        'rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] p-3',
        className,
      )}
    >
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3 text-sm text-[var(--text-secondary)]">
          <span>
            진행 {session.progress.current} / {session.progress.total}
          </span>
        </div>
        <div
          className="h-1.5 overflow-hidden rounded-full bg-[var(--surface-sunken)]"
          role="progressbar"
          aria-valuenow={Math.round(progress * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="h-full bg-[var(--primary)] transition-[width]"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
      </div>

      {needsAttention && session.attention && (
        <p className="mt-2 text-sm text-amber-700">{session.attention.message}</p>
      )}

      {hasAnyControlButton && (
        <div className="mt-3 flex flex-wrap gap-2">
          {showOpenTabButton && (
            <button
              type="button"
              className={buttonClassName}
              disabled={busyControlAction !== null}
              onClick={() => void runControl('openCollectionAttentionTab')}
            >
              확인 탭 열기
            </button>
          )}
          {showCancelButton && (
            <button
              type="button"
              className={buttonClassName}
              disabled={busyControlAction !== null}
              onClick={() => void runControl('cancelCollectionSession')}
            >
              중단
            </button>
          )}
        </div>
      )}
    </div>
  );
}
