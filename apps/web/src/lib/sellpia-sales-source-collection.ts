'use client';

import type { OperationListResponse } from '@kiditem/shared/operation';
import { SELLPIA_SALES_KIND } from '@kiditem/shared/sellpia-operations';
import type { CollectionSourceAdapter } from '@/hooks/use-collection-source-control';
import { queryKeys } from '@/lib/query-keys';
import { sellpiaOperationControl } from '@/lib/sellpia-operations';

export type SellpiaSalesCollectionRange = Readonly<{ from: string; to: string }>;

/** The dates a readiness check asks Sellpia sales to repair; none leaves the window to the owner. */
export function sellpiaSalesReadinessRange(check: Readonly<{
  referenceDate?: string | null;
  expectedDates?: readonly string[] | null;
  missingDates?: readonly string[] | null;
}>): SellpiaSalesCollectionRange | undefined {
  const targetDates = check.missingDates?.length
    ? [...check.missingDates]
    : check.expectedDates?.length
      ? [check.expectedDates[0]!]
      : check.referenceDate
        ? [check.referenceDate]
        : [];
  const sorted = [...targetDates].sort();
  if (sorted.length === 0) return undefined;
  const nextReferenceDate = check.referenceDate
    ? new Date(`${check.referenceDate}T00:00:00.000Z`)
    : null;
  if (nextReferenceDate && !Number.isNaN(nextReferenceDate.getTime())) {
    nextReferenceDate.setUTCDate(nextReferenceDate.getUTCDate() + 1);
  }
  return {
    from: sorted[0]!,
    // Readiness judges through yesterday; the home month total reads through today.
    to: nextReferenceDate && !Number.isNaN(nextReferenceDate.getTime())
      ? nextReferenceDate.toISOString().slice(0, 10)
      : sorted.at(-1)!,
  };
}

/**
 * 셀피아 판매현황(몰별 일매출) 수집 = 실행 kind `analytics.sellpia_sales`(KID-361 J2). 화면이 범위를 주면 그 창을,
 * 안 주면 owner 기본 창(오늘까지 93일)을 확장에 시작시킨다. 새 성공 실행은 매출 화면·readiness·Wing 일매출 읽기를 새로 한다.
 */
export const sellpiaSalesCollection: CollectionSourceAdapter<
  OperationListResponse,
  SellpiaSalesCollectionRange | void
> = sellpiaOperationControl<SellpiaSalesCollectionRange | void>({
  kind: SELLPIA_SALES_KIND,
  sourceKey: 'analytics.sellpia_sales',
  label: '셀피아 판매현황 수집',
  scope: (range) => (range ? { startDate: range.from, endDate: range.to } : {}),
  scopeLabel: (operation) => {
    const window = operation.window;
    if (!window) return null;
    return window.start === window.end ? window.start : `${window.start} ~ ${window.end}`;
  },
  onNewComplete: (queryClient) => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.sellpiaSalesAll() });
    void queryClient.invalidateQueries({ queryKey: ['readiness'] });
    void queryClient.invalidateQueries({ queryKey: ['traffic'] });
  },
});
