'use client';

import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import {
  deriveProductInventoryStatus,
  PRODUCT_INVENTORY_LABELS,
  type MasterProductOperationsListItem,
} from '@kiditem/shared/product-operations';
import {
  PRODUCT_ABC_DISPLAY_STATUS_LABELS,
  productAbcDisplayStatus,
  type ProductAbcDisplayStatus,
} from '@kiditem/shared/product-abc';
import { formatKRW, formatNumber, getGradeColor } from '@/lib/utils';
import { MasterProductImage } from './MasterProductImage';
import { PRODUCT_ROW_GRID } from './ProductsColumnHeader';

const GRADE_ABSENCE_WORD: Record<Exclude<ProductAbcDisplayStatus, 'READY'>, string> = {
  SOURCE_UNMAPPED: '미연결',
  SELLPIA_SOURCE_STALE: '수집 전',
  AD_SOURCE_STALE: '광고 전',
  INSUFFICIENT_EVIDENCE: '관찰 중',
};

function GradeCell({
  grade,
  absence,
  onOpen,
  label,
  officialCutoffDate,
}: {
  grade: 'A' | 'B' | 'C' | null;
  absence: Exclude<ProductAbcDisplayStatus, 'READY'> | null;
  onOpen?: () => void;
  label: string;
  officialCutoffDate: string | null;
}) {
  const body = grade ? (
    <span className={`inline-flex h-7 min-w-7 items-center justify-center rounded-md px-2 text-[13px] font-black ${getGradeColor(grade)}`}>
      {grade}
    </span>
  ) : absence ? (
    <span
      className="text-[11px] font-bold text-[var(--text-quaternary)]"
      title={PRODUCT_ABC_DISPLAY_STATUS_LABELS[absence]}
    >
      {GRADE_ABSENCE_WORD[absence]}
    </span>
  ) : (
    <span className="text-[15px] font-black text-[var(--text-quaternary)]">—</span>
  );
  const cutoffTitle = officialCutoffDate
    ? `공식 ABC 기준일 ${officialCutoffDate}`
    : '공식 ABC 기준일 없음';
  return (
    <div className="flex justify-end">
      {onOpen ? (
        <button
          type="button"
          onClick={onOpen}
          aria-label={`${label} ABC 근거 보기`}
          title={cutoffTitle}
          className="rounded-md p-0.5 transition-colors hover:bg-[var(--surface-sunken)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]"
        >
          {body}
        </button>
      ) : body}
    </div>
  );
}

