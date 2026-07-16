'use client';

import Link from 'next/link';
import { BarChart3, Download, Package, RefreshCw, Search, Upload } from 'lucide-react';
import PageSkeleton from '@/components/ui/PageSkeleton';
import { cn, formatNumber } from '@/lib/utils';
import { PAGE_SIZE, useProductHubPageState } from '../hooks/useProductHubPageState';
import { PERIOD_OPTIONS } from '../lib/product-page-config';
import { ProductCategoryTabs } from './ProductCategoryTabs';
import { ProductOperationsCommandCenter } from './ProductOperationsCommandCenter';
import { ProductRowCard } from './ProductRowCard';
import { ProductsColumnHeader } from './ProductsColumnHeader';

export default function ProductsPageContent({ headingLevel = 2 }: { headingLevel?: 1 | 2 }) {
  const state = useProductHubPageState();
  const data = state.data;
  const Heading = headingLevel === 1 ? 'h1' : 'h2';

  if (state.isLoading && !data) return <PageSkeleton variant="table" />;

  return (
    <div className="space-y-4">
      {state.errorMessage ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {state.errorMessage}
        </div>
      ) : null}

      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--primary)]">
            <Package size={20} className="text-white" />
          </div>
          <div className="flex flex-wrap items-baseline gap-2">
            <Heading className="text-2xl font-extrabold tracking-tight text-[var(--text-primary)]">
              상품 운영 센터
            </Heading>
            <span className="text-[13px] font-semibold text-[var(--text-tertiary)]">
              매출 · 광고 · 재고 · 수익성 통합 관리
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <div
            className="flex items-center rounded-xl bg-[var(--surface-sunken)] p-1"
            title="기간별 트래픽 지표는 현재 Sellpia 스냅샷에서 미수집 중입니다."
          >
            {PERIOD_OPTIONS.map((item) => (
              <button
                key={item.days}
                type="button"
                disabled
                className={cn(
                  'cursor-not-allowed rounded-lg px-3 py-1.5 text-[13px] font-semibold',
                  item.days === 14
                    ? 'bg-[var(--primary)] text-white opacity-70 shadow-sm'
                    : 'text-[var(--text-tertiary)] opacity-55',
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            disabled
            title="트래픽 업로드는 현재 카탈로그 원본에서 지원하지 않습니다."
            className="flex h-9 cursor-not-allowed items-center gap-1.5 rounded-xl bg-[var(--surface-sunken)] px-4 text-[13px] font-semibold text-[var(--text-muted)] opacity-55"
          >
            <BarChart3 size={14} /> 트래픽 업로드
          </button>
          <button
            type="button"
            disabled
            aria-label="Excel 내보내기"
            title="전체 Sellpia 내보내기는 재고 동기화 화면에서 관리합니다."
            className="flex h-9 w-9 cursor-not-allowed items-center justify-center rounded-xl bg-[var(--surface-sunken)] text-[var(--text-muted)] opacity-55"
          >
            <Download size={14} />
          </button>
          <Link
            href="/inventory-hub?tab=sellpia-sync"
            aria-label="Sellpia 동기화"
            title="Sellpia 자동 동기화 현황을 확인합니다."
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--surface-sunken)] text-[var(--text-secondary)]"
          >
            <Upload size={14} />
          </Link>
          <button
            type="button"
            disabled
            title="상품 추가와 수정은 Sellpia에서 관리합니다."
            className="flex h-9 cursor-not-allowed items-center gap-1.5 rounded-xl bg-[var(--primary)] px-4 text-[13px] font-semibold text-white opacity-55"
          >
            + 상품 추가
          </button>
        </div>
      </header>

      {data ? (
        <ProductOperationsCommandCenter
          data={data}
          onShowOutOfStock={() => state.setStockStatus('out_of_stock')}
        />
      ) : null}

      <ProductCategoryTabs />

      <section className="flex flex-wrap items-center gap-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--card-bg)] px-4 py-3">
        <form onSubmit={state.handleSearch} className="relative min-w-[240px] max-w-sm flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-quaternary)]" />
          <input
            value={state.search}
            onChange={(event) => state.setSearch(event.target.value)}
            placeholder="상품명 · Sellpia 코드 · 바코드 검색"
            className="h-10 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-sunken)] pl-9 pr-3 text-[14px] text-[var(--text-primary)]"
          />
        </form>
        <select
          aria-label="상품 상태"
          value={state.activeStatus}
          onChange={(event) => state.setActiveStatus(event.target.value as typeof state.activeStatus)}
          className="h-10 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-sunken)] px-3 text-[14px] font-medium text-[var(--text-secondary)]"
        >
          <option value="all">전체 상태</option>
          <option value="active">판매중</option>
          <option value="inactive">판매중지</option>
        </select>
        <div
          className="flex items-center rounded-xl bg-[var(--surface-sunken)] p-1"
          title="광고 여부는 현재 Sellpia 스냅샷에서 미수집 중입니다."
        >
          {['전체', '광고중', '광고없음'].map((label, index) => (
            <button
              key={label}
              type="button"
              disabled
              className={cn(
                'cursor-not-allowed rounded-lg px-3 py-1.5 text-[13px] font-semibold opacity-55',
                index === 0 ? 'bg-[var(--primary)] text-white' : 'text-[var(--text-tertiary)]',
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <select
          aria-label="재고 상태"
          value={state.stockStatus}
          onChange={(event) => state.setStockStatus(event.target.value as typeof state.stockStatus)}
          className="h-10 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-sunken)] px-3 text-[14px] font-medium text-[var(--text-secondary)]"
        >
          <option value="all">전체 재고</option>
          <option value="out_of_stock">품절</option>
          <option value="in_stock">재고 OK</option>
        </select>
        <select
          aria-label="상품 등급"
          disabled
          title="상품 등급은 현재 Sellpia 스냅샷에서 미수집 중입니다."
          className="h-10 cursor-not-allowed rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-sunken)] px-3 text-[14px] font-medium text-[var(--text-muted)] opacity-55"
        >
          <option>전체 등급</option>
        </select>
        <span className="text-[13px] font-semibold tabular-nums text-[var(--text-tertiary)]">
          {formatNumber(data?.total ?? 0)}개 표시
        </span>
      </section>

      <ProductsColumnHeader />

      {state.isPlaceholderData ? (
        <div className="flex items-center gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--card-bg)] px-3 py-2 text-[13px] font-semibold text-[var(--text-secondary)]">
          <RefreshCw size={14} className="animate-spin text-[var(--primary)]" />
          상품 목록을 최신 조건으로 갱신하는 중입니다.
        </div>
      ) : null}

      {data?.items.length ? (
        <div className="space-y-3">
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
            {formatNumber(data?.total ?? 0)}개 중 {(state.page - 1) * PAGE_SIZE + 1}-
            {Math.min(state.page * PAGE_SIZE, data?.total ?? 0)}
          </span>
          <nav aria-label="상품 목록 페이지" className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => state.goToPage(state.page - 1)}
              disabled={state.page <= 1}
              className="rounded-md border border-[var(--border-subtle)] px-3 py-1.5 text-xs text-[var(--text-secondary)] disabled:cursor-not-allowed disabled:opacity-30"
            >
              이전
            </button>
            {pageNumbers(state.page, state.totalPages).map((page) => (
              <button
                key={page}
                type="button"
                onClick={() => state.goToPage(page)}
                aria-current={page === state.page ? 'page' : undefined}
                className={cn(
                  'h-8 w-8 rounded-md text-xs',
                  page === state.page
                    ? 'bg-[var(--primary)] font-semibold text-white'
                    : 'border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]',
                )}
              >
                {page}
              </button>
            ))}
            <button
              type="button"
              onClick={() => state.goToPage(state.page + 1)}
              disabled={state.page >= state.totalPages}
              className="rounded-md border border-[var(--border-subtle)] px-3 py-1.5 text-xs text-[var(--text-secondary)] disabled:cursor-not-allowed disabled:opacity-30"
            >
              다음
            </button>
          </nav>
        </div>
      ) : null}
    </div>
  );
}

function pageNumbers(currentPage: number, totalPages: number): number[] {
  const visibleCount = Math.min(totalPages, 7);
  const firstPage = totalPages <= 7
    ? 1
    : Math.min(Math.max(currentPage - 3, 1), totalPages - 6);
  return Array.from({ length: visibleCount }, (_, index) => firstPage + index);
}
