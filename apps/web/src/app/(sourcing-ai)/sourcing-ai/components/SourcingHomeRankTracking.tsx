'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useQueries, useQuery } from '@tanstack/react-query';
import { ArrowRight, Target, TrendingDown, TrendingUp } from 'lucide-react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatNumber } from '@/lib/utils';
import { fetchMyProductRankChanges, type MyProductRankRow } from '../lib/coupang-rank-tracking-api';
import {
  fetchWingTrackedHistory,
  listWingTrackedProducts,
  type WingTrackedProduct,
} from '../lib/wing-tracking-api';

const CHART_LINE_COLORS = ['#7c3aed', '#ea580c', '#0284c7', '#059669', '#db2777'];

/**
 * 소싱 홈 · 상품 추적 상황 — 내가 추적 중인 쿠팡 상품 + SERP 순위 변동(상승/하락 반반).
 */
export function SourcingHomeRankTracking() {
  const { data: rankData } = useQuery({
    queryKey: ['sourcing', 'home', 'my-product-ranks'],
    queryFn: () => fetchMyProductRankChanges(7),
    refetchInterval: 60_000,
  });
  const { data: trackedProducts = [] } = useQuery({
    queryKey: ['sourcing', 'home', 'wing-tracked'],
    queryFn: listWingTrackedProducts,
    refetchInterval: 60_000,
  });

  const { rising, falling } = useMemo(() => {
    const changed = (rankData?.rows ?? []).filter(
      (r) => r.rankChange != null && r.rankChange !== 0,
    );
    return {
      rising: changed
        .filter((r) => (r.rankChange ?? 0) > 0)
        .sort((a, b) => (b.rankChange ?? 0) - (a.rankChange ?? 0))
        .slice(0, 10),
      falling: changed
        .filter((r) => (r.rankChange ?? 0) < 0)
        .sort((a, b) => (a.rankChange ?? 0) - (b.rankChange ?? 0))
        .slice(0, 10),
    };
  }, [rankData?.rows]);

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-bold text-slate-900">상품 추적 상황</h2>
        <Link
          href="/rank-tracking"
          className="inline-flex items-center gap-0.5 text-sm font-bold text-violet-600 hover:underline"
        >
          내 쿠팡 상품 순위 추적
          <ArrowRight size={13} />
        </Link>
      </div>

      <TrackedProductsPanel products={trackedProducts} />

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <RankPanel title="순위 상승" tone="up" rows={rising} />
        <RankPanel title="순위 하락" tone="down" rows={falling} />
      </div>
    </section>
  );
}

function TrackedProductsPanel({ products }: { products: WingTrackedProduct[] }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5">
        <div className="flex items-center gap-1.5">
          <Target size={16} className="text-violet-600" />
          <span className="text-sm font-bold text-slate-900">추적 중인 상품</span>
        </div>
        <span className="rounded-full bg-violet-50 px-2 py-0.5 text-xs font-bold tabular-nums text-violet-700">
          {formatNumber(products.length)}개
        </span>
      </div>
      {products.length === 0 ? (
        <p className="px-4 py-8 text-center text-xs font-semibold text-slate-400">
          추적으로 등록한 상품이 없습니다. 쿠팡 상품 분석에서 추적을 추가하세요.
        </p>
      ) : (
        <>
          <div className="grid gap-px bg-slate-100 sm:grid-cols-2 xl:grid-cols-3">
            {products.slice(0, 12).map((product) => (
              <TrackedRow key={product.id} product={product} />
            ))}
          </div>
          <TrackedProductsChart products={products} />
        </>
      )}
    </section>
  );
}

