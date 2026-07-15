'use client';

import Link from 'next/link';
import { Link2, Package, RefreshCw, Search, Upload } from 'lucide-react';
import PageSkeleton from '@/components/ui/PageSkeleton';
import { formatNumber } from '@/lib/utils';
import { PAGE_SIZE, useProductHubPageState } from '../hooks/useProductHubPageState';
import { ProductRowCard } from './ProductRowCard';
import { ProductsColumnHeader } from './ProductsColumnHeader';
import { ChannelSkuInventorySummary } from './ChannelSkuInventorySummary';

export default function ProductsPageContent({ headingLevel = 2 }: { headingLevel?: 1 | 2 }) {
  const state = useProductHubPageState();
  const data = state.data;
  const Heading = headingLevel === 1 ? 'h1' : 'h2';

  if (state.isLoading && !data) return <PageSkeleton variant="table" />;

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--primary)]">
            <Package size={20} className="text-white" />
          </div>
          <div>
            <Heading className="text-2xl font-extrabold tracking-tight text-[var(--text-primary)]">
              상품 카탈로그
            </Heading>
            <p className="mt-0.5 text-xs font-medium text-[var(--text-tertiary)]">
              Sellpia 재고 데이터 기준 · 읽기 전용
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/inventory-hub?tab=overview"
            className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-[var(--surface-sunken)] px-4 text-[13px] font-semibold text-[var(--text-secondary)]"
          >
            <Upload size={14} /> Sellpia 가져오기
          </Link>
          <Link
            href="/product-hub/matching"
            className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-[var(--primary)] px-4 text-[13px] font-semibold text-white"
          >
            <Link2 size={14} /> 상품 매칭
          </Link>
        </div>
      </header>

      {state.errorMessage ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {state.errorMessage}
        </div>
      ) : null}

      {data ? (
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <SummaryCard label="Sellpia 상품" value={data.summary.totalSkus} />
          <SummaryCard label="재고 있음" value={data.summary.inStockSkus} tone="emerald" />
          <SummaryCard label="품절" value={data.summary.outOfStockSkus} tone="rose" />
          <SummaryCard label="총 재고 수량" value={data.summary.totalUnits} />
        </section>
      ) : null}

      <ChannelSkuInventorySummary />

      <section className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--card-bg)] p-4">
        <div className="flex flex-wrap items-center gap-3">
          <form onSubmit={state.handleSearch} className="relative min-w-[240px] flex-1">
            <Search
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-quaternary)]"
            />
            <input
              value={state.search}
              onChange={(event) => state.setSearch(event.target.value)}
              placeholder="상품명 · Sellpia 코드 · 바코드 검색"
              className="h-10 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-sunken)] pl-9 pr-3 text-sm text-[var(--text-primary)]"
            />
          </form>
          <select
            aria-label="재고 상태"
            value={state.stockStatus}
            onChange={(event) => state.setStockStatus(event.target.value as typeof state.stockStatus)}
            className="h-10 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-sunken)] px-3 text-sm text-[var(--text-secondary)]"
          >
            <option value="all">전체 재고</option>
            <option value="in_stock">재고 있음</option>
            <option value="out_of_stock">품절</option>
          </select>
          <select
            aria-label="활성 상태"
            value={state.activeStatus}
            onChange={(event) => state.setActiveStatus(event.target.value as typeof state.activeStatus)}
            className="h-10 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-sunken)] px-3 text-sm text-[var(--text-secondary)]"
          >
            <option value="active">활성 상품</option>
            <option value="inactive">비활성 상품</option>
            <option value="all">전체 상품</option>
          </select>
          <span className="text-xs font-semibold tabular-nums text-[var(--text-tertiary)]">
            {formatNumber(data?.total ?? 0)}개
          </span>
        </div>
      </section>

      <ProductsColumnHeader />

      {state.isPlaceholderData ? (
        <div className="flex items-center gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--card-bg)] px-3 py-2 text-xs font-semibold text-[var(--text-secondary)]">
          <RefreshCw size={14} className="animate-spin text-[var(--primary)]" />
          최신 조건으로 갱신하는 중입니다.
        </div>
      ) : null}

      {data?.items.length ? (
        <div className="space-y-2">
          {data.items.map((product) => (
            <ProductRowCard key={product.masterProductId} product={product} />
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--card-bg)] p-12 text-center text-sm text-[var(--text-tertiary)]">
          조건에 맞는 Sellpia 상품이 없습니다.
        </div>
      )}

      {state.totalPages > 1 ? (
        <div className="flex items-center justify-between pt-2">
          <span className="text-xs tabular-nums text-[var(--text-tertiary)]">
            {formatNumber(data?.total ?? 0)}개 중 {(state.page - 1) * PAGE_SIZE + 1}–
            {Math.min(state.page * PAGE_SIZE, data?.total ?? 0)}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => state.goToPage(state.page - 1)}
              disabled={state.page <= 1}
              className="rounded-lg border border-[var(--border-subtle)] px-3 py-2 text-xs font-semibold text-[var(--text-secondary)] disabled:opacity-30"
            >
              이전
            </button>
            <span className="px-2 text-xs font-bold tabular-nums text-[var(--text-primary)]">
              {state.page} / {state.totalPages}
            </span>
            <button
              type="button"
              onClick={() => state.goToPage(state.page + 1)}
              disabled={state.page >= state.totalPages}
              className="rounded-lg border border-[var(--border-subtle)] px-3 py-2 text-xs font-semibold text-[var(--text-secondary)] disabled:opacity-30"
            >
              다음
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: number;
  tone?: 'default' | 'emerald' | 'rose';
}) {
  const valueColor = tone === 'emerald'
    ? 'text-emerald-700'
    : tone === 'rose'
      ? 'text-rose-700'
      : 'text-[var(--text-primary)]';
  return (
    <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--card-bg)] p-4">
      <p className="text-xs font-medium text-[var(--text-tertiary)]">{label}</p>
      <p className={`mt-2 text-2xl font-black tabular-nums ${valueColor}`}>{formatNumber(value)}</p>
    </div>
  );
}
