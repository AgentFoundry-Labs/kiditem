'use client';

import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Link2Off } from 'lucide-react';
import { queryKeys } from '@/lib/query-keys';
import { channelSkuAvailabilityKeyParams, listChannelSkuAvailability } from '../../_shared/inventory-api';
import { ErrorState, LoadingState, ProjectionCard, SimpleTable } from './ZeroItems';

export default function MappingAttention() {
  const [unmatchedPage, setUnmatchedPage] = useState(1);
  const [needsReviewPage, setNeedsReviewPage] = useState(1);
  const unmatched = useAttentionQueue('unmatched', unmatchedPage);
  const needsReview = useAttentionQueue('needs_review', needsReviewPage);

  return <ProjectionCard title="매핑 확인" description="미매칭 또는 검토가 필요한 채널 SKU입니다. 매칭 전에는 판매 가능 재고를 계산하지 않습니다." icon={Link2Off}>
    <div className="grid gap-6 xl:grid-cols-2">
      <AttentionQueue
        label="미매칭 SKU"
        empty="미매칭 SKU가 없습니다."
        result={unmatched}
        page={unmatchedPage}
        onPageChange={setUnmatchedPage}
      />
      <AttentionQueue
        label="검토 필요 SKU"
        empty="검토가 필요한 SKU가 없습니다."
        result={needsReview}
        page={needsReviewPage}
        onPageChange={setNeedsReviewPage}
      />
    </div>
  </ProjectionCard>;
}

function useAttentionQueue(status: 'unmatched' | 'needs_review', page: number) {
  const params = { status, page, limit: 100 };
  return useQuery({
    queryKey: queryKeys.channelSkuAvailability.list(channelSkuAvailabilityKeyParams(params)),
    queryFn: () => listChannelSkuAvailability(params),
    placeholderData: keepPreviousData,
  });
}

function AttentionQueue({ label, empty, result, page, onPageChange }: {
  label: string;
  empty: string;
  result: ReturnType<typeof useAttentionQueue>;
  page: number;
  onPageChange: (page: number) => void;
}) {
  const rows = (result.data?.items ?? []).map((item) => [
    item.channelAccount.name,
    item.product.displayName ?? item.product.registeredName ?? item.product.externalProductId,
    item.sku.optionName ?? item.sku.sellerSku ?? item.sku.externalSkuId,
    item.sku.mappingStatus === 'needs_review' ? '검토 필요' : '미매칭',
  ]);

  return <section aria-label={label} className="space-y-3">
    <h3 className="font-semibold">{label}</h3>
    {result.error ? <ErrorState /> : result.isLoading ? <LoadingState /> : <SimpleTable
      headings={['채널', '상품', '옵션 SKU', '상태']}
      rows={rows}
      empty={empty}
      pagination={{
        page: result.data?.page ?? page,
        limit: result.data?.limit ?? 100,
        total: result.data?.total ?? 0,
        onPageChange,
      }}
    />}
  </section>;
}