/** 추적 중인 상품(상위 5개)의 28일 판매량 추이 그래프. */
function TrackedProductsChart({ products }: { products: WingTrackedProduct[] }) {
  const top = products.slice(0, 5);
  const histories = useQueries({
    queries: top.map((product) => ({
      queryKey: ['wing-tracked-history', product.id],
      queryFn: () => fetchWingTrackedHistory(product.id, 30),
      staleTime: 5 * 60 * 1000,
    })),
  });

  const { data, series } = useMemo(() => {
    const byDate = new Map<string, Record<string, number | string>>();
    const lines: Array<{ key: string; name: string; color: string }> = [];
    top.forEach((product, index) => {
      const points = histories[index]?.data?.points ?? [];
      if (points.length === 0) return;
      const key = `p${index}`;
      lines.push({
        key,
        name: product.productName,
        color: CHART_LINE_COLORS[index % CHART_LINE_COLORS.length],
      });
      for (const snapshot of points) {
        if (snapshot.salesLast28d == null) continue;
        const date = snapshot.businessDate.slice(5, 10);
        const row = byDate.get(date) ?? { date };
        row[key] = snapshot.salesLast28d;
        byDate.set(date, row);
      }
    });
    const rows = [...byDate.values()].sort((a, b) =>
      String(a.date).localeCompare(String(b.date)),
    );
    return { data: rows, series: lines };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [histories.map((h) => h.dataUpdatedAt).join(','), products]);

  return (
    <div className="border-t border-slate-100 p-4">
      <p className="mb-2 text-xs font-bold text-slate-500">추적 상품 28일 판매량 추이</p>
      {series.length === 0 || data.length < 2 ? (
        <div className="flex h-40 items-center justify-center text-center text-xs font-semibold text-slate-400">
          추이 데이터가 아직 부족합니다. 지표를 며칠 더 갱신하면 그래프가 쌓입니다.
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="date" tick={{ fontSize: 11, fontWeight: 600 }} stroke="#94a3b8" />
            <YAxis tick={{ fontSize: 11, fontWeight: 600 }} stroke="#94a3b8" width={44} />
            <Tooltip
              formatter={(value) => `${formatNumber(Number(value))}개`}
              contentStyle={{ borderRadius: 12, fontSize: 12, fontWeight: 600 }}
            />
            <Legend wrapperStyle={{ fontSize: 11, fontWeight: 600 }} />
            {series.map((line) => (
              <Line
                key={line.key}
                type="monotone"
                dataKey={line.key}
                name={line.name}
                stroke={line.color}
                strokeWidth={2}
                dot={false}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

function TrackedRow({ product }: { product: WingTrackedProduct }) {
  const snap = product.latestSnapshot;
  const meta = product.sourceKeyword
    ? `#${product.sourceKeyword}`
    : (product.brandName ?? product.categoryHierarchy ?? '');
  const value =
    snap?.salesLast28d != null
      ? `28일 ${formatNumber(snap.salesLast28d)}`
      : snap?.salePriceKrw != null
        ? `${formatNumber(snap.salePriceKrw)}원`
        : null;
  return (
    <div className="flex items-center gap-3 bg-white px-4 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-slate-900">{product.productName}</p>
        {meta && <p className="truncate text-xs font-semibold text-slate-400">{meta}</p>}
      </div>
      {value && (
        <span className="shrink-0 text-xs font-bold tabular-nums text-slate-600">{value}</span>
      )}
    </div>
  );
}

function RankPanel({
  title,
  tone,
  rows,
}: {
  title: string;
  tone: 'up' | 'down';
  rows: MyProductRankRow[];
}) {
  const accent = tone === 'up' ? '#059669' : '#ef4444';
  const Icon = tone === 'up' ? TrendingUp : TrendingDown;
  return (
    <section className="flex flex-col overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5">
        <div className="flex items-center gap-1.5">
          <Icon size={16} style={{ color: accent }} />
          <span className="text-sm font-bold text-slate-900">{title}</span>
        </div>
        <span
          className="rounded-full px-2 py-0.5 text-xs font-bold tabular-nums"
          style={{ background: `${accent}14`, color: accent }}
        >
          {formatNumber(rows.length)}개
        </span>
      </div>
      {rows.length === 0 ? (
        <p className="px-4 py-8 text-center text-xs font-semibold text-slate-400">
          {tone === 'up' ? '순위가 오른 상품이 없습니다' : '순위가 내린 상품이 없습니다'}
        </p>
      ) : (
        <ol className="divide-y divide-slate-50">
          {rows.map((row, index) => (
            <li key={`${row.vendorItemId}-${row.keyword}`} className="flex items-center gap-3 px-4 py-2.5">
              <span className="w-4 shrink-0 text-center text-sm font-extrabold tabular-nums text-slate-400">
                {index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-slate-900">
                  {row.productName ?? row.keyword}
                </p>
                <p className="truncate text-xs font-semibold text-slate-400">
                  #{row.keyword}
                  {row.currentSalesRank != null ? ` · 현재 ${formatNumber(row.currentSalesRank)}위` : ''}
                </p>
              </div>
              <span className="shrink-0 text-sm font-extrabold tabular-nums" style={{ color: accent }}>
                {tone === 'up' ? '▲' : '▼'}
                {formatNumber(Math.abs(row.rankChange ?? 0))}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
