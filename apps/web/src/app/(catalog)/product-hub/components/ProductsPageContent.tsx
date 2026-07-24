'use client';

import { useState } from 'react';
import Link from 'next/link';
import { BarChart3, Download, Package, RefreshCw, Search, Upload } from 'lucide-react';
import PageSkeleton from '@/components/ui/PageSkeleton';
import { cn, formatNumber } from '@/lib/utils';
import { PAGE_SIZE, useProductHubPageState } from '../hooks/useProductHubPageState';
import { PERIOD_OPTIONS } from '../lib/product-page-config';
import { ProductCategoryTabs } from './ProductCategoryTabs';
import { ProductEditorDialog } from './ProductEditorDialog';
import { MasterProductAbcPolicyDialog } from './MasterProductAbcPolicyDialog';
import { ProductOperationsCommandCenter } from './ProductOperationsCommandCenter';
import { ProductRowCard } from './ProductRowCard';
import { ProductsColumnHeader } from './ProductsColumnHeader';

export default function ProductsPageContent({ headingLevel = 2 }: { headingLevel?: 1 | 2 }) {
  const state = useProductHubPageState();
  const [editorOpen, setEditorOpen] = useState(false);
  const [abcPolicyOpen, setAbcPolicyOpen] = useState(false);
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
      {state.overviewErrorMessage ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          {state.overviewErrorMessage}
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
            title="상품별 기간 지표 원본이 아직 연결되지 않아 일부 지표는 미수집으로 표시됩니다."
          >
            {PERIOD_OPTIONS.map((item) => (
              <button
                key={item.days}
                type="button"
                disabled={item.days === 365}
                onClick={() => item.days !== 365 && state.setPeriodDays(item.days)}
                className={cn(
                  'rounded-lg px-3 py-1.5 text-[13px] font-semibold',
                  item.days === state.periodDays
                    ? 'bg-[var(--primary)] text-white shadow-sm'
                    : item.days === 365
                      ? 'cursor-not-allowed text-[var(--text-tertiary)] opacity-55'
                      : 'text-[var(--text-tertiary)] hover:bg-[var(--surface)]',
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setAbcPolicyOpen(true)}
            className="flex h-9 items-center gap-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface)] px-4 text-[13px] font-semibold text-[var(--text-secondary)]"
          >
            자동 ABC 정책
          </button>
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
            onClick={() => setEditorOpen(true)}
            className="flex h-9 items-center gap-1.5 rounded-xl bg-[var(--primary)] px-4 text-[13px] font-semibold text-white"
          >
            + 상품 추가
          </button>
        </div>
      </header>

      {state.overviewData ? (
        <ProductOperationsCommandCenter
          data={state.overviewData}
          onShowOutOfStock={() => state.setInventoryStatus('out_of_stock')}
        />
      ) : null}

      <ProductCategoryTabs category={state.category} onCategoryChange={state.setCategory} />

      <section className="flex flex-wrap items-center gap-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--card-bg)] px-4 py-3">
        <form onSubmit={state.handleSearch} className="relative min-w-[240px] max-w-sm flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-quaternary)]" />
          <input
            aria-label="상품명 · 상품 코드 · 브랜드 검색"
            value={state.search}
            onChange={(event) => state.setSearch(event.target.value)}
            placeholder="상품명 · 상품 코드 · 브랜드 검색"
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
          aria-label="광고 상태"
        >
          {([
            ['전체', 'all'],
            ['광고중', 'active'],
            ['광고없음', 'inactive'],
          ] as const).map(([label, value]) => (
            <button
              key={label}
              type="button"
              aria-pressed={state.adStatus === value}
              onClick={() => state.setAdStatus(value)}
              className={cn(
                'rounded-lg px-3 py-1.5 text-[13px] font-semibold',
                state.adStatus === value ? 'bg-[var(--primary)] text-white' : 'text-[var(--text-tertiary)]',
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <select
          aria-label="재고 상태"
          value={state.inventoryStatus}
          onChange={(event) => state.setInventoryStatus(event.target.value as typeof state.inventoryStatus)}
          className="h-10 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-sunken)] px-3 text-[14px] font-medium text-[var(--text-secondary)]"
        >
          <option value="all">전체 재고</option>
          <option value="out_of_stock">품절</option>
          <option value="partial_out_of_stock">일부 품절</option>
          <option value="sellable">판매 가능</option>
          <option value="configuration_required">재고 연결 필요</option>
          <option value="review_required">검토 필요</option>
        </select>
        <select
          aria-label="상품 등급"
          value={state.abcGrade}
          onChange={(event) => state.setAbcGrade(event.target.value)}
          className="h-10 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-sunken)] px-3 text-[14px] font-medium text-[var(--text-secondary)]"
        >
          <option value="">전체 등급</option>
          <option value="A">A등급</option>
          <option value="B">B등급</option>
          <option value="C">C등급</option>
          <option value="unclassified">미분류</option>
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
            <ProductRowCard key={product.id} product={product} />
          ))}
        </div>
      ) : !state.errorMessage ? (
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--card-bg)] p-12 text-center text-sm text-[var(--text-tertiary)]">
          조건에 맞는 KidItem 상품이 없습니다.
        </div>
      ) : null}

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

      <ProductEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        onSaved={() => undefined}
      />
      <MasterProductAbcPolicyDialog open={abcPolicyOpen} onOpenChange={setAbcPolicyOpen} />
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
