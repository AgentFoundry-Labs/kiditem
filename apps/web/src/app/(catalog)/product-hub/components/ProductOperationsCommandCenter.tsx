'use client';

import type { ReactNode } from 'react';
import { formatNumber } from '@/lib/utils';
import type {
  MasterProductOperationsListResponse,
  ProductOperationsInventoryFocus,
} from '@kiditem/shared/product-operations';
import type { ProductAbcGrade } from '@kiditem/shared/product-abc';

type Props = {
  data: MasterProductOperationsListResponse;
  onShowAbcGrade: (grade: ProductAbcGrade | 'unclassified') => void;
  onShowInventoryFocus: (focus: ProductOperationsInventoryFocus) => void;
};

export function ProductOperationsCommandCenter({
  data,
  onShowAbcGrade,
  onShowInventoryFocus,
}: Props) {
  const channelProductCounts = data.summary.channelProductCounts;
  const channelProductTotal = channelProductCounts.reduce(
    (total, channelProduct) => total + channelProduct.count,
    0,
  );
  const {
    out_of_stock: outOfStockCount,
    configuration_required: configurationCount,
    review_required: reviewCount,
  } = data.summary.inventoryStatusCounts;
  const warningCount = configurationCount + reviewCount;
  const lowProfitCount = data.summary.negativeProfitCount;
  const reorderProductCount = data.summary.reorderProductCount;
  const imminentProductCount = data.summary.imminentProductCount;
  const {
    A: aGradeCount,
    B: bGradeCount,
    C: cGradeCount,
    unclassified: unclassifiedGradeCount,
  } = data.summary.abcGradeCounts;
  const contribution = data.summary.abcContributionProfitByGrade;

  return (
    <div>
      <section className="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-4">
      <article className="flex min-h-[270px] flex-col rounded-xl border border-[var(--border-subtle)] bg-[var(--card-bg)] px-5 pb-2.5 pt-5 shadow-sm">
        <div>
          <p className="text-xs font-bold text-[var(--text-tertiary)]">판매중 상품</p>
          <p className="mt-2 text-3xl font-extrabold tabular-nums tracking-tight text-[var(--text-primary)]">
            {formatNumber(data.total)}
          </p>
        </div>
        <div className="mt-auto">
          <Breakdown label="A등급" value={aGradeCount} tone="text-emerald-700" onClick={() => onShowAbcGrade('A')} />
          <Breakdown label="B등급" value={bGradeCount} tone="text-amber-600" onClick={() => onShowAbcGrade('B')} />
          <Breakdown label="C등급" value={cGradeCount} tone="text-rose-600" onClick={() => onShowAbcGrade('C')} />
          <Breakdown label="미분류" value={unclassifiedGradeCount} onClick={() => onShowAbcGrade('unclassified')} />
        </div>
      </article>

      <OperationsCard title="재고관리" value={data.summary.depletionCoveredProductCount} valueTone="text-teal-700">
        <Breakdown label="재고 설정 확인" value={warningCount} tone="text-teal-700" onClick={() => onShowInventoryFocus('attention')} />
        <Breakdown label="품절" value={outOfStockCount} tone="text-rose-600" onClick={() => onShowInventoryFocus('out_of_stock')} />
        <Breakdown label="임박 재고" value={imminentProductCount} tone="text-amber-600" onClick={() => onShowInventoryFocus('imminent')} />
        <Breakdown label="발주 필요" value={reorderProductCount} tone="text-[var(--primary)]" onClick={() => onShowInventoryFocus('reorder')} />
      </OperationsCard>

      <OperationsCard title="손익점검" value={lowProfitCount} valueTone="text-amber-600">
        <Breakdown label="점검 대상" value={lowProfitCount} tone="text-amber-600" />
        <Breakdown label="A등급 이익" value={`${formatNumber(contribution.A)}원`} tone="text-emerald-700" onClick={() => onShowAbcGrade('A')} />
        <Breakdown label="B등급 이익" value={`${formatNumber(contribution.B)}원`} tone="text-amber-600" onClick={() => onShowAbcGrade('B')} />
        <Breakdown label="C등급 이익" value={`${formatNumber(contribution.C)}원`} tone="text-rose-600" onClick={() => onShowAbcGrade('C')} />
      </OperationsCard>

      <article className="flex min-h-[270px] flex-col rounded-xl border border-[var(--border-subtle)] bg-[var(--card-bg)] px-5 pb-2.5 pt-5 shadow-sm">
        <div>
          <p className="text-xs font-bold text-[var(--text-tertiary)]">판매중 채널 등록상품</p>
          <p className="mt-2 text-3xl font-extrabold tabular-nums tracking-tight text-[var(--text-primary)]">
            {formatNumber(channelProductTotal)}
          </p>
        </div>
        <div className="mt-auto">
          {channelProductCounts.length > 0 ? channelProductCounts.map((channelProduct) => (
            <Breakdown
              key={channelProduct.channelAccountId}
              label={channelProduct.channelAccountName}
              value={channelProduct.count}
            />
          )) : <Breakdown label="등록상품" value={0} />}
        </div>
      </article>
      </section>
    </div>
  );
}

function OperationsCard({
  title,
  value,
  valueTone = 'text-[var(--text-primary)]',
  children,
}: {
  title: string;
  value: number | string;
  valueTone?: string;
  children: ReactNode;
}) {
  return (
    <article className="flex min-h-[270px] flex-col rounded-xl border border-[var(--border-subtle)] bg-[var(--card-bg)] px-5 pb-2.5 pt-5 shadow-sm">
      <div>
        <p className="text-xs font-bold text-[var(--text-tertiary)]">{title}</p>
        <p className={`mt-2 text-3xl font-extrabold tabular-nums tracking-tight ${valueTone}`}>
          {typeof value === 'number' ? formatNumber(value) : value}
        </p>
      </div>
      <div className="mt-auto">{children}</div>
    </article>
  );
}

function Breakdown({
  label,
  value,
  tone,
  onClick,
}: {
  label: string;
  value: number | string;
  tone?: string;
  onClick?: () => void;
}) {
  const content = <>
    <p className="text-xs font-bold text-[var(--text-secondary)]">{label}</p>
    <p className={`text-[14px] font-extrabold tabular-nums ${tone ?? 'text-[var(--text-primary)]'}`}>
      {typeof value === 'number' ? formatNumber(value) : value}
    </p>
  </>;
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={`${label} 상품 보기`}
        className="flex w-full items-center justify-between gap-2 border-b border-[var(--border-subtle)] py-1.5 text-left transition-colors hover:text-[var(--primary)] last:border-b-0"
      >
        {content}
      </button>
    );
  }
  return (
    <div className="flex items-center justify-between gap-2 border-b border-[var(--border-subtle)] py-1.5 last:border-b-0">
      {content}
    </div>
  );
}
