'use client';

import Link from 'next/link';
import { deriveInventoryLinkStatus, INVENTORY_LINK_LABELS, type InventorySkuSnapshotItem } from '@kiditem/shared/inventory';
import { Pagination } from '@/components/ui/Pagination';
import { operatorProductReference } from '@/lib/operator-product-reference';
import { cn, formatDateTime, formatNumber } from '@/lib/utils';

interface InventoryTableProps {
  items: InventorySkuSnapshotItem[];
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}

function price(value: number | null): string {
  return value === null ? '가격 미등록' : `${formatNumber(value)}원`;
}

export function InventoryTable({
  items,
  page,
  pageSize,
  total,
  onPageChange,
}: InventoryTableProps) {
  if (items.length === 0) {
    return (
      <div className="space-y-2 text-center">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-12 text-[var(--text-secondary)]">
          조건에 맞는 Sellpia 재고가 없습니다.
        </div>
        <p className="text-xs text-[var(--text-secondary)]">필터 조건을 확인해 주세요.</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
      <div className="overflow-hidden">
        <table className="w-full table-fixed">
          <colgroup>
            <col className="w-[29%]" />
            <col className="w-[22%]" />
            <col className="w-[20%]" />
            <col className="w-[29%]" />
          </colgroup>
          <thead>
            <tr>
              <th>상품 정보</th>
              <th>식별 정보</th>
              <th>재고 · 가격</th>
              <th>연결 · 가져오기</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr
                key={item.sellpiaInventorySkuId}
                className={cn(item.currentStock === 0 && 'bg-red-50/60')}
              >
                <td className="overflow-hidden align-top">
                  <p className="break-all font-semibold text-[var(--text-primary)]" title={item.name}>
                    {item.name}
                  </p>
                  <p
                    className="mt-1 break-words text-xs text-[var(--text-secondary)]"
                    title={item.optionName ?? undefined}
                  >
                    {item.optionName ? `옵션 ${item.optionName}` : '옵션 없음'}
                  </p>
                </td>
                <td className="overflow-hidden align-top">
                  <dl className="space-y-2 text-xs">
                    <div>
                      <dt className="text-[11px] font-medium text-[var(--text-secondary)]">Sellpia 코드</dt>
                      <dd className="mt-0.5 break-all font-mono font-semibold text-[var(--text-secondary)]">
                        {item.code}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[11px] font-medium text-[var(--text-secondary)]">바코드</dt>
                      <dd className="mt-0.5 break-all font-mono text-[var(--text-secondary)]">
                        {item.barcode ?? '-'}
                      </dd>
                    </div>
                  </dl>
                </td>
                <td className="overflow-hidden align-top">
                  <div>
                    <p className="text-[11px] font-medium text-[var(--text-secondary)]">현재고</p>
                    <p className={cn(
                      'text-base font-bold',
                      item.currentStock === 0 ? 'text-red-600' : 'text-emerald-700',
                    )}>
                      {formatNumber(item.currentStock)}
                    </p>
                  </div>
                  <dl className="mt-3 space-y-1 text-xs">
                    <div className="flex flex-wrap justify-between gap-x-2">
                      <dt className="text-[var(--text-secondary)]">매입가</dt>
                      <dd className={cn('font-medium', item.purchasePrice === null && 'text-amber-700')}>
                        {price(item.purchasePrice)}
                      </dd>
                    </div>
                    <div className="flex flex-wrap justify-between gap-x-2">
                      <dt className="text-[var(--text-secondary)]">판매가</dt>
                      <dd className={cn('font-medium', item.salePrice === null && 'text-amber-700')}>
                        {price(item.salePrice)}
                      </dd>
                    </div>
                  </dl>
                </td>
                <td className="overflow-hidden align-top">
                  <InventoryConnections item={item} />
                  <div className="mt-3 border-t border-slate-100 pt-2 text-xs text-[var(--text-secondary)]">
                    <p className="text-[11px] font-medium">최종 가져오기</p>
                    <p className="mt-0.5">
                      {item.lastImportedAt ? formatDateTime(item.lastImportedAt) : '가져오기 기록 없음'}
                    </p>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination page={page} limit={pageSize} total={total} onPageChange={onPageChange} />
    </div>
  );
}

function InventoryConnections({ item }: { item: InventorySkuSnapshotItem }) {
  const linkStatus = deriveInventoryLinkStatus(item);
  if (linkStatus === 'unlinked') {
    return (
      <span className="rounded bg-amber-50 px-2 py-1 text-xs font-bold text-amber-700">
        {INVENTORY_LINK_LABELS[linkStatus]}
      </span>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-[11px] font-bold text-purple-700">
        상품 {item.linkedProductCount} · 채널 옵션 {item.linkedChannelOptionCount}
      </p>
      <div className="space-y-1">
        {item.linkedProducts.map((product) => (
          <Link
            key={product.id}
            href={`/product-hub/${product.id}`}
            className="block break-all text-xs font-semibold text-purple-700 hover:underline"
          >
            {operatorProductReference(product.code, product.name)}
          </Link>
        ))}
      </div>
      <div className="space-y-1 border-t border-slate-100 pt-1">
        {item.linkedChannelOptions.map((option) => (
          <Link
            key={option.id}
            href={`/product-hub/${option.masterProductId}`}
            className="block break-all text-[11px] text-slate-600 hover:text-purple-700 hover:underline"
          >
            {option.channel} · {option.itemName ?? option.externalOptionId}
          </Link>
        ))}
      </div>
    </div>
  );
}
