'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight, Link2 } from 'lucide-react';
import { ChannelSkuAvailabilityListResponseSchema } from '@kiditem/shared/channel-sku-availability';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { formatNumber } from '@/lib/utils';

const SUMMARY_PARAMS = { page: '1', limit: '1' } as const;

export function ChannelSkuInventorySummary() {
  const { data, error, isLoading } = useQuery({
    queryKey: queryKeys.channelSkuAvailability.list(SUMMARY_PARAMS),
    queryFn: () => apiClient.getParsed(
      '/api/channels/sku-availability?page=1&limit=1',
      ChannelSkuAvailabilityListResponseSchema,
    ),
  });

  const matched = data
    ? Math.max(0, data.summary.total - data.summary.unmatched - data.summary.needsReview)
    : null;

  return (
    <section className="rounded-xl border border-[var(--border-subtle)] bg-[var(--card-bg)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
            <Link2 size={16} aria-hidden="true" /> 채널 SKU 전체 현황
          </h2>
          <p className="mt-1 text-xs text-[var(--text-tertiary)]">
            쇼핑몰 상품별 구성과 판매 가능 수량입니다. 카탈로그 상품에 자동 귀속하지 않습니다.
          </p>
        </div>
        <a
          href="/product-hub/matching"
          className="inline-flex items-center gap-1 rounded-lg bg-[var(--primary-soft)] px-3 py-2 text-xs font-bold text-[var(--primary)]"
        >
          쇼핑몰 상품 매칭 관리 <ArrowUpRight size={13} aria-hidden="true" />
        </a>
      </div>

      {isLoading ? (
        <p className="mt-3 text-xs text-[var(--text-tertiary)]">채널 SKU 현황을 불러오는 중입니다.</p>
      ) : error || !data ? (
        <p className="mt-3 text-xs text-amber-700">채널 SKU 현황을 불러오지 못했습니다.</p>
      ) : (
        <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
          <SummaryMetric label="전체" value={data.summary.total} />
          <SummaryMetric label="매칭 완료" value={matched ?? 0} />
          <SummaryMetric label="판매 가능" value={data.summary.inStock} />
          <SummaryMetric label="미매칭" value={data.summary.unmatched} />
          <SummaryMetric label="검토 필요" value={data.summary.needsReview} />
        </dl>
      )}
    </section>
  );
}

function SummaryMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-[var(--surface-sunken)] px-3 py-2">
      <dt className="text-[11px] text-[var(--text-tertiary)]">{label}</dt>
      <dd className="mt-0.5 text-sm font-extrabold tabular-nums text-[var(--text-primary)]">
        {formatNumber(value)}
      </dd>
    </div>
  );
}
