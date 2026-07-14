'use client';

import { useEffect, useState } from 'react';
import { BrowserCollectionRunIdSchema } from '@kiditem/shared/browser-collection-session';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, CheckCircle2, Loader2, Sunrise, X } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import type { ReadinessResponse } from '@kiditem/shared/readiness';
import { BrowserCollectionRunControls } from '@/components/browser-collection/BrowserCollectionRunControls';
import { useBrowserCollectionSession } from '@/hooks/useBrowserCollectionSession';
import { apiClient } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import {
  isDismissedForSession,
  isDismissedForToday,
  markDismissedForSession,
  markDismissedForToday,
} from './readiness/readiness-dismissal';
import {
  buildReadinessModalViewModel,
  shouldAutoOpen,
  type AutoOpenWhen,
} from './readiness/readiness-modal-model';
import { ActionCheckCard, AdSyncRow, CompactOkRow } from './readiness/ReadinessRows';
import { readinessCollectionProducer } from './readiness/readiness-extension-collection';
import { useReadinessCollection } from './readiness/useReadinessCollection';

interface ReadinessModalProps {
  /** 외부 controlled open. undefined 면 autoOpenWhen 기준으로 자동 열림. */
  open?: boolean;
  /** 외부 controlled close handler. */
  onClose?: () => void;
  /** uncontrolled 자동 오픈 기준. 기본값은 기존 동작과 같은 anyIssue. */
  autoOpenWhen?: AutoOpenWhen;
}

export default function ReadinessModal({
  open: controlledOpen,
  onClose,
  autoOpenWhen = 'anyIssue',
}: ReadinessModalProps = {}) {
  const searchParams = useSearchParams();
  const collectionRunResult = BrowserCollectionRunIdSchema.safeParse(
    searchParams.get('collectionRun'),
  );
  const collectionRun = collectionRunResult.success
    ? collectionRunResult.data
    : null;
  const collectionSessionQuery = useBrowserCollectionSession(collectionRun);
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;

  const query = useQuery({
    queryKey: ['readiness'],
    queryFn: () => apiClient.get<ReadinessResponse>('/api/readiness'),
    refetchOnWindowFocus: false,
  });
  const view = buildReadinessModalViewModel(query.data);
  const { pendingKey, handleCollect } = useReadinessCollection({
    refetchReadiness: () => query.refetch(),
  });

  const setOpen = (value: boolean) => {
    if (isControlled) {
      if (!value) onClose?.();
      return;
    }
    setInternalOpen(value);
  };

  useEffect(() => {
    if (isControlled) return;
    if (!query.data) return;
    if (collectionRun) {
      setInternalOpen(true);
      return;
    }
    if (!shouldAutoOpen(query.data, autoOpenWhen)) return;
    if (isDismissedForToday()) return;
    if (isDismissedForSession()) return;
    setInternalOpen(true);
  }, [query.data, isControlled, autoOpenWhen, collectionRun]);

  const close = () => {
    if (!isControlled) {
      markDismissedForSession();
    }
    setOpen(false);
  };

  const dismissToday = () => {
    markDismissedForToday();
    setOpen(false);
  };

  if (!open) return null;

  const data = query.data;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[var(--overlay)] p-4 backdrop-blur-sm animate-in">
      <div
        className={cn(
          'relative w-full max-w-2xl overflow-hidden rounded-2xl',
          'border border-[var(--border-subtle)] bg-[var(--surface-raised)]',
          'shadow-[var(--shadow-md)] animate-scale',
        )}
      >
        <button
          onClick={close}
          className={cn(
            'absolute right-4 top-4 z-10 rounded-lg p-1.5 transition-colors',
            'text-[var(--text-muted)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-secondary)]',
          )}
          aria-label="닫기"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="px-7 pt-8 pb-6 text-center">
          <div
            className={cn(
              'mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl',
              data?.allOk
                ? 'bg-emerald-50 text-emerald-500 dark:bg-emerald-500/15 dark:text-emerald-400'
                : 'bg-[var(--primary-soft)] text-[var(--primary)]',
            )}
          >
            {data?.allOk ? <CheckCircle2 className="h-7 w-7" /> : <Sunrise className="h-7 w-7" />}
          </div>
          <h2 className="text-xl font-semibold tracking-tight text-[var(--text-primary)]">
            {view.headline}
          </h2>
          <p className="mt-1.5 text-sm text-[var(--text-tertiary)]">{view.subhead}</p>

          <div className="mx-auto mt-5 max-w-[280px]">
            <div className="text-center text-[11px] font-medium text-[var(--text-tertiary)]">
              {view.doneCount} / {view.totalCount} 준비됨
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[var(--surface-sunken)]">
              <div
                className={cn(
                  'h-full rounded-full transition-all duration-500',
                  data?.allOk ? 'bg-emerald-500' : 'bg-[var(--primary)]',
                )}
                style={{ width: `${view.progressRatio * 100}%` }}
              />
            </div>
          </div>
        </div>

        <div className="max-h-[55vh] overflow-y-auto border-t border-[var(--border-subtle)] bg-[var(--surface-sunken)] px-5 py-4">
          {query.isLoading ? (
            <div className="flex items-center justify-center py-10 text-[var(--text-muted)]">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : (
            <>
              <div className="space-y-2.5">
                {collectionSessionQuery.data && (
                  <BrowserCollectionRunControls
                    session={collectionSessionQuery.data}
                    onWebRestart={async (session) => {
                      const restartCheck = view.checks.find(
                        (check) =>
                          readinessCollectionProducer(check.key) ===
                          session.producer,
                      );
                      if (!restartCheck || restartCheck.key === 'rocket_sales') {
                        return;
                      }
                      await handleCollect(restartCheck, session.runId);
                    }}
                  />
                )}
                {view.actionChecks.map((check) => (
                  <ActionCheckCard
                    key={check.key}
                    check={check}
                    onCollect={(nextCheck) => {
                      void handleCollect(nextCheck);
                    }}
                    pending={pendingKey === check.key}
                  />
                ))}
                <AdSyncRow
                  onComplete={() => {
                    void query.refetch();
                  }}
                />
              </div>

              {view.okChecks.length > 0 && (
                <div className="mt-4">
                  <p className="mb-2 px-1 text-[11px] font-medium uppercase tracking-wide text-[var(--text-muted)]">
                    이미 준비된 항목
                  </p>
                  <div className="space-y-1.5">
                    {view.okChecks.map((check) => (
                      <CompactOkRow key={check.key} check={check} />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-[var(--border-subtle)] bg-[var(--surface)] px-6 py-4">
          {!isControlled ? (
            <button
              onClick={dismissToday}
              className="text-sm font-medium text-[var(--text-tertiary)] transition-colors hover:text-[var(--text-secondary)]"
            >
              오늘 하루 보지 않기
            </button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            <button
              onClick={close}
              className={cn(
                'inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition-all',
                data?.allOk
                  ? 'bg-[var(--primary)] text-[var(--primary-contrast)] shadow-[var(--shadow-sm)] hover:bg-[var(--primary-hover)]'
                  : 'cursor-not-allowed bg-[var(--surface-sunken)] text-[var(--text-muted)]',
              )}
              disabled={!data?.allOk}
            >
              대시보드 열기
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
