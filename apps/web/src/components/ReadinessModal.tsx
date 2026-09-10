'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, CheckCircle2, Loader2, Sunrise, X } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import type { CoupangCatalogCollectionLinkResult } from '@/app/(product-pipeline)/product-pipeline/registered-products/lib/channel-listings-api';
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
import { ActionCheckCard, AdKeywordRow, AdSyncRow, CompactOkRow, StockSyncRow } from './readiness/ReadinessRows';
import { useReadinessCollection } from './readiness/useReadinessCollection';
import type { ReadinessResponse } from '@kiditem/shared/readiness';

interface ReadinessModalProps {
  /** 외부 controlled open. 자동 오픈을 쓰면 false로 유지하고 onRequestOpen을 함께 전달한다. */
  open?: boolean;
  /** 외부 controlled close handler. */
  onClose?: () => void;
  /** 자동 오픈 조건이 충족됐을 때 외부 owner에게 여는 동작을 요청한다. */
  onRequestOpen?: () => void;
  /** Route-owned catalog handoff. Passing null prevents a stale window query from being reused. */
  catalogLink?: CoupangCatalogCollectionLinkResult | null;
  /** uncontrolled 자동 오픈 기준. 기본값은 기존 동작과 같은 anyIssue. */
  autoOpenWhen?: AutoOpenWhen;
}

