'use client';

import { useState } from 'react';
import { ArrowRight, ArrowUpRight, Boxes, ExternalLink, Loader2, Megaphone, PackageSearch, ShoppingCart, TrendingDown } from 'lucide-react';
import { toast } from 'sonner';
import { apiClient } from '@/lib/api-client';
import { isApiError } from '@/lib/api-error';
import { openCoupangWingInventory } from '@/lib/coupang-wing';
import { cn, formatKRW, formatNumber, formatPercent, getGradeColor, getProfitColor, getProductStatusBadge, timeAgo } from '@/lib/utils';
import type { ProductListItem as Product } from '../lib/product-types';
import type { GradeMap } from '../lib/abc-grading';
import { gradeOf, rankChangeOf, rankOf, scoreOf, strategyOf } from '../lib/abc-grading';
import type { ProductGradeChange } from '../hooks/useProductGradeChanges';

interface Props {
  product: Product;
  gradeMap: GradeMap;
  gradeChange?: ProductGradeChange;
  periodDays?: number;
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
  if (!change) return false;
  return Date.now() - new Date(change.changedAt).getTime() <= 30 * 60 * 1000;
}

interface StockPlan {
  availableStock: number;
  dailyAvg: number;
  leadTimeDays: number;
  leadTimeDemand: number;
  safetyStock: number;
  reorderPoint: number;
  optimalStock: number;
  recommendedOrderQty: number;
  daysUntilStockout: number | null;
  statusLabel: '품절' | '긴급 발주' | '발주 필요' | '주의' | '정상';
  statusTone: string;
}

const DEFAULT_LEAD_TIME_DAYS = 14;
const DEFAULT_SAFETY_DAYS = 7;
const DEFAULT_ORDER_CYCLE_DAYS = 30;

