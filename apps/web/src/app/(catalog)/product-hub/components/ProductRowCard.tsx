'use client';

import {
  ArrowRight,
  ArrowUpRight,
  Megaphone,
  PackageSearch,
  TrendingDown,
} from 'lucide-react';
import {
  cn,
  formatKRW,
  formatNumber,
  formatPercent,
  getGradeColor,
  getProductStatusBadge,
  getProfitColor,
  timeAgo,
} from '@/lib/utils';
import type { ProductGradeChange } from '../hooks/useProductGradeChanges';
import {
  gradeOf,
  rankChangeOf,
  rankOf,
  scoreOf,
  strategyOf,
  type GradeMap,
} from '../lib/abc-grading';
import type { ProductListItem as Product } from '../lib/product-types';

interface Props {
  product: Product;
  gradeMap: GradeMap;
  gradeChange?: ProductGradeChange;
  isChild?: boolean;
}

function MetricValue({ value }: { value: number | null | undefined }) {
  if (value === null || value === undefined) {
    return <span className="text-[var(--text-quaternary)] opacity-50">—</span>;
  }
  return <>{formatNumber(value)}</>;
}

function productRevenue(product: Product): number {
  return product.traffic?.revenue ?? product.t14?.revenue ?? product.revenue;
}

function productOrders(product: Product): number | null {
  return product.traffic?.orders ?? product.t14?.orders ?? product.orderCount ?? null;
}

function productSalesQty(product: Product): number | null {
  return product.traffic?.salesQty ?? product.t14?.salesQty ?? null;
}

function isRecentGradeChange(change: ProductGradeChange | undefined): change is ProductGradeChange {
  return Boolean(
    change && Date.now() - new Date(change.changedAt).getTime() <= 30 * 60 * 1000,
  );
}

