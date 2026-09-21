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
import { formatKRW, formatNumber } from '@/lib/utils';
import { isInternalProductCode } from '@/lib/operator-product-reference';
import { MasterProductImage } from './MasterProductImage';
import { PRODUCT_ROW_GRID } from './ProductsColumnHeader';

/**
 * 상품 한 줄 — 운영 센터의 기본 단위(사장님 2026-09-21).
 *
 * 한 가지 사실은 한 번만 나온다. 등급은 등급 열에만 있고(앞에 또 달면 겹친다), 몰은 이름을
 * 늘어놓지 않고 몇 곳인지만 말한다. 숫자는 열 머리글이 이름을 대신하므로 숫자 밑에 이름을
 * 다시 쓰지 않는다.
 */

const GRADE_TONE: Record<string, string> = {
  A: 'bg-emerald-50 text-emerald-700',
  B: 'bg-amber-50 text-amber-800',
  C: 'bg-rose-50 text-rose-700',
};

/**
 * 등급이 없을 때 그 칸이 말하는 한 마디. 큰 매출 옆의 빈 칸은 고장처럼 읽히므로 왜 없는지를
 * 쓴다(사장님 2026-09-21). 말은 짧게, 자세한 이름은 `title` 로.
 */
const GRADE_ABSENCE_WORD: Record<Exclude<ProductAbcDisplayStatus, 'READY'>, string> = {
  SOURCE_UNMAPPED: '미연결',
  SELLPIA_SOURCE_STALE: '수집 전',
  AD_SOURCE_STALE: '광고 전',
  INSUFFICIENT_EVIDENCE: '관찰 중',
};

/** 등급 한 글자. 누르면 왜 그 등급인지 연다. 등급이 없으면 왜 없는지를 한 마디로. */
function GradeCell({ grade, absence, onOpen, label }: {
  grade: 'A' | 'B' | 'C' | null;
  absence: Exclude<ProductAbcDisplayStatus, 'READY'> | null;
  onOpen?: () => void;
  label: string;
}) {
  const body = grade ? (
    <span className={`inline-flex h-7 min-w-7 items-center justify-center rounded-md px-2 text-[13px] font-black ${GRADE_TONE[grade]}`}>
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
  return (
    <div className="flex justify-end">
      {onOpen ? (
        <button
          type="button"
          onClick={onOpen}
          aria-label={`${label} ABC 근거 보기`}
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
  const categoryLabel = categoryLabelForList(product.category);
  const hasVisibleDisplayReference = product.displayReference.type !== 'product_code'
    || !isInternalProductCode(product.displayReference.value);
  const secondaryLabel = hasVisibleDisplayReference
    ? `${product.displayReference.label} ${product.displayReference.value} · ${product.brand ?? '브랜드 미등록'}`
    : product.brand ?? null;
  const alertStyle = isWarning
    ? 'border-amber-300 bg-amber-50/70'
    : isOutOfStock
      ? 'border-rose-200 bg-rose-50/40'
      : 'border-[var(--border-subtle)] bg-[var(--card-bg)]';

  // 등급이 없으면 그 칸이 이유를 말한다 — 서버가 이미 발표한 사실에서 낱말 하나를 고를 뿐이다.
  const displayStatus = productAbcDisplayStatus(product.abc);
  const gradeAbsence = product.abcGrade === null && displayStatus !== 'READY' ? displayStatus : null;

  // 월 평균은 완결된 달만 센다. 완결된 달에 한 개도 안 나갔는데 이번 달 팔리고 있으면
  // 0 은 그 상품이 나가는 속도가 아니라 '아직 한 달치가 없다' 는 뜻이다 — 그때는 숫자 대신
  // 신상품이라고 말하고, 한 달이 차면 그 달부터 평균을 낸다(사장님 2026-09-21).
  const soldThisMonth = product.monthly?.soldQuantity ?? 0;
  const outflowTooNew = soldThisMonth > 0
    && (product.depletion.monthlyOutflow === null || product.depletion.monthlyOutflow === 0);

  // 아래 한 줄로 묶는 운영 사실 — 같은 말을 위에서 또 하지 않는다.
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
              {categoryLabel ? (
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                  {categoryLabel}
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
          onOpen={onOpenAbcDetail ? () => onOpenAbcDetail(product) : undefined}
        />
        <Metric value={product.inventoryUnits} />
        <Metric
          value={outflowTooNew ? null : product.depletion.monthlyOutflow}
          placeholder={outflowTooNew ? '신상품' : undefined}
          title={outflowTooNew
            ? '완결된 달에 팔린 적이 없습니다 — 한 달이 차면 그 달부터 월 평균을 냅니다'
            : product.depletion.monthlyOutflow === null
              ? '완결된 달의 판매 근거가 없어 월 평균을 재지 못했습니다'
              : `완결 ${product.depletion.outflowMonthCount}개월 평균`}
        />
        <Metric value={product.monthly?.revenue ?? null} currency />
        <Metric value={product.monthly?.soldQuantity ?? null} />
        <Metric value={product.monthly?.cost ?? null} currency />
        <Metric value={product.monthly?.grossProfit ?? null} currency />
        <Metric value={product.monthly?.grossMarginRate ?? null} suffix="%" />
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

/** 숫자 한 칸. 이름은 열 머리글이 이미 말했으므로 여기서 다시 쓰지 않는다. */
function Metric({ value, currency, suffix, title, placeholder }: {
  value: number | null;
  currency?: boolean;
  suffix?: string;
  /** 그 숫자가 무엇을 잰 것인지 — 마우스를 올리면 나온다. */
  title?: string;
  /** 숫자가 없을 때 대신 쓸 말. 없으면 '—'. */
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

function categoryLabelForList(category: string | null): string | null {
  const normalized = category?.trim();
  // 카테고리가 없으면 칩을 그리지 않는다. '미분류' 라는 말이 ABC 등급으로 읽혔다
  // (사장님 2026-09-21).
  if (!normalized) return null;
  return /^[\d\s/._-]+$/.test(normalized) ? null : normalized;
}
