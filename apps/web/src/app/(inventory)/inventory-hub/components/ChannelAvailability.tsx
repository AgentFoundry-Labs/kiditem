'use client';

import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Link2 } from 'lucide-react';
import { Pagination } from '@/components/ui/Pagination';
import { queryKeys } from '@/lib/query-keys';
import { cn, formatNumber } from '@/lib/utils';
import {
  channelSkuAvailabilityKeyParams,
  listChannelSkuAvailability,
} from '../../_shared/inventory-api';
import type { ChannelSkuAvailabilityStatus } from '@kiditem/shared/channel-sku-availability';

const filters: { status: ChannelSkuAvailabilityStatus; label: string }[] = [
  { status: 'all', label: '전체' },
  { status: 'in_stock', label: '판매 가능' },
  { status: 'out_of_stock', label: '판매 가능 0' },
  { status: 'unmatched', label: '미매칭' },
  { status: 'needs_review', label: '검토 필요' },
];

export default function ChannelAvailability() {
  const [status, setStatus] = useState<ChannelSkuAvailabilityStatus>('all');
  const [page, setPage] = useState(1);
  const params = { status, page, limit: 50 };
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.channelSkuAvailability.list(channelSkuAvailabilityKeyParams(params)),
    queryFn: () => listChannelSkuAvailability(params),
    placeholderData: keepPreviousData,
  });

  return (
    <section className="space-y-4">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold"><Link2 className="h-5 w-5" aria-hidden="true" /> 채널 판매 가능 재고</h2>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">채널 SKU별 구성품 매핑을 서버에서 계산한 결과입니다.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {filters.map((filter) => (
          <button key={filter.status} type="button" onClick={() => { setStatus(filter.status); setPage(1); }} className={cn('rounded-lg border px-3 py-2 text-sm', status === filter.status ? 'border-[var(--primary)] bg-[var(--primary)] text-white' : 'border-[var(--border)] bg-[var(--surface)]')}>
            {filter.label}
          </button>
        ))}
      </div>
      <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px]">
            <thead><tr><th>채널</th><th>상품</th><th>옵션 SKU</th><th>매핑</th><th className="text-right">판매 가능</th><th>구성품</th></tr></thead>
            <tbody>
              {isLoading ? <tr><td colSpan={6} className="py-12 text-center">불러오는 중...</td></tr> : data?.items.length ? data.items.map((item) => (
                <tr key={item.sku.id}>
                  <td>{item.channelAccount.name}</td>
                  <td className="max-w-[220px] truncate">{item.product.displayName ?? item.product.registeredName ?? item.product.externalProductId}</td>
                  <td><p className="font-medium">{item.sku.optionName ?? '-'}</p><p className="font-mono text-xs text-[var(--text-secondary)]">{item.sku.sellerSku ?? item.sku.externalSkuId}</p></td>
                  <td>{item.sku.mappingStatus === 'matched' ? '매칭 완료' : item.sku.mappingStatus === 'needs_review' ? '검토 필요' : '미매칭'}</td>
                  <td className="text-right font-semibold">{item.sku.sellableStock === null ? '계산 불가' : `${formatNumber(item.sku.sellableStock)}개`}</td>
                  <td className="text-xs text-[var(--text-secondary)]">{item.components.length ? item.components.map((component) => `${component.code} × ${component.quantity}`).join(', ') : '-'}</td>
                </tr>
              )) : <tr><td colSpan={6} className="py-12 text-center text-[var(--text-secondary)]">조건에 맞는 채널 SKU가 없습니다.</td></tr>}
            </tbody>
          </table>
        </div>
        <Pagination page={data?.page ?? page} limit={data?.limit ?? 50} total={data?.total ?? 0} onPageChange={setPage} />
      </div>
    </section>
  );
}