function buildStockPlan(product: Product, stock: number, periodDays: number, salesQty: number | null): StockPlan {
  const availableStock = product.availableStock ?? Math.max(stock - (product.reservedStock ?? 0), 0);
  const observedDailyAvg = salesQty !== null && periodDays > 0 ? salesQty / periodDays : 0;
  const configuredDailyAvg = product.dailySalesAvg ?? 0;
  const dailyAvg = Math.max(observedDailyAvg, configuredDailyAvg, 0);
  const leadTimeDays = product.leadTimeDays ?? DEFAULT_LEAD_TIME_DAYS;
  const leadTimeDemand = Math.ceil(dailyAvg * leadTimeDays);
  const safetyStock = product.safetyStock > 0
    ? product.safetyStock
    : Math.ceil(dailyAvg * DEFAULT_SAFETY_DAYS);
  const reorderPoint = product.reorderPoint > 0
    ? product.reorderPoint
    : leadTimeDemand + safetyStock;
  const optimalStock = product.optimalStock > 0
    ? product.optimalStock
    : reorderPoint + Math.ceil(dailyAvg * DEFAULT_ORDER_CYCLE_DAYS);
  const recommendedOrderQty = Math.max(
    product.recommendedOrderQty || product.reorderQuantity || optimalStock - availableStock,
    0,
  );
  const daysUntilStockout = product.daysUntilStockout ?? (dailyAvg > 0 ? Math.floor(availableStock / dailyAvg) : null);

  if (availableStock <= 0) {
    return { availableStock, dailyAvg, leadTimeDays, leadTimeDemand, safetyStock, reorderPoint, optimalStock, recommendedOrderQty, daysUntilStockout, statusLabel: '품절', statusTone: 'bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300' };
  }
  if (daysUntilStockout !== null && daysUntilStockout <= leadTimeDays) {
    return { availableStock, dailyAvg, leadTimeDays, leadTimeDemand, safetyStock, reorderPoint, optimalStock, recommendedOrderQty, daysUntilStockout, statusLabel: '긴급 발주', statusTone: 'bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300' };
  }
  if (availableStock <= reorderPoint) {
    return { availableStock, dailyAvg, leadTimeDays, leadTimeDemand, safetyStock, reorderPoint, optimalStock, recommendedOrderQty, daysUntilStockout, statusLabel: '발주 필요', statusTone: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300' };
  }
  if (daysUntilStockout !== null && daysUntilStockout <= leadTimeDays + DEFAULT_SAFETY_DAYS) {
    return { availableStock, dailyAvg, leadTimeDays, leadTimeDemand, safetyStock, reorderPoint, optimalStock, recommendedOrderQty, daysUntilStockout, statusLabel: '주의', statusTone: 'bg-yellow-50 text-yellow-700 dark:bg-yellow-500/15 dark:text-yellow-300' };
  }
  return { availableStock, dailyAvg, leadTimeDays, leadTimeDemand, safetyStock, reorderPoint, optimalStock, recommendedOrderQty, daysUntilStockout, statusLabel: '정상', statusTone: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' };
}

function formatDailyAvg(value: number): string {
  if (value <= 0) return '-';
  if (value < 1) return value.toFixed(2);
  return value.toFixed(1);
}

export function ProductRowCard({ product: p, gradeMap, gradeChange, periodDays = 14, isChild = false }: Props) {
  const [creatingOrder, setCreatingOrder] = useState(false);
  const badge = getProductStatusBadge(p.status);
  const grade = gradeOf(p, gradeMap);
  const rank = rankOf(p, gradeMap);
  const change = rankChangeOf(p, gradeMap);
  const strategy = strategyOf(p, gradeMap);
  const isAdvertising = p.isAdvertising ?? Boolean(p.adTier);
  const stock = p.currentStock ?? 0;
  const stockStatus = p.stockStatus ?? (stock <= 0 ? 'out' : stock <= 10 ? 'low' : 'healthy');
  const isOutOfStock = stockStatus === 'out';
  const isLowStock = stockStatus === 'low';
  const revenue = productRevenue(p);
  const orders = productOrders(p);
  const salesQty = productSalesQty(p);
  const stockPlan = buildStockPlan(p, stock, periodDays, salesQty);
  const recommendedOrderQty = stockPlan.recommendedOrderQty;
  const visitors = p.traffic?.visitors ?? null;
  const views = p.traffic?.views ?? null;
  const cartAdds = p.traffic?.cartAdds ?? null;
  const visibleGradeChange = isRecentGradeChange(gradeChange) ? gradeChange : undefined;

  const priority: 'loss' | 'stock' | 'ad' | null = (() => {
    if (p.profitRate < 0) return 'loss';
    if (stock <= 0) return 'stock';
    if (isAdvertising) return 'ad';
    return null;
  })();

  const rowTone = (() => {
    if (priority === 'loss') return 'border-rose-200 bg-rose-50/50 dark:bg-rose-500/5';
    if (priority === 'ad') return 'border-blue-200 bg-blue-50/40 dark:bg-blue-500/5';
    if (priority === 'stock') return 'border-amber-200 bg-amber-50/40 dark:bg-amber-500/5';
    return 'border-[var(--border-subtle)] bg-[var(--card-bg)]';
  })();

  const leftBar = (() => {
    if (priority === 'loss') return 'bg-rose-500';
    if (priority === 'stock') return 'bg-amber-500';
    if (priority === 'ad') return 'bg-blue-500';
    return null;
  })();

  const handleOpenCoupangStock = () => {
    openCoupangWingInventory(p.coupangProductId || p.sku || p.name);
  };

  const handleCreatePurchaseOrder = async () => {
    if (recommendedOrderQty <= 0) {
      toast.message('발주점과 권장 발주 수량을 먼저 설정해 주세요.');
      return;
    }
    setCreatingOrder(true);
    try {
      await apiClient.post('/api/purchase-orders', {
        action: 'create',
        supplierName: '미지정 공급처',
        items: [{
          productName: p.name,
          optionId: p.optionId ?? undefined,
          quantity: recommendedOrderQty,
          unitPriceCny: 0,
        }],
      });
      toast.success(`${p.name} 발주 초안을 만들었어요.`);
    } catch (err) {
      toast.error(isApiError(err) ? err.detail : '발주 초안 생성에 실패했습니다.');
    } finally {
      setCreatingOrder(false);
    }
  };

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-2xl border px-6 py-5 shadow-sm transition hover:border-[var(--border-strong)] hover:shadow-md',
        rowTone,
        isChild && 'ml-6 border-l-4 border-l-[var(--primary)]',
      )}
    >
      {leftBar && !isChild && (
        <span className={cn('absolute left-0 top-0 h-full w-1', leftBar)} aria-hidden />
      )}

      <div className="grid grid-cols-[minmax(420px,1.45fr)_repeat(8,minmax(76px,.42fr))_72px] items-center gap-4">
        <div className="flex min-w-0 items-center gap-5">
          <div className="w-14 shrink-0 text-center">
            {rank > 0 ? (
              <>
                <p className="text-xl font-black tabular-nums text-[var(--text-tertiary)]">#{rank}</p>
                {change === null && <p className="text-[10px] font-semibold text-[var(--text-muted)]">NEW</p>}
                {change !== null && change > 0 && <p className="text-[10px] font-bold text-emerald-600">▲{change}</p>}
                {change !== null && change < 0 && <p className="text-[10px] font-bold text-rose-600">▼{Math.abs(change)}</p>}
                {change === 0 && <p className="text-[10px] text-[var(--text-muted)]">-</p>}
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
              <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-black', getGradeColor(grade))}>
                {grade}
              </span>
              {visibleGradeChange && (
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
              )}
              <span className="rounded bg-[var(--surface-sunken)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--text-tertiary)]">
                {scoreOf(p, gradeMap)}점
              </span>
              <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-semibold', badge.color)}>
                {badge.label}
              </span>
              {isAdvertising && (
                <span className="inline-flex items-center gap-1 rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold text-blue-700 dark:bg-blue-500/15 dark:text-blue-300">
                  <Megaphone size={10} /> 광고중
                </span>
              )}
              {isOutOfStock && (
                <span className="inline-flex items-center gap-1 rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-bold text-rose-700 dark:bg-rose-500/15 dark:text-rose-300">
                  <Boxes size={10} /> 품절
                </span>
              )}
              {isLowStock && (
                <span className="inline-flex items-center gap-1 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
                  <Boxes size={10} /> 저재고
                </span>
              )}
              {p.profitRate < 0 && (
                <span className="inline-flex items-center gap-1 rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-bold text-rose-700 dark:bg-rose-500/15 dark:text-rose-300">
                  <TrendingDown size={10} /> 적자
                </span>
              )}
            </div>
            <a
              href={`/product-hub/${p.id}`}
              className="mt-2 block truncate text-[17px] font-extrabold text-[var(--text-primary)] hover:text-[var(--primary)]"
            >
              {p.name}
            </a>
            <p className="mt-1 truncate text-[11px] text-[var(--text-muted)]">
              ID {p.coupangProductId || '-'} · SKU {p.sku || '-'} · {p.category || '카테고리 없음'}
            </p>
            {strategy && (
              <p className={cn('mt-1 text-[11px] font-semibold', grade === 'A' ? 'text-emerald-600' : grade === 'B' ? 'text-amber-600' : 'text-[var(--text-tertiary)]')}>
                {strategy}
              </p>
            )}
          </div>
        </div>

        <div className="text-right">
          <p className={cn('text-[22px] font-black leading-none tabular-nums', isOutOfStock ? 'text-rose-600' : isLowStock ? 'text-amber-600' : 'text-[var(--text-primary)]')}>
            {formatNumber(stock)}
          </p>
          <p className="mt-2 text-[11px] font-medium text-[var(--text-muted)]">재고</p>
        </div>

        <div className="text-right">
          <p className="text-[22px] font-black leading-none tabular-nums text-[var(--text-primary)]"><MetricValue value={visitors} /></p>
          <p className="mt-2 text-[11px] text-[var(--text-muted)]">방문</p>
        </div>

        <div className="text-right">
          <p className="text-[22px] font-black leading-none tabular-nums text-[var(--text-primary)]"><MetricValue value={views} /></p>
          <p className="mt-2 text-[11px] text-[var(--text-muted)]">조회</p>
        </div>

        <div className="text-right">
          <p className="text-[22px] font-black leading-none tabular-nums text-[var(--text-primary)]"><MetricValue value={cartAdds} /></p>
          <p className="mt-2 text-[11px] text-[var(--text-muted)]">장바구니</p>
        </div>

        <div className="text-right">
          <p className="text-[22px] font-black leading-none tabular-nums text-[var(--text-primary)]"><MetricValue value={orders} /></p>
          <p className="mt-2 text-[11px] text-[var(--text-muted)]">주문</p>
        </div>

        <div className="text-right">
          <p className="text-[22px] font-black leading-none tabular-nums text-[var(--text-primary)]"><MetricValue value={salesQty} /></p>
          <p className="mt-2 text-[11px] text-[var(--text-muted)]">판매</p>
        </div>

        <div className="text-right">
          <p className="truncate text-[22px] font-black leading-none tabular-nums text-[var(--text-primary)]">{formatKRW(revenue)}</p>
          <p className={cn('mt-2 text-[11px] font-semibold', getProfitColor(p.profitRate))}>
            이익률 {formatPercent(p.profitRate)}
          </p>
        </div>

        <div className="text-right">
          <p className={cn(
            'text-[22px] font-black leading-none tabular-nums',
            p.adRate > 15 ? 'text-rose-600' : p.adRate > 0 ? 'text-[var(--text-primary)]' : 'text-[var(--text-quaternary)] opacity-50',
          )}>
            {p.adRate > 0 ? formatPercent(p.adRate) : '—'}
          </p>
          <p className="mt-2 text-[11px] text-[var(--text-muted)]">광고비율</p>
        </div>

        <div className="flex justify-end">
          <a
            href={`/product-hub/${p.id}`}
            className="inline-flex h-10 items-center gap-1 rounded-xl bg-[var(--surface-sunken)] px-3 text-[12px] font-bold text-[var(--text-secondary)] hover:bg-[var(--primary-soft)] hover:text-[var(--primary)]"
          >
            상세 <ArrowUpRight size={12} />
          </a>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-2">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-semibold text-[var(--text-tertiary)]">
          <span className={cn('rounded px-2 py-1 font-bold', stockPlan.statusTone)}>
            {stockPlan.statusLabel}
          </span>
          <span>{stockPlan.dailyAvg > 0 ? `일평균 ${formatDailyAvg(stockPlan.dailyAvg)}개` : '일평균 계산전'}</span>
          <span>리드타임 {formatNumber(stockPlan.leadTimeDays)}일</span>
          <span>리드타임 수요 {formatNumber(stockPlan.leadTimeDemand)}개</span>
          <span>가용 {formatNumber(stockPlan.availableStock)}개</span>
          <span>안전 {formatNumber(stockPlan.safetyStock)}개</span>
          <span>발주점 {formatNumber(stockPlan.reorderPoint)}개</span>
          <span>적정 {formatNumber(stockPlan.optimalStock)}개</span>
          <span>소진예상 {stockPlan.daysUntilStockout === null ? '계산전' : `${formatNumber(stockPlan.daysUntilStockout)}일`}</span>
          {recommendedOrderQty > 0 && (
            <span className="rounded bg-amber-50 px-2 py-1 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
              권장발주 {formatNumber(recommendedOrderQty)}개
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isOutOfStock && (
            <button
              type="button"
              onClick={handleOpenCoupangStock}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-rose-600 px-3 text-[11px] font-bold text-white shadow-sm hover:bg-rose-700"
              title="쿠팡 Wing 재고/판매상태 화면을 열어 품절 처리합니다."
            >
              <ExternalLink size={13} /> 쿠팡 품절처리
            </button>
          )}
          {(isLowStock || isOutOfStock) && (
            <button
              type="button"
              onClick={handleCreatePurchaseOrder}
              disabled={creatingOrder}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[var(--primary)] px-3 text-[11px] font-bold text-white shadow-sm hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              title="권장 발주 수량으로 발주 초안을 생성합니다."
            >
              {creatingOrder ? <Loader2 size={13} className="animate-spin" /> : <ShoppingCart size={13} />}
              발주 초안
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