export default function ReadinessModal({
  open: controlledOpen,
  onClose,
  onRequestOpen,
  catalogLink,
  autoOpenWhen = 'anyIssue',
}: ReadinessModalProps = {}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;

  const query = useQuery({
    queryKey: ['readiness'],
    queryFn: () => apiClient.get<ReadinessResponse>('/api/readiness'),
    // A controlled dashboard owner still needs a read while closed so it can
    // decide whether to request the first automatic open.
    enabled: !isControlled || open || Boolean(onRequestOpen),
    // 전역 기본값(60초)을 쓰면 닫았다 다시 연 controlled 모달이 fresh cache만
    // 재사용할 수 있다. 열 때마다 현재 DB 수집 상태를 확인하도록 즉시 stale 처리한다.
    staleTime: 0,
    refetchOnWindowFocus: false,
  });
  const view = buildReadinessModalViewModel(query.data);
  const { pendingKey, handleCollect, catalog } = useReadinessCollection({
    refetchReadiness: () => query.refetch(),
    catalogEnabled: open,
    catalogLink,
  });
  const catalogOkCheck = view.okChecks.find((check) => check.key === 'coupang_products');
  const compactOkChecks = view.okChecks.filter((check) => check.key !== 'coupang_products');

  const setOpen = (value: boolean) => {
    if (isControlled) {
      if (!value) onClose?.();
      return;
    }
    setInternalOpen(value);
  };

  useEffect(() => {
    if (!query.data) return;
    if (!shouldAutoOpen(query.data, autoOpenWhen)) return;
    if (isDismissedForToday()) return;
    if (isDismissedForSession()) return;
    if (isControlled) {
      if (!open) onRequestOpen?.();
      return;
    }
    setInternalOpen(true);
  }, [autoOpenWhen, isControlled, onRequestOpen, open, query.data]);

  const close = () => {
    // Manual close should not immediately reopen the automatic prompt while
    // the operator is still on the same session.
    markDismissedForSession();
    setOpen(false);
  };

  const dismissToday = () => {
    markDismissedForToday();
    setOpen(false);
  };

  if (!open) return null;

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
              view.allOk
                ? 'bg-emerald-50 text-emerald-500 dark:bg-emerald-500/15 dark:text-emerald-400'
                : 'bg-[var(--primary-soft)] text-[var(--primary)]',
            )}
          >
            {view.allOk ? <CheckCircle2 className="h-7 w-7" /> : <Sunrise className="h-7 w-7" />}
          </div>
          <h2 className="text-xl font-semibold tracking-tight text-[var(--text-primary)]">
            {view.headline}
          </h2>
          <p className="mt-1.5 text-sm text-[var(--text-tertiary)]">{view.subhead}</p>

          <div className="mx-auto mt-5 max-w-[280px]">
            <div className="text-center text-[11px] font-medium text-[var(--text-tertiary)]">
              필수 데이터 {view.doneCount} / {view.totalCount} 완료
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[var(--surface-sunken)]">
              <div
                className={cn(
                  'h-full rounded-full transition-all duration-500',
                  view.allOk ? 'bg-emerald-500' : 'bg-[var(--primary)]',
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
            <div className="space-y-5">
              <section aria-labelledby="readiness-required-heading">
                <div className="mb-2 flex items-center justify-between px-1">
                  <div>
                    <h3
                      id="readiness-required-heading"
                      className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-secondary)]"
                    >
                      필수 데이터
                    </h3>
                    <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
                      이 항목만 위 준비도 숫자에 포함돼요.
                    </p>
                  </div>
                  <span className="text-[11px] font-semibold tabular-nums text-[var(--text-tertiary)]">
                    {view.doneCount}/{view.totalCount}
                  </span>
                </div>
                <div className="space-y-2.5">
                  {view.actionChecks.map((check) => (
                    <ActionCheckCard
                      key={check.key}
                      check={check}
                      onCollect={(nextCheck) => {
                        void handleCollect(nextCheck);
                      }}
                      pending={pendingKey === check.key}
                      catalog={check.key === 'coupang_products' ? catalog : undefined}
                    />
                  ))}
                  {catalogOkCheck && (
                    <ActionCheckCard
                      check={catalogOkCheck}
                      onCollect={(nextCheck) => {
                        void handleCollect(nextCheck);
                      }}
                      pending={pendingKey === catalogOkCheck.key}
                      catalog={catalog}
                    />
                  )}
                </div>

                {compactOkChecks.length > 0 && (
                  <div className="mt-3 space-y-1.5">
                    <p className="px-1 text-[11px] font-medium text-[var(--text-muted)]">
                      이미 준비된 항목
                    </p>
                    {compactOkChecks.map((check) => (
                      <CompactOkRow key={check.key} check={check} />
                    ))}
                  </div>
                )}
              </section>

              <section
                aria-labelledby="readiness-optional-heading"
                className="border-t border-[var(--border-subtle)] pt-4"
                data-readiness-optional-section
              >
                <div className="mb-2 px-1">
                  <h3
                    id="readiness-optional-heading"
                    className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-secondary)]"
                  >
                    추가 작업
                  </h3>
                  <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
                    필요할 때 실행할 수 있어요. 준비도에는 포함되지 않아요.
                  </p>
                </div>
                <div className="space-y-2.5">
                  <AdSyncRow
                    onComplete={() => {
                      void query.refetch();
                    }}
                  />
                  <AdKeywordRow
                    onComplete={() => {
                      void query.refetch();
                    }}
                  />
                  <StockSyncRow />
                </div>
              </section>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-[var(--border-subtle)] bg-[var(--surface)] px-6 py-4">
          {!isControlled || onRequestOpen ? (
            <button
              onClick={dismissToday}
              className="text-sm font-medium text-[var(--text-tertiary)] transition-colors hover:text-[var(--text-secondary)]"
            >
              오늘 하루 보지 않기
            </button>
          ) : (
            <button
              onClick={close}
              className="text-sm font-medium text-[var(--text-tertiary)] transition-colors hover:text-[var(--text-secondary)]"
            >
              닫기
            </button>
          )}
          <div className="flex items-center gap-2">
            <button
              onClick={close}
              className={cn(
                'inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition-all',
                'bg-[var(--primary)] text-[var(--primary-contrast)] shadow-[var(--shadow-sm)] hover:bg-[var(--primary-hover)]',
              )}
            >
              대시보드로 돌아가기
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
