'use client';

import { Fragment, useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import type {
  ChannelOptionMatchingQueueRow,
  ChannelProductMatchingQueueRow,
} from '@kiditem/shared/channel-product-matching';
import { cn, formatNumber } from '@/lib/utils';
import { operatorProductReference } from '@/lib/operator-product-reference';
import { MasterProductImage } from '../../components/MasterProductImage';

export type OperatorMatchingStatus = 'matched' | 'quantity_review' | 'unmatched';

type Props = {
  products: ChannelProductMatchingQueueRow[];
  options: ChannelOptionMatchingQueueRow[];
  onEditProduct: (row: ChannelProductMatchingQueueRow) => void;
  focusOptionId?: string;
  loading?: boolean;
};

export function ProductInventoryMatchingTable({
  products,
  options,
  onEditProduct,
  focusOptionId,
  loading = false,
}: Props) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const optionsByListingId = groupOptions(options);
  const focusedListingId = options.find(({ option }) => option.id === focusOptionId)?.listing.id;

  useEffect(() => {
    if (!focusedListingId) return;
    setExpandedIds((current) => new Set(current).add(focusedListingId));
  }, [focusedListingId]);

  if (loading) {
    return <div className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-14 text-sm text-slate-600"><Loader2 size={16} className="animate-spin" /> 매칭 목록을 불러오는 중입니다.</div>;
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] table-fixed text-left text-sm">
          <colgroup><col className="w-[31%]" /><col className="w-[29%]" /><col className="w-[16%]" /><col className="w-[14%]" /><col className="w-[10%]" /></colgroup>
          <thead className="bg-slate-50 text-xs font-bold text-slate-600"><tr><th className="px-4 py-3">채널 상품</th><th className="px-4 py-3">연결 재고상품</th><th className="px-4 py-3">판매 옵션</th><th className="px-4 py-3">상태</th><th className="px-4 py-3">확인</th></tr></thead>
          <tbody className="divide-y divide-slate-200">
            {products.length === 0 ? <tr><td colSpan={5} className="px-4 py-14 text-center text-slate-500">표시할 채널 상품이 없습니다.</td></tr> : products.map((product) => {
              const childOptions = optionsByListingId.get(product.listing.id) ?? [];
              const status = productMatchingStatus(product, childOptions);
              const expanded = expandedIds.has(product.listing.id);
              return <Fragment key={product.listing.id}>
                <tr className="align-top">
                  <td className="overflow-hidden px-4 py-4"><div className="flex min-w-0 items-start gap-3"><div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50"><MasterProductImage imageUrl={product.listing.channelImageUrl} productName={product.listing.displayName ?? product.listing.externalId} className="h-full w-full object-cover" /></div><div className="min-w-0"><p className="truncate font-semibold text-slate-900">{product.listing.displayName ?? '상품명 없음'}</p><p className="mt-1 truncate text-xs font-semibold text-slate-500">{product.channelAccount.name} · {product.channelAccount.channel}</p><p className="mt-1 break-all font-mono text-xs text-slate-400">{product.listing.externalId}</p></div></div></td>
                  <td className="overflow-hidden px-4 py-4">{product.linkedProduct ? <><p className="truncate font-bold text-slate-900">{operatorProductReference(product.linkedProduct.code, product.linkedProduct.name)}</p><p className="mt-1 text-xs font-semibold text-emerald-700">재고상품 연결 완료</p></> : status === 'unmatched' ? <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700">재고 연결 필요</span> : <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">옵션별 재고 연결 완료</span>}</td>
                  <td className="px-4 py-4"><p className="font-bold text-slate-800">{formatNumber(product.optionCount)}개</p><p className="mt-1 text-xs text-slate-500">재고 구성 {formatNumber(product.configuredOptionCount)}개</p></td>
                  <td className="px-4 py-4"><StatusBadge status={status} /></td>
                  <td className="px-4 py-4"><button type="button" aria-expanded={expanded} onClick={() => setExpandedIds((current) => { const next = new Set(current); if (next.has(product.listing.id)) next.delete(product.listing.id); else next.add(product.listing.id); return next; })} className="inline-flex items-center gap-1 rounded-xl border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700">확인 {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</button></td>
                </tr>
                {expanded ? <tr><td colSpan={5} className="bg-slate-50/70 p-0"><ProductDetails product={product} options={childOptions} focusOptionId={focusOptionId} onEditProduct={onEditProduct} /></td></tr> : null}
              </Fragment>;
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function productMatchingStatus(_product: ChannelProductMatchingQueueRow, options: ChannelOptionMatchingQueueRow[]): OperatorMatchingStatus {
  if (options.length === 0 || options.some(({ option }) => option.inventoryComponents.length === 0)) return 'unmatched';
  if (options.some(({ capacity }) => capacity === null)) return 'quantity_review';
  return 'matched';
}

function ProductDetails({ product, options, focusOptionId, onEditProduct }: {
  product: ChannelProductMatchingQueueRow;
  options: ChannelOptionMatchingQueueRow[];
  focusOptionId?: string;
  onEditProduct: Props['onEditProduct'];
}) {
  const hasCompleteRecipes = options.length > 0
    && options.every(({ option }) => option.inventoryComponents.length > 0);
  return <div className="space-y-4 px-4 py-5">
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4"><div className="min-w-0"><p className="text-xs font-bold text-slate-500">옵션별 재고 매칭</p><p className="mt-1 truncate font-semibold text-slate-900">{product.linkedProduct ? operatorProductReference(product.linkedProduct.code, product.linkedProduct.name) : hasCompleteRecipes ? '옵션별로 서로 다른 재고상품에 연결되어 있습니다.' : '재고 연결이 필요한 옵션이 있습니다.'}</p><p className="mt-1 text-xs text-slate-500">옵션별 Sellpia 재고 상품과 차감 수량을 관리합니다.</p></div><button type="button" onClick={() => onEditProduct(product)} className="rounded-xl border border-purple-600 px-3 py-2 text-xs font-bold text-purple-700">재고 매칭</button></div>
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white"><table className="w-full min-w-[720px] table-fixed text-left text-xs"><colgroup><col className="w-[32%]" /><col className="w-[50%]" /><col className="w-[18%]" /></colgroup><thead className="bg-slate-100/80 font-bold text-slate-600"><tr><th className="px-3 py-2.5">채널 판매 옵션</th><th className="px-3 py-2.5">차감할 Sellpia 재고</th><th className="px-3 py-2.5">판매 가능</th></tr></thead><tbody className="divide-y divide-slate-200">
      {options.length === 0 ? <tr><td colSpan={3} className="px-3 py-8 text-center text-slate-500">수집된 하위 옵션이 없습니다.</td></tr> : options.map((row) => <tr key={row.option.id} className={cn('align-top', row.option.id === focusOptionId && 'bg-purple-50 ring-1 ring-inset ring-purple-300')}>
        <td className="overflow-hidden px-3 py-3"><p className="truncate font-semibold text-slate-900">{options.length === 1 ? '기본 옵션' : row.option.itemName ?? '옵션명 없음'}</p>{options.length === 1 && row.option.itemName ? <p className="mt-1 truncate text-slate-600">{row.option.itemName}</p> : null}<p className="mt-1 break-all font-mono text-slate-500">{row.option.sellerSku ?? row.option.externalOptionId}</p></td>
        <td className="overflow-hidden px-3 py-3">{row.option.inventoryComponents.length === 0 ? <span className="font-semibold text-amber-700">재고 연결 필요</span> : <div className="space-y-1">{row.option.inventoryComponents.map((component) => <p key={component.id} className="truncate text-slate-700"><span className="font-mono font-bold">{component.code}</span> · {component.name}{component.optionName ? ` / ${component.optionName}` : ''} · 차감 {component.quantity}</p>)}</div>}</td>
        <td className="px-3 py-3 font-bold text-slate-700">{row.capacity === null ? '미확정' : `${formatNumber(row.capacity)}개`}</td>
      </tr>)}
    </tbody></table></div>
  </div>;
}

function StatusBadge({ status }: { status: OperatorMatchingStatus }) {
  const presentation = {
    matched: ['매칭 완료', 'bg-emerald-50 text-emerald-800'],
    quantity_review: ['재고 검토', 'bg-amber-50 text-amber-900'],
    unmatched: ['매칭 필요', 'bg-slate-100 text-slate-700'],
  }[status];
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${presentation[1]}`}>{presentation[0]}</span>;
}

function groupOptions(options: ChannelOptionMatchingQueueRow[]) {
  const grouped = new Map<string, ChannelOptionMatchingQueueRow[]>();
  for (const option of options) {
    const rows = grouped.get(option.listing.id) ?? [];
    rows.push(option);
    grouped.set(option.listing.id, rows);
  }
  return grouped;
}
