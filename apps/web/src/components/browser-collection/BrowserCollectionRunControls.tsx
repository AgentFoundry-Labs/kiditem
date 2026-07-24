'use client';

import type { BrowserCollectionSessionView } from '@kiditem/shared/browser-collection-session';
import { useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  sendBrowserCollectionControl,
  syncBrowserCollectionAlert,
  type BrowserCollectionControlAction,
  updateBrowserCollectionSessionCache,
} from '@/lib/browser-collection-session';
import { cn } from '@/lib/utils';

type BrowserCollectionRunControlsProps = {
  session: BrowserCollectionSessionView;
  onWebRestart: (session: BrowserCollectionSessionView) => void | Promise<void>;
  webRestartUnavailableMessage?: string;
  className?: string;
  showCancel?: boolean;
};

export function BrowserCollectionRunControls({
  session,
  onWebRestart,
  webRestartUnavailableMessage,
  className,
  showCancel = true,
}: BrowserCollectionRunControlsProps) {
  const queryClient = useQueryClient();
  const [busyControlAction, setBusyControlAction] =
    useState<BrowserCollectionControlAction | null>(null);
  const [isRestarting, setIsRestarting] = useState(false);
  const controlInFlightRef = useRef(false);
  const restartInFlightRef = useRef(false);
  const isRunning = session.status === 'running';
  const needsAttention = session.status === 'attention_required';

  if (!isRunning && !needsAttention) return null;

  const runControl = async (action: BrowserCollectionControlAction) => {
    const canRunDuringRestart = action === 'cancelCollectionSession';
    if (
      controlInFlightRef.current ||
      (restartInFlightRef.current && !canRunDuringRestart)
    ) {
      return;
    }
    controlInFlightRef.current = true;
    setBusyControlAction(action);
    try {
      const response = await sendBrowserCollectionControl(session.runId, action);
      if (response) {
        updateBrowserCollectionSessionCache(queryClient, response);
        await syncBrowserCollectionAlert(response);
      }
    } catch (error) {
      console.warn(`[browser-collection] ${action} failed`, error);
      toast.error(
        error instanceof Error
          ? error.message
          : '브라우저 수집 제어 요청에 실패했습니다.',
      );
    } finally {
      controlInFlightRef.current = false;
      setBusyControlAction(null);
    }
  };

  const restart = async () => {
    if (restartInFlightRef.current || controlInFlightRef.current) return;
    restartInFlightRef.current = true;
    setIsRestarting(true);
    try {
      if (session.restartStrategy === 'web') {
        await onWebRestart(session);
      } else {
        const response = await sendBrowserCollectionControl(
          session.runId,
          'restartCollectionSession',
        );
        if (response) {
          updateBrowserCollectionSessionCache(queryClient, response);
          await syncBrowserCollectionAlert(response);
        }
      }
    } catch (error) {
      console.warn('[browser-collection] restart failed', error);
    } finally {
      restartInFlightRef.current = false;
      setIsRestarting(false);
    }
  };

  const progress =
    session.progress.total > 0
      ? Math.min(1, session.progress.current / session.progress.total)
      : 0;
  const buttonClassName =
    'rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-sm text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] disabled:cursor-wait disabled:opacity-60';
  const isControlBusy = busyControlAction !== null;
  const isRestartControlBusy = isRestarting || isControlBusy;

  return (
    <div
      className={cn(
        'rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] p-3',
        className,
      )}
    >
      {isRunning && (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3 text-sm text-[var(--text-secondary)]">
            <span>
              진행 {session.progress.current} / {session.progress.total}
            </span>
            <span>시도 {session.attempt}</span>
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
      )}

      {needsAttention && session.attention && (
        <p className="text-sm text-amber-700">{session.attention.message}</p>
      )}
      {needsAttention && session.restartStrategy === 'web' && webRestartUnavailableMessage && (
        <p className="mt-2 text-sm text-amber-700">{webRestartUnavailableMessage}</p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {needsAttention && session.attention?.canOpenTab && (
          <button
            type="button"
            className={buttonClassName}
            disabled={isRestartControlBusy}
            onClick={() => void runControl('openCollectionAttentionTab')}
          >
            확인 탭 열기
          </button>
        )}
        {needsAttention && !(
          session.restartStrategy === 'web' && webRestartUnavailableMessage
        ) && (
          <button
            type="button"
            className={buttonClassName}
            disabled={isRestartControlBusy}
            onClick={() => void restart()}
          >
            처음부터 재실행
          </button>
        )}
        {showCancel && (
          <button
            type="button"
            className={buttonClassName}
            disabled={isControlBusy}
            onClick={() => void runControl('cancelCollectionSession')}
          >
            중단
          </button>
        )}
      </div>
    </div>
  );
}
