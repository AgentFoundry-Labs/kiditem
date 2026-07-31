'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { getChannelRecipeAutomationPreview } from '@/lib/channel-recipe-automation-api';
import { friendlyError } from '@/lib/api-error';
import { queryKeys } from '@/lib/query-keys';
import { formatNumber } from '@/lib/utils';
import type { ScopedChannelRecipeAutomationResult } from '@kiditem/shared/channel-recipe-automation';

export function RocketDeterministicMatchingPanel({
  channelAccountId,
  latestAutomation,
}: {
  channelAccountId: string;
  latestAutomation?: ScopedChannelRecipeAutomationResult;
}) {
  const preview = useQuery({
    queryKey: queryKeys.channelProductMappings.recipeAutomationPreview(channelAccountId),
    queryFn: () => getChannelRecipeAutomationPreview(channelAccountId),
    enabled: Boolean(channelAccountId),
    staleTime: 0,
  });
  const previousAutomation = useRef(latestAutomation);

  useEffect(() => {
    if (!latestAutomation || previousAutomation.current === latestAutomation) return;
    previousAutomation.current = latestAutomation;
    void preview.refetch();
  }, [latestAutomation, preview]);

  const data = preview.data;
  const currentStatus = data ? productStatusCounts(data.productGroups) : null;
  const latestMatched = latestAutomation
    ? Math.max(
        0,
        latestAutomation.evaluatedProducts
          - latestAutomation.quantityReviewProducts
          - latestAutomation.operatorReviewProducts
          - latestAutomation.blockedProducts,
      )
    : 0;

  return (
    <section
      aria-label="로켓 Sellpia 구성 매칭"
      className="rounded-xl border border-purple-200 bg-purple-50/60 p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-bold text-slate-900">상품·재고 매칭 상태</h3>
          <p className="mt-1 text-sm text-slate-600">
            확정적인 후보는 이번 수집에서 자동 적용합니다. 애매한 후보의 검토와 수정은 상품 매칭 센터에서 진행합니다.
          </p>
        </div>
      </div>

      {latestAutomation ? (
        <div
          role="status"
          className="mt-3 rounded-lg border border-purple-200 bg-white px-3 py-2 text-sm text-slate-700"
        >
          <p className="font-bold text-purple-800">
            매칭 완료 {formatNumber(latestMatched)}개
            {' · '}매칭 수량 검토 {formatNumber(latestAutomation.quantityReviewProducts)}개
          </p>
          <p className="mt-0.5 text-xs text-slate-600">
            미매칭 상품 {formatNumber(
              latestAutomation.operatorReviewProducts + latestAutomation.blockedProducts,
            )}개
          </p>
        </div>
      ) : null}

      {preview.isLoading ? (
        <p className="mt-3 inline-flex items-center gap-2 text-sm text-slate-500">
          <Loader2 size={14} className="animate-spin" /> 매칭 근거 계산 중
        </p>
      ) : data && currentStatus ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <Metric
            channelAccountId={channelAccountId}
            status="matched"
            label="매칭 완료"
            value={currentStatus.matched}
          />
          <Metric
            channelAccountId={channelAccountId}
            status="quantity_review"
            label="매칭 수량 검토"
            value={currentStatus.quantityReview}
          />
          <Metric
            channelAccountId={channelAccountId}
            status="unmatched"
            label="미매칭 상품"
            value={currentStatus.unmatched}
          />
        </div>
      ) : null}
      {preview.error ? (
        <p role="alert" className="mt-3 text-sm text-rose-700">
          {friendlyError(preview.error) ?? '매칭 정보를 불러오지 못했습니다.'}
        </p>
      ) : null}
    </section>
  );
}

function productStatusCounts(
  groups: Array<{ decision: 'auto_apply' | 'quantity_review' | 'operator_review' | 'blocked' | 'already_configured' }>,
) {
  return groups.reduce((counts, group) => {
    if (group.decision === 'auto_apply' || group.decision === 'already_configured') {
      counts.matched += 1;
    } else if (group.decision === 'quantity_review') {
      counts.quantityReview += 1;
    } else {
      counts.unmatched += 1;
    }
    return counts;
  }, { matched: 0, quantityReview: 0, unmatched: 0 });
}

function Metric({ channelAccountId, status, label, value }: {
  channelAccountId: string;
  status: 'matched' | 'quantity_review' | 'unmatched';
  label: string;
  value: number;
}) {
  return (
    <Link
      href={`/product-hub/matching?channelAccountId=${encodeURIComponent(channelAccountId)}&status=${status}`}
      className="rounded-lg border border-purple-100 bg-white px-3 py-2 text-sm font-bold text-slate-700 hover:border-purple-300 hover:text-purple-800"
    >
      {label} {formatNumber(value)}
    </Link>
  );
}
