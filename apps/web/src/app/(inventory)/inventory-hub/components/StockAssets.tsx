'use client';

import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { CircleDollarSign, Package, Tags } from 'lucide-react';
import { Pagination } from '@/components/ui/Pagination';
import { queryKeys } from '@/lib/query-keys';
import { formatNumber } from '@/lib/utils';
import { listSellpiaInventorySkus } from '../../_shared/inventory-api';

const PAGE_SIZE = 50;

export default function StockAssets() {
  const [page, setPage] = useState(1);
  const params = { page, limit: PAGE_SIZE };
  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.inventory.assetList({
      page: String(page),
      limit: String(PAGE_SIZE),
    }),
    queryFn: () => listSellpiaInventorySkus(params),
    placeholderData: keepPreviousData,
  });

  const summary = data?.summary ?? {
    totalSkus: 0,
    inStockSkus: 0,
    outOfStockSkus: 0,
    totalUnits: 0,
    pricedAssetValue: 0,
    unpricedSkuCount: 0,
  };

  return (
    <section className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">재고자산</h2>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Sellpia 현재고 × 등록된 매입가입니다. 매입가가 없는 SKU는 평가액에서 제외합니다.
        </p>
      </div>
      {error ? <p role="alert" className="text-sm text-red-700">재고자산을 불러오지 못했습니다.</p> : null}
      <div className="grid gap-3 md:grid-cols-3">
        <AssetCard icon={CircleDollarSign} label="평가 재고자산" value={`${formatNumber(summary.pricedAssetValue)}원`} />
        <AssetCard icon={Package} label="총 재고수량" value={`${formatNumber(summary.totalUnits)}개`} />
        <AssetCard icon={Tags} label="가격 미등록 SKU" value={`${formatNumber(summary.unpricedSkuCount)}개`} />
      </div>
      <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px]">
            <thead><tr><th>Sellpia 코드</th><th>상품명</th><th className="text-right">현재고</th><th className="text-right">매입가</th><th className="text-right">재고자산</th></tr></thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={5} className="py-12 text-center text-[var(--text-secondary)]">불러오는 중...</td></tr>
              ) : data?.items.length ? data.items.map((item) => (
                <tr key={item.sellpiaInventorySkuId}>
                  <td className="font-mono text-xs">{item.code}</td>
                  <td className="font-medium">{item.name}</td>
                  <td className="text-right">{formatNumber(item.currentStock)}</td>
                  <td className="text-right">{item.purchasePrice === null ? '가격 미등록' : `${formatNumber(item.purchasePrice)}원`}</td>
                  <td className="text-right font-medium">{item.stockValue === null ? '-' : `${formatNumber(item.stockValue)}원`}</td>
                </tr>
              )) : (
                <tr><td colSpan={5} className="py-12 text-center text-[var(--text-secondary)]">재고자산 데이터가 없습니다.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <Pagination
          page={data?.page ?? page}
          limit={data?.limit ?? PAGE_SIZE}
          total={data?.total ?? 0}
          onPageChange={setPage}
        />
      </div>
    </section>
  );
}

function AssetCard({ icon: Icon, label, value }: { icon: typeof Package; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
      <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]"><Icon className="h-4 w-4" aria-hidden="true" /> {label}</div>
      <p className="mt-2 text-2xl font-semibold text-[var(--text-primary)]">{value}</p>
    </div>
  );
}
