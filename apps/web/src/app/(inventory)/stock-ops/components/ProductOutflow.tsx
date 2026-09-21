'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowDown, ArrowDownRight, ArrowUpRight, Loader2, Minus, Search } from 'lucide-react';
import { queryKeys } from '@/lib/query-keys';
import { cn, formatNumber, formatDateTime } from '@/lib/utils';
import { fetchSellpiaProductSales } from '@/lib/sellpia-product-sales-api';
import { ProductAbcBadge } from '@/components/product-abc/ProductAbcBadge';
import {
  PRODUCT_ABC_DISPLAY_STATUS_LABELS,
  productAbcDisplayStatus,
} from '@kiditem/shared/product-abc';
import { SellpiaSyncAction } from '../../_shared/SellpiaSyncAction';
import { ProductOutflowDestinations, abcReadTitle } from './ProductOutflowDestinations';
import type {
  SellpiaProductSalesRow,
  SellpiaProductSalesSummary,
  SellpiaProductTrend,
} from '@kiditem/shared/dashboard';

const MONTHS_WINDOW = 13; // 1년(완결 12개월 + 진행 월)

// 정렬 키: 고정 지표('avg2m'|'currentStock') 또는 특정 연월("YYYY-MM").
type SortKey = 'avg2m' | 'currentStock' | string;
type FilterKey =
  | 'all'
  | 'reorder'
  | 'mapping'
  | 'dead'
  | 'A'
  | 'B'
  | 'C'
  | 'unclassified';

export default function ProductOutflow() {
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('avg2m');
  const [filter, setFilter] = useState<FilterKey>('all');

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: queryKeys.inventory.productSales(MONTHS_WINDOW),
    queryFn: () => fetchSellpiaProductSales({ months: MONTHS_WINDOW }),
    refetchInterval: 60_000,
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="text-sm font-bold text-slate-900">상품별 월간 소진 · 재고관리</h3>
          {data?.completeMonths && data.completeMonths.length > 0 && (
            <span className="text-xs text-slate-400">
              완결 {data.completeMonths.length}개월 · 월별 주문수량
            </span>
          )}
          {data?.lastCapturedAt && (
            <span className="text-xs text-slate-300">· 수집 {formatDateTime(data.lastCapturedAt)}</span>
          )}
          {data?.stockGeneration && (
            <span className="text-xs text-slate-400">· 재고 세대 {data.stockGeneration} · 검증 {data.stockCapturedAt ? formatDateTime(data.stockCapturedAt) : '미확인'}</span>
          )}
          <span className="text-[11px] text-slate-300">· 메이크샵 주문 기준</span>
        </div>
        <SellpiaSyncAction compact showStatus />
      </div>

      {isLoading ? (
        <div className="h-40 flex items-center justify-center text-sm text-slate-300">
          <Loader2 className="w-4 h-4 animate-spin mr-2" /> 상품별 소진 불러오는 중...
        </div>
      ) : isError ? (
        <div className="h-40 flex flex-col items-center justify-center gap-2 text-sm text-slate-400">
          <span>불러오지 못했습니다.</span>
          <button onClick={() => refetch()} className="text-xs text-purple-600 hover:underline">다시 시도</button>
        </div>
      ) : !data || !data.hasData ? (
        <div className="h-40 flex items-center justify-center text-sm text-slate-400">
          <span>아직 수집된 상품별 소진 데이터가 없습니다.</span>
        </div>
      ) : (
        <ProductOutflowTable
          summary={data}
          search={search}
          onSearch={setSearch}
          sortKey={sortKey}
          onSort={setSortKey}
          filter={filter}
          onFilter={setFilter}
        />
      )}
    </div>
  );
}

const SEASON_STYLE: Record<string, string> = {
  여름: 'bg-amber-50 text-amber-700',
  겨울: 'bg-blue-50 text-blue-700',
  어린이날: 'bg-rose-50 text-rose-700',
  신학기: 'bg-violet-50 text-violet-700',
  상시: 'bg-slate-50 text-slate-400',
};

function monthLabel(ym: string): { mon: string; yr: string } {
  const [y, m] = ym.split('-');
  return { mon: `${Number(m)}월`, yr: (y ?? '').slice(2) };
}

// 각 상품 행에 연월→주문수량 맵과 피크 연월을 붙여 정렬/렌더에 사용.
interface RowVM {
  row: SellpiaProductSalesRow;
  monthMap: Map<string, number>;
  peakYm: string | null;
}

