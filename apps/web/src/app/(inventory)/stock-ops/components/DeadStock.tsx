'use client';

import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Gauge } from 'lucide-react';
import { queryKeys } from '@/lib/query-keys';
import { formatNumber } from '@/lib/utils';
import { channelSkuAvailabilityKeyParams, listChannelSkuAvailability } from '../../_shared/inventory-api';
import { ErrorState, LoadingState, ProjectionCard, SimpleTable } from './ZeroItems';

export default function DeadStock() {
  const [page, setPage] = useState(1);
  const params = { status: 'all' as const, hasBottleneck: true, page, limit: 100 };
  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.channelSkuAvailability.list(channelSkuAvailabilityKeyParams(params)),
    queryFn: () => listChannelSkuAvailability(params),
    placeholderData: keepPreviousData,
  });
  const rows = (data?.items ?? []).flatMap((item) => item.components
    .filter((component) => component.isBottleneck)
    .map((component) => [
      item.channelAccount.name,
      item.sku.optionName ?? item.sku.sellerSku ?? item.sku.externalSkuId,
      component.sellpiaProductCode,
      `${formatNumber(component.currentStock)}개 ÷ ${formatNumber(component.quantity)}`,
      `${formatNumber(component.componentCapacity)}개`,
    ]));

  return <ProjectionCard title="구성품 병목" description="서버가 계산한 채널 SKU별 최저 구성품 용량입니다. 화면에서 재고 공식을 다시 계산하지 않습니다." icon={Gauge}>
    {error ? <ErrorState /> : isLoading ? <LoadingState /> : <SimpleTable headings={['채널', '옵션 SKU', '병목 Sellpia 코드', '현재고 / 필요수량', '구성품 용량']} rows={rows} empty="확인할 병목 구성품이 없습니다." pagination={{ page: data?.page ?? page, limit: data?.limit ?? 100, total: data?.total ?? 0, onPageChange: setPage }} />}
  </ProjectionCard>;
}
