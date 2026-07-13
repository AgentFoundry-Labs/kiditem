'use client';

import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { CircleDollarSign } from 'lucide-react';
import { queryKeys } from '@/lib/query-keys';
import { formatNumber } from '@/lib/utils';
import { listSellpiaInventorySkus, sellpiaInventoryKeyParams } from '../../_shared/inventory-api';
import { ErrorState, LoadingState, ProjectionCard, SimpleTable } from './ZeroItems';

export default function StockRetention() {
  const [page, setPage] = useState(1);
  const params = { page, limit: 100 };
  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.inventory.assetList(sellpiaInventoryKeyParams(params)),
    queryFn: () => listSellpiaInventorySkus(params),
    placeholderData: keepPreviousData,
  });

  return <ProjectionCard title="재고자산" description="매입가가 있는 Sellpia SKU만 평가액에 포함합니다." icon={CircleDollarSign}>
    {data ? <div className="grid gap-3 sm:grid-cols-3"><Metric label="평가 재고자산" value={`${formatNumber(data.summary.pricedAssetValue)}원`} /><Metric label="총 재고수량" value={`${formatNumber(data.summary.totalUnits)}개`} /><Metric label="가격 미등록" value={`${formatNumber(data.summary.unpricedSkuCount)}개`} /></div> : null}
    {error ? <ErrorState /> : isLoading ? <LoadingState /> : <SimpleTable headings={['Sellpia 코드', '상품명', '현재고', '매입가', '재고자산']} rows={(data?.items ?? []).map((item) => [item.code, item.name, `${formatNumber(item.currentStock)}개`, item.purchasePrice === null ? '가격 미등록' : `${formatNumber(item.purchasePrice)}원`, item.stockValue === null ? '-' : `${formatNumber(item.stockValue)}원`])} empty="재고자산 데이터가 없습니다." pagination={{ page: data?.page ?? page, limit: data?.limit ?? 100, total: data?.total ?? 0, onPageChange: setPage }} />}
  </ProjectionCard>;
}

function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4"><p className="text-sm text-[var(--text-secondary)]">{label}</p><p className="mt-1 text-xl font-semibold">{value}</p></div>; }
