'use client';

import { Loader2, Pencil } from 'lucide-react';
import { Pagination } from '@/components/ui/Pagination';
import { cn, formatKRW, formatNumber } from '@/lib/utils';
import type {
  ChannelSkuMappingListItem,
  ChannelSkuMappingStatus,
} from '@kiditem/shared/channel-sku-matching';

type ChannelSkuMappingTableProps = {
  items: ChannelSkuMappingListItem[];
  total: number;
  page: number;
  limit: number;
  loading: boolean;
  emptyMessage: string;
  onPageChange: (page: number) => void;
  onEdit: (item: ChannelSkuMappingListItem) => void;
};

const STATUS_VIEW: Record<
  ChannelSkuMappingStatus,
  { label: string; className: string }
> = {
  unmatched: { label: '미매칭', className: 'bg-slate-100 text-slate-700' },
  needs_review: { label: '확인 필요', className: 'bg-amber-100 text-amber-800' },
  matched: { label: '매칭 완료', className: 'bg-emerald-100 text-emerald-800' },
};

export function ChannelSkuMappingTable({
  items,
  total,
  page,
  limit,
  loading,
  emptyMessage,
  onPageChange,
  onEdit,
}: ChannelSkuMappingTableProps) {
  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--border,#e2e8f0)] bg-[var(--surface,#fff)]">
      <div className="overflow-x-auto">
        <table className="min-w-[1480px] w-full border-collapse text-left text-sm">
          <thead className="bg-[var(--surface-sunken,#f8fafc)] text-xs font-semibold text-[var(--text-secondary,#475569)]">
            <tr>
              <th className="px-4 py-3">채널 계정</th>
              <th className="px-4 py-3">상품</th>
              <th className="px-4 py-3">옵션 SKU</th>
              <th className="px-4 py-3">식별자</th>
              <th className="px-4 py-3">판매 메타데이터</th>
              <th className="px-4 py-3">Sellpia 구성</th>
              <th className="px-4 py-3">상태 / 작업</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border,#e2e8f0)]">
            {loading ? (
              <tr>
                <td colSpan={7} className="px-4 py-14 text-center text-[var(--text-secondary,#64748b)]">
                  <span className="inline-flex items-center gap-2">
                    <Loader2 size={16} className="animate-spin" />
                    채널 SKU를 불러오는 중입니다.
                  </span>
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-14 text-center text-[var(--text-secondary,#64748b)]">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              items.map((item) => {
                const status = STATUS_VIEW[item.sku.mappingStatus];
                const productName =
                  item.product.registeredName ?? item.product.displayName ?? '상품명 없음';
                return (
                  <tr
                    key={item.sku.id}
                    className="align-top [content-visibility:auto] [contain-intrinsic-size:0_150px]"
                  >
                    <td className="px-4 py-4">
                      <p className="font-semibold text-[var(--text-primary,#0f172a)]">
                        {item.channelAccount.name}
                      </p>
                      <p className="mt-1 font-mono text-xs text-[var(--text-tertiary,#64748b)]">
                        {item.channelAccount.channel}
                      </p>
                    </td>
                    <td className="max-w-64 px-4 py-4">
                      <p className="truncate font-medium text-[var(--text-primary,#0f172a)]">
                        {productName}
                      </p>
                      {item.product.displayName && item.product.displayName !== productName ? (
                        <p className="mt-1 truncate text-xs text-[var(--text-secondary,#475569)]">
                          {item.product.displayName}
                        </p>
                      ) : null}
                      <p className="mt-1 font-mono text-xs text-[var(--text-tertiary,#64748b)]">
                        {item.product.externalProductId}
                      </p>
                    </td>
                    <td className="max-w-64 px-4 py-4">
                      <p className="truncate font-medium text-[var(--text-primary,#0f172a)]">
                        {item.sku.optionName ?? '옵션명 없음'}
                      </p>
                      <p className="mt-1 font-mono text-xs text-[var(--text-tertiary,#64748b)]">
                        {item.sku.externalSkuId}
                      </p>
                      <p className="mt-1 font-mono text-xs text-[var(--text-secondary,#475569)]">
                        {item.sku.sellerSku ?? 'sellerSku 없음'}
                      </p>
                    </td>
                    <td className="px-4 py-4 text-xs text-[var(--text-secondary,#475569)]">
                      <p className="font-mono">{item.sku.barcode ?? '바코드 없음'}</p>
                      <p className="mt-1 font-mono">{item.sku.modelNumber ?? '모델번호 없음'}</p>
                    </td>
                    <td className="px-4 py-4 text-xs text-[var(--text-secondary,#475569)]">
                      <p>{item.sku.status ?? item.product.status ?? '상태 없음'}</p>
                      <p className="mt-1 font-mono">
                        {item.sku.salePrice === null
                          ? '가격 없음'
                          : `${formatKRW(item.sku.salePrice)}원`}
                      </p>
                    </td>
                    <td className="max-w-80 px-4 py-4">
                      {item.components.length === 0 ? (
                        <p className="text-xs text-[var(--text-tertiary,#64748b)]">구성 없음</p>
                      ) : (
                        <ul className="space-y-2">
                          {item.components.map((component) => (
                            <li key={component.inventorySkuId} className="text-xs">
                              <p className="font-medium text-[var(--text-primary,#0f172a)]">
                                <span className="font-mono">{component.sellpiaProductCode}</span>
                                {' · '}
                                {component.name}
                                {component.optionName ? ` · ${component.optionName}` : ''}
                                {' × '}
                                <span className="font-mono">{formatNumber(component.quantity)}</span>
                              </p>
                              <p className="mt-0.5 text-[var(--text-tertiary,#64748b)]">
                                보고 재고 {formatNumber(component.reportedStock)}
                              </p>
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      <span
                        className={cn(
                          'inline-flex rounded-full px-2.5 py-1 text-xs font-semibold',
                          status.className,
                        )}
                      >
                        {status.label}
                      </span>
                      <button
                        type="button"
                        aria-label={`${item.sku.externalSkuId} Sellpia 구성 편집`}
                        onClick={() => onEdit(item)}
                        className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-[var(--border,#cbd5e1)] px-3 py-2 text-xs font-semibold text-[var(--text-secondary,#475569)] hover:border-[var(--primary,#7048e8)] hover:text-[var(--primary,#7048e8)]"
                      >
                        <Pencil size={13} /> 구성 편집
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <Pagination
        page={page}
        limit={limit}
        total={total}
        onPageChange={onPageChange}
      />
    </div>
  );
}