export function ProductRowCard({ product: p, gradeMap, gradeChange, isChild = false }: Props) {
  const badge = getProductStatusBadge(p.status);
  const grade = gradeOf(p, gradeMap);
  const rank = rankOf(p, gradeMap);
  const change = rankChangeOf(p, gradeMap);
  const strategy = strategyOf(p, gradeMap);
  const isAdvertising = p.isAdvertising ?? Boolean(p.adTier);
  const revenue = productRevenue(p);
  const orders = productOrders(p);
  const salesQty = productSalesQty(p);
  const visitors = p.traffic?.visitors ?? null;
  const views = p.traffic?.views ?? null;
  const cartAdds = p.traffic?.cartAdds ?? null;
  const visibleGradeChange = isRecentGradeChange(gradeChange) ? gradeChange : undefined;
  const priority = p.profitRate < 0 ? 'loss' : isAdvertising ? 'ad' : null;
  const rowTone = priority === 'loss'
    ? 'border-rose-200 bg-rose-50/50 dark:bg-rose-500/5'
    : priority === 'ad'
      ? 'border-blue-200 bg-blue-50/40 dark:bg-blue-500/5'
      : 'border-[var(--border-subtle)] bg-[var(--card-bg)]';
  const leftBar = priority === 'loss' ? 'bg-rose-500' : priority === 'ad' ? 'bg-blue-500' : null;

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-2xl border px-6 py-5 shadow-sm transition hover:border-[var(--border-strong)] hover:shadow-md',
        rowTone,
        isChild && 'ml-6 border-l-4 border-l-[var(--primary)]',
      )}
    >
      {leftBar && !isChild ? (
        <span className={cn('absolute left-0 top-0 h-full w-1', leftBar)} aria-hidden />
      ) : null}

      <div className="grid grid-cols-[minmax(420px,1.45fr)_repeat(7,minmax(76px,.42fr))_72px] items-center gap-4">
        <div className="flex min-w-0 items-center gap-5">
          <div className="w-14 shrink-0 text-center">
            {rank > 0 ? (
              <>
                <p className="text-xl font-black tabular-nums text-[var(--text-tertiary)]">#{rank}</p>
                {change === null ? <p className="text-[10px] font-semibold text-[var(--text-muted)]">NEW</p> : null}
                {change !== null && change > 0 ? <p className="text-[10px] font-bold text-emerald-600">▲{change}</p> : null}
                {change !== null && change < 0 ? <p className="text-[10px] font-bold text-rose-600">▼{Math.abs(change)}</p> : null}
                {change === 0 ? <p className="text-[10px] text-[var(--text-muted)]">-</p> : null}
              </>
            ) : (
              <p className="text-sm font-semibold text-[var(--text-muted)]">-</p>
            )}
          </div>

          <div
            className={cn(
              'relative shrink-0 overflow-hidden rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-sunken)]',
              isChild ? 'h-16 w-16' : 'h-[88px] w-[88px]',
            )}
          >
            {p.thumbnailUrl || p.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={(p.thumbnailUrl || p.imageUrl)!} alt={p.name} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-[var(--text-muted)]">
                <PackageSearch size={22} />
              </div>
            )}
          </div>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-black', getGradeColor(grade))}>{grade}</span>
              {visibleGradeChange ? (
                <span
                  className={cn(
                    'inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-black',
                    visibleGradeChange.direction === 'downgrade'
                      ? 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300'
                      : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300',
                  )}
                  title={`등급 변경: ${visibleGradeChange.fromGrade} -> ${visibleGradeChange.toGrade}`}
                >
                  {visibleGradeChange.fromGrade}
                  <ArrowRight size={10} />
                  {visibleGradeChange.toGrade}
                  <span className="ml-0.5 font-semibold opacity-75">{timeAgo(visibleGradeChange.changedAt)}</span>
                </span>
              ) : null}
              <span className="rounded bg-[var(--surface-sunken)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--text-tertiary)]">
                {scoreOf(p, gradeMap)}점
              </span>
              <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-semibold', badge.color)}>{badge.label}</span>
              {isAdvertising ? (
                <span className="inline-flex items-center gap-1 rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold text-blue-700 dark:bg-blue-500/15 dark:text-blue-300">
                  <Megaphone size={10} /> 광고중
                </span>
              ) : null}
              {p.profitRate < 0 ? (
                <span className="inline-flex items-center gap-1 rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-bold text-rose-700 dark:bg-rose-500/15 dark:text-rose-300">
                  <TrendingDown size={10} /> 적자
                </span>
              ) : null}
            </div>
            <a href={`/product-hub/${p.id}`} className="mt-2 block truncate text-[17px] font-extrabold text-[var(--text-primary)] hover:text-[var(--primary)]">
              {p.name}
            </a>
            <p className="mt-1 truncate text-[11px] text-[var(--text-muted)]">
              ID {p.coupangProductId || '-'} · SKU {p.sku || '-'} · {p.category || '카테고리 없음'}
            </p>
            {strategy ? (
              <p className={cn('mt-1 text-[11px] font-semibold', grade === 'A' ? 'text-emerald-600' : grade === 'B' ? 'text-amber-600' : 'text-[var(--text-tertiary)]')}>
                {strategy}
              </p>
            ) : null}
          </div>
        </div>

        <MetricColumn value={visitors} label="방문" />
        <MetricColumn value={views} label="조회" />
        <MetricColumn value={cartAdds} label="장바구니" />
        <MetricColumn value={orders} label="주문" />
        <MetricColumn value={salesQty} label="판매" />
        <div className="text-right">
          <p className="truncate text-[22px] font-black leading-none tabular-nums text-[var(--text-primary)]">{formatKRW(revenue)}</p>
          <p className={cn('mt-2 text-[11px] font-semibold', getProfitColor(p.profitRate))}>이익률 {formatPercent(p.profitRate)}</p>
        </div>
        <div className="text-right">
          <p className={cn('text-[22px] font-black leading-none tabular-nums', p.adRate > 15 ? 'text-rose-600' : p.adRate > 0 ? 'text-[var(--text-primary)]' : 'text-[var(--text-quaternary)] opacity-50')}>
            {p.adRate > 0 ? formatPercent(p.adRate) : '—'}
          </p>
          <p className="mt-2 text-[11px] text-[var(--text-muted)]">광고비율</p>
        </div>
        <div className="flex justify-end">
          <a href={`/product-hub/${p.id}`} className="inline-flex h-10 items-center gap-1 rounded-xl bg-[var(--surface-sunken)] px-3 text-[12px] font-bold text-[var(--text-secondary)] hover:bg-[var(--primary-soft)] hover:text-[var(--primary)]">
            상세 <ArrowUpRight size={12} />
          </a>
        </div>
      </div>
    </div>
  );
}

function MetricColumn({ value, label }: { value: number | null; label: string }) {
  return (
    <div className="text-right">
      <p className="text-[22px] font-black leading-none tabular-nums text-[var(--text-primary)]"><MetricValue value={value} /></p>
      <p className="mt-2 text-[11px] text-[var(--text-muted)]">{label}</p>
    </div>
  );
}
