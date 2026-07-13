'use client';

import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Ban } from 'lucide-react';
import { queryKeys } from '@/lib/query-keys';
import { formatNumber } from '@/lib/utils';
import { channelSkuAvailabilityKeyParams, listChannelSkuAvailability } from '../../_shared/inventory-api';
import { ErrorState, LoadingState, ProjectionCard, SimpleTable } from './ZeroItems';

export default function OutOfStock() {
  const [page, setPage] = useState(1);
  const params = { status: 'out_of_stock' as const, page, limit: 100 };
  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.channelSkuAvailability.list(channelSkuAvailabilityKeyParams(params)),
    queryFn: () => listChannelSkuAvailability(params),
    placeholderData: keepPreviousData,
  });

  return <ProjectionCard title="채널 판매 가능 재고 0" description="매핑된 구성품 중 병목 때문에 현재 판매 가능 수량이 0인 채널 SKU입니다." icon={Ban}>
    {error ? <ErrorState /> : isLoading ? <LoadingState /> : <SimpleTable
      headings={['채널', '상품', '옵션 SKU', '판매 가능', '병목 구성품']}
      rows={(data?.items ?? []).map((item) => [
        item.channelAccount.name,
        item.product.displayName ?? item.product.registeredName ?? item.product.externalProductId,
        item.sku.optionName ?? item.sku.sellerSku ?? item.sku.externalSkuId,
        item.sku.sellableStock === null ? '계산 불가' : `${formatNumber(item.sku.sellableStock)}개`,
        item.components.filter((component) => component.isBottleneck).map((component) => component.code).join(', ') || '-',
      ])}
      empty="판매 가능 재고가 0인 채널 SKU가 없습니다."
      pagination={{ page: data?.page ?? page, limit: data?.limit ?? 100, total: data?.total ?? 0, onPageChange: setPage }}
    />}
  </ProjectionCard>;
}