function ProductOutflowTable({
  summary,
  search,
  onSearch,
  sortKey,
  onSort,
  filter,
  onFilter,
}: {
  summary: SellpiaProductSalesSummary;
  search: string;
  onSearch: (v: string) => void;
  sortKey: SortKey;
  onSort: (k: SortKey) => void;
  filter: FilterKey;
  onFilter: (f: FilterKey) => void;
}) {
  const hasStock = summary.hasStock;
  const completeSet = useMemo(() => new Set(summary.completeMonths), [summary.completeMonths]);
  // 최신 → 과거(왼쪽 → 오른쪽). 오른쪽으로 갈수록 과거(1월 방향).
  const monthsDesc = useMemo(() => [...summary.months].reverse(), [summary.months]);

  const filterChips = useMemo(() => {
    const chips: { key: FilterKey; label: string; count: number; tone: string }[] = [
      { key: 'all', label: '전체', count: summary.productCount, tone: 'slate' },
    ];
    if (hasStock) chips.push({ key: 'reorder', label: '발주 필요', count: summary.reorderCount, tone: 'amber' });
    chips.push({ key: 'mapping', label: '매칭 필요', count: summary.inventoryResolutionCounts.mappingRequiredSalesRows, tone: 'orange' });
    chips.push({ key: 'dead', label: '악성재고', count: summary.deadStockCount, tone: 'rose' });
    chips.push({ key: 'A', label: 'A등급', count: summary.abcCounts.A, tone: 'emerald' });
    chips.push({ key: 'B', label: 'B등급', count: summary.abcCounts.B, tone: 'sky' });
    chips.push({ key: 'C', label: 'C등급', count: summary.abcCounts.C, tone: 'slate' });
    chips.push({ key: 'unclassified', label: '미분류', count: summary.unclassifiedProductCount, tone: 'slate' });
    return chips;
  }, [summary, hasStock]);

  const rows = useMemo<RowVM[]>(() => {
    const q = search.trim().toLowerCase();
    let list = summary.products;
    if (q) {
      list = list.filter(
        (p) =>
          p.productName.toLowerCase().includes(q) ||
          (p.providerName ?? '').toLowerCase().includes(q) ||
          (p.barcode ?? '').includes(q),
      );
    }
    if (filter === 'reorder') list = list.filter((p) => p.needsReorder);
    else if (filter === 'mapping') list = list.filter((p) => p.inventoryResolution.status === 'mapping_required');
    else if (filter === 'dead') list = list.filter((p) => p.deadStock);
    else if (filter === 'A' || filter === 'B' || filter === 'C') {
      list = list.filter((p) => p.inventoryResolution.status === 'matched'
        && p.inventoryResolution.inventoryProduct?.abc.abcGrade === filter);
    } else if (filter === 'unclassified') {
      list = list.filter((p) => p.inventoryResolution.status === 'matched'
        && p.inventoryResolution.inventoryProduct?.abc.abcGrade === null);
    }

    const vms: RowVM[] = list.map((row) => {
      const monthMap = new Map<string, number>();
      let peakYm: string | null = null;
      let peak = -1;
      for (const pt of row.monthly) {
        monthMap.set(pt.yearMonth, pt.orderQty);
        if (pt.orderQty > peak) { peak = pt.orderQty; peakYm = pt.yearMonth; }
      }
      if (peak <= 0) peakYm = null;
      return { row, monthMap, peakYm };
    });

    const valOf = (vm: RowVM): number => {
      if (sortKey === 'avg2m') return vm.row.avg2m;
      if (sortKey === 'currentStock') return vm.row.inventoryResolution.status === 'matched'
        ? vm.row.inventoryResolution.currentStock
        : -1;
      return vm.monthMap.get(sortKey) ?? 0; // 특정 연월
    };
    return vms.sort((a, b) => valOf(b) - valOf(a) || b.row.totalQty - a.row.totalQty);
  }, [summary.products, search, sortKey, filter]);

  const HeaderSort = ({ k, children, className }: { k: SortKey; children: React.ReactNode; className?: string }) => (
    <button
      onClick={() => onSort(k)}
      className={cn('inline-flex items-center gap-0.5 font-semibold', sortKey === k ? 'text-slate-900' : 'text-slate-400 hover:text-slate-600', className)}
    >
      {children}
      {sortKey === k && <ArrowDown className="w-3 h-3" />}
    </button>
  );

  return (
    <>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 flex-wrap">
          {filterChips.map((c) => (
            <button
              key={c.key}
              onClick={() => onFilter(c.key)}
              className={cn(
                'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 transition-colors',
                filter === c.key
                  ? c.tone === 'amber' ? 'bg-amber-500 text-white ring-amber-500'
                    : c.tone === 'rose' ? 'bg-rose-500 text-white ring-rose-500'
                    : c.tone === 'orange' ? 'bg-orange-500 text-white ring-orange-500'
                    : c.tone === 'emerald' ? 'bg-emerald-600 text-white ring-emerald-600'
                    : c.tone === 'sky' ? 'bg-sky-600 text-white ring-sky-600'
                    : c.tone === 'violet' ? 'bg-violet-600 text-white ring-violet-600'
                    : 'bg-slate-900 text-white ring-slate-900'
                  : 'bg-white text-slate-500 ring-slate-200 hover:bg-slate-50',
              )}
            >
              {c.label}
              <span className="tabular-nums opacity-80">{formatNumber(c.count)}</span>
            </button>
          ))}
        </div>
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="상품명·매입처·바코드 검색"
            className="pl-8 pr-3 py-1.5 rounded-lg text-sm border border-slate-200 bg-white text-slate-900 w-56 focus:outline-none focus:ring-2 focus:ring-purple-200"
          />
        </div>
      </div>

      <div className="flex items-center justify-between text-xs text-slate-400">
        <span>{formatNumber(rows.length)}개 상품 · 왼쪽=최신, 오른쪽으로 갈수록 과거(월 헤더 클릭 시 그 달 기준 정렬)</span>
        {!hasStock && (
          <span className="text-[11px] text-amber-600">현재고 값·발주 알림은 셀피아 재고 수집 후 표시됩니다</span>
        )}
      </div>

      <div className="max-h-[76vh] overflow-x-auto overflow-y-auto rounded-xl border border-slate-100 [scrollbar-width:thin]">
        <table className="text-sm border-separate border-spacing-0 min-w-max">
          <thead className="sticky top-0 z-20">
            <tr className="text-slate-500 text-xs bg-slate-50">
              <th className="sticky left-0 z-40 w-14 min-w-14 bg-slate-50 px-1 py-2 text-center font-semibold border-b border-slate-200">등급</th>
              <th className="sticky left-14 z-30 bg-slate-50 text-left font-semibold px-3 py-2 border-b border-slate-200 min-w-[260px]">상품</th>
              <th className="bg-slate-50 text-left font-semibold px-3 py-2 border-b border-slate-200 whitespace-nowrap">매입처</th>
              {hasStock && (
                <th className="bg-slate-50 px-3 py-2 text-right border-b border-slate-200 whitespace-nowrap">
                  <HeaderSort k="currentStock">현재고</HeaderSort>
                </th>
              )}
              <th className="min-w-[220px] bg-slate-50 px-3 py-2 text-left font-semibold border-b border-slate-200 whitespace-nowrap">채널 상품</th>
              {hasStock && <th className="bg-slate-50 px-3 py-2 text-right font-semibold border-b border-slate-200 whitespace-nowrap">발주</th>}
              <th className="bg-slate-50 px-3 py-2 text-right border-b border-slate-200 whitespace-nowrap">
                <HeaderSort k="avg2m">월평균</HeaderSort>
              </th>
              <th className="bg-slate-50 px-2 py-2 text-center font-semibold border-b border-slate-200">추세</th>
              {monthsDesc.map((ym) => {
                const { mon, yr } = monthLabel(ym);
                const inProgress = !completeSet.has(ym);
                return (
                  <th key={ym} className={cn('px-2 py-1.5 text-right border-b border-slate-200 border-l border-slate-100 min-w-[64px]', inProgress && 'bg-amber-50/60')}>
                    <HeaderSort k={ym} className="flex-col !items-end leading-tight">
                      <span className={cn(sortKey === ym ? 'text-slate-900' : 'text-slate-600')}>{mon}</span>
                      <span className="text-[9px] text-slate-300 font-normal">'{yr}{inProgress ? ' 진행' : ''}</span>
                    </HeaderSort>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((vm) => (
              <ProductRow key={`${vm.row.productCode}-${vm.row.optionCode}`} vm={vm} monthsDesc={monthsDesc} hasStock={hasStock} sortKey={sortKey} />
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function TrendIcon({ trend }: { trend: SellpiaProductTrend }) {
  if (trend === 'up') return <ArrowUpRight className="w-4 h-4 text-emerald-500 inline" aria-label="상승" />;
  if (trend === 'down') return <ArrowDownRight className="w-4 h-4 text-rose-500 inline" aria-label="하락" />;
  return <Minus className="w-4 h-4 text-slate-300 inline" aria-label="보합" />;
}

function ProductRow({ vm, monthsDesc, hasStock, sortKey }: { vm: RowVM; monthsDesc: string[]; hasStock: boolean; sortKey: SortKey }) {
  const { row: p, monthMap, peakYm } = vm;
  const resolution = p.inventoryResolution;
  const abc = resolution.status === 'matched' ? resolution.inventoryProduct?.abc : null;
  const abcStatus = abc ? productAbcDisplayStatus(abc) : null;
  const rowBg = p.deadStock ? 'bg-rose-50/40' : 'bg-white';
  return (
    <tr className={cn('border-t border-slate-50 group', rowBg)}>
      <td className={cn('sticky left-0 z-20 w-14 min-w-14 px-1 py-2 text-center border-b border-slate-50', rowBg, 'group-hover:bg-slate-50')}>
        {resolution.status === 'matched'
          ? <>
              <ProductAbcBadge grade={abc?.abcGrade ?? null} evaluation={abc?.evaluation ?? null} compact />
              {abc && abcStatus && abcStatus !== 'READY' ? (
                <span className="block text-[10px] text-amber-700" title={abcReadTitle(abc)}>
                  {PRODUCT_ABC_DISPLAY_STATUS_LABELS[abcStatus]}
                </span>
              ) : null}
            </>
          : <span className="text-xs text-slate-300">—</span>}
      </td>
      <td className={cn('sticky left-14 z-10 px-3 py-2 border-b border-slate-50 max-w-[300px]', rowBg, 'group-hover:bg-slate-50')}>
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="text-slate-800 truncate" title={p.productName}>{p.productName}</span>
        </div>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className="text-[11px] text-slate-400 truncate">
            {p.optionName ? `${p.optionName} · ` : ''}{p.barcode ?? p.productCode}
          </span>
          {p.deadStock && (
            <span className="text-[10px] font-semibold text-rose-600 bg-rose-100 rounded px-1 py-px whitespace-nowrap" title={p.deadStockReason ?? undefined}>
              악성{p.deadStockReason ? ` · ${p.deadStockReason}` : ''}
            </span>
          )}
          {p.seasonTag && p.seasonTag !== '상시' && (
            <span className={cn('text-[10px] font-semibold rounded px-1 py-px whitespace-nowrap', SEASON_STYLE[p.seasonTag] ?? 'bg-slate-50 text-slate-400')}>
              {p.seasonTag}
            </span>
          )}
          {resolution.status === 'matched' && resolution.salesRowCount > 1 ? (
            <span className="whitespace-nowrap rounded bg-violet-50 px-1 py-px text-[10px] font-semibold text-violet-700">판매 행 {resolution.salesRowCount}개 수요 합산</span>
          ) : null}
        </div>
      </td>
      <td className="px-3 py-2 text-slate-500 text-xs whitespace-nowrap border-b border-slate-50">{p.providerName ?? '-'}</td>
      {hasStock && (
        <td className="px-3 py-2 text-right tabular-nums font-semibold text-slate-800 border-b border-slate-50">
          {resolution.status === 'matched' ? formatNumber(resolution.currentStock) : '—'}
        </td>
      )}
      <td className="max-w-[280px] px-3 py-2 border-b border-slate-50">
        {resolution.status === 'matched' ? (
          <ProductOutflowDestinations destinations={resolution.destinations} />
        ) : resolution.status === 'mapping_required' ? (
          <span className="whitespace-nowrap rounded bg-amber-100 px-1.5 py-0.5 text-xs font-bold text-amber-800">
            매칭 필요 · {resolution.reason === 'not_found' ? 'SKU 없음' : '바코드 중복'}
          </span>
        ) : (
          <span className="whitespace-nowrap text-xs font-semibold text-slate-400">재고 미수집</span>
        )}
      </td>
      {hasStock && (
        <td className="px-3 py-2 text-right whitespace-nowrap border-b border-slate-50">
          {resolution.status !== 'matched' ? (
            <span className="text-xs font-semibold text-amber-700">{resolution.status === 'mapping_required' ? '매칭 필요' : '재고 미수집'}</span>
          ) : p.needsReorder ? (
            <span className="inline-flex items-center rounded-full bg-amber-500 text-white text-[11px] font-bold px-2 py-0.5">발주 필요</span>
          ) : p.monthsOfAvailableStockLeft === null ? (
            <span className="text-xs text-slate-300">—</span>
          ) : (
            <span className="text-xs tabular-nums text-slate-500">{p.monthsOfAvailableStockLeft}개월</span>
          )}
        </td>
      )}
      <td className={cn('px-3 py-2 text-right tabular-nums font-bold border-b border-slate-50', sortKey === 'avg2m' ? 'text-slate-900' : 'text-slate-700')}>
        {formatNumber(p.avg2m)}
      </td>
      <td className="px-2 py-2 text-center border-b border-slate-50"><TrendIcon trend={p.trend} /></td>
      {monthsDesc.map((ym) => {
        const v = monthMap.get(ym) ?? 0;
        const isPeak = ym === peakYm;
        const isSorted = ym === sortKey;
        return (
          <td key={ym} className={cn('px-2 py-2 text-right tabular-nums border-b border-slate-50 border-l border-slate-50', isSorted && 'bg-slate-50/70')}>
            {v > 0 ? (
              <span
                className={cn(isPeak ? 'font-bold text-purple-700' : 'text-slate-600')}
              >
                {formatNumber(v)}
              </span>
            ) : (
              <span className="text-slate-200">0</span>
            )}
          </td>
        );
      })}
    </tr>
  );
}
