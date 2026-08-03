'use client';

import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { formatKRW, formatNumber } from '@/lib/utils';
import { MasterProductImage } from './MasterProductImage';
import { ProductAbcBadge } from '@/components/product-abc/ProductAbcBadge';
import type { MasterProductOperationsListItem } from '@kiditem/shared/product-operations';

const INVENTORY_LABELS = {
  sellable: '판매 가능',
  partial_out_of_stock: '일부 품절',
  out_of_stock: '품절',
  configuration_required: '재고 연결 필요',
  review_required: '검토 필요',
} as const;

export function ProductRowCard({
  product,
  onOpenAbcDetail,
}: {
  product: MasterProductOperationsListItem;
  onOpenAbcDetail?: (product: MasterProductOperationsListItem) => void;
}) {
  const isWarning = product.inventoryStatus === 'configuration_required'
    || product.inventoryStatus === 'review_required';
  const isOutOfStock = product.inventoryStatus === 'out_of_stock';
  const alertStyle = isWarning
    ? 'border-amber-300 bg-amber-50/70'
    : isOutOfStock
      ? 'border-rose-200 bg-rose-50/40'
      : 'border-[var(--border-subtle)] bg-[var(--card-bg)]';
  return (
    <article className={`relative overflow-hidden rounded-2xl border px-6 py-5 shadow-sm transition hover:border-[var(--border-strong)] hover:shadow-md ${alertStyle}`}>
      {isWarning || isOutOfStock ? (
        <span className={`absolute left-0 top-0 h-full w-1 ${isWarning ? 'bg-amber-500' : 'bg-rose-500'}`} aria-hidden="true" />
      ) : null}
      <div className="grid grid-cols-[minmax(420px,1.45fr)_repeat(8,minmax(76px,.42fr))_72px] items-center gap-4">
        <div className="flex min-w-0 items-center gap-5">
          <div className="w-14 shrink-0 text-center">
            {onOpenAbcDetail ? (
              <button
                type="button"
                onClick={() => onOpenAbcDetail(product)}
                aria-label={`${product.name} ABC 근거 보기`}
                className="rounded-md p-1 text-left transition-colors hover:bg-[var(--surface-sunken)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]"
              >
                <ProductAbcBadge grade={product.abcGrade} evaluation={product.abcEvaluation} compact />
              </button>
            ) : <ProductAbcBadge grade={product.abcGrade} evaluation={product.abcEvaluation} compact />}
          </div>
          <div className="flex h-[88px] w-[88px] shrink-0 items-center justify-center overflow-hidden rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-sunken)] text-[var(--text-muted)]">
            <MasterProductImage
              imageUrl={product.displayImageUrls[0]}
              productName={product.name}
              className="h-full w-full object-cover"
            />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-black text-slate-600">
                {product.category ?? '미분류'}
              </span>
              <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${product.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                {product.isActive ? '판매중' : '판매중지'}
              </span>
              <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${isWarning ? 'bg-amber-100 text-amber-800' : isOutOfStock ? 'bg-rose-100 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}>
                {INVENTORY_LABELS[product.inventoryStatus]}
              </span>
              <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${product.depletion.needsReorder ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'}`}>
                {product.depletion.coverage === 'shared' ? '공유 SKU 기준' : product.depletion.coverage === 'ready' ? '직접 판매 기준' : '직접 판매 없음'}
                {product.depletion.needsReorder ? ` · 발주 필요 ${product.depletion.reorderSkuCount}` : ''}
              </span>
            </div>
            <Link
              href={`/product-hub/${product.id}`}
              className="mt-2 block truncate text-[17px] font-extrabold text-[var(--text-primary)] hover:text-[var(--primary)]"
            >
              {product.name}
            </Link>
            <p className="mt-1 truncate text-[11px] text-[var(--text-muted)]">
              {product.displayReference.label} {product.displayReference.value} · {product.brand ?? '브랜드 미등록'}
            </p>
            <p className="mt-1 text-[11px] text-[var(--text-muted)]">
              옵션 {formatNumber(product.channelOptionSummary.total)}개 · 구성 완료 {formatNumber(product.channelOptionSummary.configured)}개
            </p>
          </div>
        </div>

        <Metric value={product.inventoryUnits} label="재고" />
        <Metric value={product.visitorCount} label="방문" />
        <Metric value={product.viewCount} label="조회" />
        <Metric value={product.cartAddCount} label="장바구니" />
        <Metric value={product.orderCount} label="주문" />
        <Metric value={product.salesQuantity} label="판매" />
        <Metric value={product.salesAmount} label="매출" currency />
        <Metric value={product.adSpendRate} label="광고비율" suffix="%" />
        <div className="flex justify-end">
          <Link
            href={`/product-hub/${product.id}`}
            aria-label={`${product.name} 상세`}
            className="inline-flex h-10 items-center gap-1 rounded-xl bg-[var(--surface-sunken)] px-3 text-[12px] font-bold text-[var(--text-secondary)] hover:bg-[var(--primary-soft)] hover:text-[var(--primary)]"
          >
            상세 <ArrowUpRight size={12} />
          </Link>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-2 text-[11px] font-semibold text-[var(--text-tertiary)]">
        <span className={`rounded px-2 py-1 font-bold ${isWarning ? 'bg-amber-100 text-amber-800' : isOutOfStock ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}>
          {INVENTORY_LABELS[product.inventoryStatus]}
        </span>
        <span>채널 {formatNumber(product.channelCount)}개</span>
        <span>활성 옵션 {formatNumber(product.channelOptionSummary.active)}개</span>
        <span>{product.depletion.minMonthsOfAvailableStockLeft === null ? '가용재고 소진 미계산' : `가용재고 ${product.depletion.minMonthsOfAvailableStockLeft}개월`}</span>
        <span>광고비 {product.adSpend === null ? '—' : `${formatKRW(product.adSpend)}원`}</span>
        <span>이익 {product.profit === null ? '—' : `${formatKRW(product.profit)}원`}</span>
        <span>상품 건강도 {product.healthScore === null ? '—' : `${formatNumber(product.healthScore)}점`}</span>
      </div>
    </article>
  );
}

function Metric({ value, label, currency, suffix }: {
  value: number | null;
  label: string;
  currency?: boolean;
  suffix?: string;
}) {
  return (
    <div className="text-right">
      <p className={`font-black leading-none tabular-nums ${value === null ? 'text-[12px] text-[var(--text-muted)]' : 'text-[22px] text-[var(--text-primary)]'}`}>
        {value === null
          ? '—'
          : currency
            ? `${formatKRW(value)}원`
            : `${formatNumber(value)}${suffix ?? ''}`}
      </p>
      <p className="mt-2 text-[11px] font-medium text-[var(--text-muted)]">{label}</p>
    </div>
  );
}