export function ProductRowCard({
  product,
  onOpenAbcDetail,
}: {
  product: MasterProductOperationsListItem;
  onOpenAbcDetail?: (product: MasterProductOperationsListItem) => void;
}) {
  const inventoryStatus = deriveProductInventoryStatus(product);
  const isWarning = inventoryStatus === 'configuration_required'
    || inventoryStatus === 'review_required';
  const isOutOfStock = inventoryStatus === 'out_of_stock';
  const inventoryLabel = PRODUCT_INVENTORY_LABELS[inventoryStatus];
  const inventoryBadgeStyle = isWarning
    ? 'bg-amber-100 text-amber-800'
    : isOutOfStock
      ? 'bg-rose-100 text-rose-700'
      : inventoryStatus === 'uncollected'
        ? 'bg-slate-100 text-slate-600'
        : 'bg-emerald-50 text-emerald-700';
  const secondaryLabel = `${product.displayReference.label} ${product.displayReference.value}`;
  const alertStyle = isWarning
    ? 'border-amber-300 bg-amber-50/70'
    : isOutOfStock
      ? 'border-rose-200 bg-rose-50/40'
      : 'border-[var(--border-subtle)] bg-[var(--card-bg)]';
  const displayStatus = productAbcDisplayStatus(product.abc);
  const gradeAbsence = product.abcGrade === null && displayStatus !== 'READY' ? displayStatus : null;
  const monthlyMetricBasis = product.monthly
    ? `KST ${product.monthly.yearMonth} · 수집 범위 ${product.monthly.coverageStartDate}–${product.monthly.coverageEndDate}`
    : '월별 수집 미측정';
  const facts = [
    `몰 ${formatNumber(product.activeChannels.length)}곳`,
    `옵션 ${formatNumber(product.channelOptionSummary.total)}개 · 구성 ${formatNumber(product.channelOptionSummary.configured)}개`,
    product.depletion.minMonthsOfAvailableStockLeft === null
      ? null
      : `가용재고 ${product.depletion.minMonthsOfAvailableStockLeft}개월`,
    product.adSpend !== null && product.adSpend > 0 ? `광고 ${formatKRW(product.adSpend)}원` : null,
  ].filter((fact): fact is string => fact !== null);

  return (
    <article className={`relative overflow-hidden rounded-2xl border px-6 py-4 shadow-sm transition hover:border-[var(--border-strong)] hover:shadow-md ${alertStyle}`}>
      {isWarning || isOutOfStock ? (
        <span className={`absolute left-0 top-0 h-full w-1 ${isWarning ? 'bg-amber-500' : 'bg-rose-500'}`} aria-hidden="true" />
      ) : null}
      <div className={PRODUCT_ROW_GRID}>
        <div className="flex min-w-0 items-center gap-4">
          <div className="flex h-[76px] w-[76px] shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-sunken)] text-[var(--text-muted)]">
            <MasterProductImage
              imageUrl={product.displayImageUrls[0]}
              productName={product.name}
              className="h-full w-full object-cover"
            />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1">
              <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${product.isSelling ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                {product.isSelling ? '판매중' : '판매중지'}
              </span>
              <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${inventoryBadgeStyle}`}>
                {inventoryLabel}
              </span>
              {product.depletion.needsReorder ? (
                <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">
                  발주 필요 {product.depletion.reorderSkuCount}
                </span>
              ) : null}
            </div>
            <Link
              href={`/product-hub/${product.id}`}
              className="mt-1.5 block truncate text-[16px] font-extrabold leading-snug text-[var(--text-primary)] hover:text-[var(--primary)]"
            >
              {product.name}
            </Link>
            {secondaryLabel ? <p className="mt-0.5 truncate text-[11px] text-[var(--text-muted)]">{secondaryLabel}</p> : null}
            <p className="mt-1 truncate text-[11px] font-medium text-[var(--text-tertiary)]">{facts.join(' · ')}</p>
          </div>
        </div>

        <GradeCell
          grade={product.abcGrade}
          absence={gradeAbsence}
          label={product.name}
          officialCutoffDate={product.abc.officialCutoffDate}
          onOpen={onOpenAbcDetail ? () => onOpenAbcDetail(product) : undefined}
        />
        <Metric value={product.inventoryUnits} title="MasterProduct에 저장된 최신 현재고" />
        <Metric
          value={product.depletion.monthlyOutflow}
          title={product.depletion.monthlyOutflow === null
            ? '완결된 달의 판매 근거가 없어 월 평균을 재지 못했습니다'
            : `완결 ${product.depletion.outflowMonthCount}개월 평균`}
        />
        <Metric value={product.monthly?.revenue ?? null} currency title={`매출 · ${monthlyMetricBasis}`} />
        <Metric value={product.monthly?.soldQuantity ?? null} title={`판매 · ${monthlyMetricBasis}`} />
        <Metric value={product.monthly?.cost ?? null} currency placeholder="계산 불가" />
        <Metric value={product.monthly?.grossProfit ?? null} currency placeholder="계산 불가" />
        <Metric value={product.monthly?.grossMarginRate ?? null} suffix="%" placeholder="계산 불가" />
        <div className="flex justify-end">
          <Link
            href={`/product-hub/${product.id}`}
            aria-label={`${product.name} 상세`}
            className="inline-flex h-9 items-center gap-1 rounded-xl bg-[var(--surface-sunken)] px-3 text-[12px] font-bold text-[var(--text-secondary)] hover:bg-[var(--primary-soft)] hover:text-[var(--primary)]"
          >
            상세 <ArrowUpRight size={12} />
          </Link>
        </div>
      </div>
    </article>
  );
}

function Metric({
  value,
  currency,
  suffix,
  title,
  placeholder,
}: {
  value: number | null;
  currency?: boolean;
  suffix?: string;
  title?: string;
  placeholder?: string;
}) {
  return (
    <p
      title={title}
      className={`text-right font-black leading-none tabular-nums ${value === null ? 'text-[13px] text-[var(--text-quaternary)]' : 'text-[17px] text-[var(--text-primary)]'}`}
    >
      {value === null
        ? placeholder ?? '—'
        : currency
          ? `${formatKRW(value)}원`
          : `${formatNumber(value)}${suffix ?? ''}`}
    </p>
  );
}
