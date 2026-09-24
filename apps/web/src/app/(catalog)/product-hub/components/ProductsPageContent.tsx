'use client';

import { useState } from 'react';
import { businessDateKey, kstBusinessDate } from '@kiditem/shared/common';
import { Package, RefreshCw, Search } from 'lucide-react';
import {
  PRODUCT_ADVERTISING_LABELS,
  PRODUCT_INVENTORY_LABELS,
  type MasterProductOperationsListItem,
  type ProductInventoryStatus,
  type ProductOperationsInventoryFocus,
} from '@kiditem/shared/product-operations';
import { partialPeriodDaysText } from '@/lib/period-days';
import PageSkeleton from '@/components/ui/PageSkeleton';
import { cn, formatNumber } from '@/lib/utils';
import { PAGE_SIZE, useProductHubPageState } from '../hooks/useProductHubPageState';
import { PERIOD_OPTIONS, SORT_OPTIONS } from '../lib/product-page-config';
import { ProductAbcDetailDialog } from './ProductAbcDetailDialog';
import { ProductOperationsCommandCenter } from './ProductOperationsCommandCenter';
import { ProductOperationsDataStatusAction } from './ProductOperationsDataStatusAction';
import { ProductRowCard } from './ProductRowCard';
import { PRODUCT_TABLE_MIN_WIDTH, ProductsColumnHeader } from './ProductsColumnHeader';
import { operatorReason } from '@/lib/operator-error';

export default function ProductsPageContent({ headingLevel = 2 }: { headingLevel?: 1 | 2 }) {
  const state = useProductHubPageState();
  const [abcDetailProduct, setAbcDetailProduct] = useState<MasterProductOperationsListItem | null>(null);
  const data = state.data;
  const inventoryFilterValue = state.inventoryFocus !== 'all'
    ? `focus:${state.inventoryFocus}`
    : state.inventoryStatus;
  const Heading = headingLevel === 1 ? 'h1' : 'h2';
  // The server reads Wing traffic once per list query and gives every row that
  // query's basis, so the first loaded row speaks for the whole list. Rows kept
  // from an earlier query while a new one loads, or shown beside a load error,
  // may not match the selected period, so they say nothing.
  const trafficBasis = state.isPlaceholderData || state.errorMessage
    ? undefined
    : data?.items[0]?.metricsFreshness.traffic.basis;
  const partialTrafficDays = trafficBasis ? partialPeriodDaysText(trafficBasis) : null;
  const partialTrafficCaption = partialTrafficDays ? `조회·장바구니 ${partialTrafficDays}` : null;
  const monthlyYearMonth = state.isPlaceholderData || state.errorMessage
    ? currentKstYearMonth()
    : data?.items
      .map((item) => item.monthly?.yearMonth)
      .find((yearMonth): yearMonth is string => yearMonth !== undefined)
    ?? currentKstYearMonth();
  const monthlyBasis = state.isPlaceholderData || state.errorMessage
    ? undefined
    : data?.items.find((item) => item.monthly !== null)?.monthly;
  const monthlyCoverage = monthlyBasis ? monthlyCoverageLabel(data?.items ?? []) : '미측정';
  const abcOfficialCutoff = state.isPlaceholderData || state.errorMessage
    ? '확인 중'
    : data?.summary.abcOfficialCutoffDate ?? '없음';

  if (state.isLoading && !data) return <PageSkeleton variant="table" />;

  return (
    <div className="space-y-4">
      {state.errorMessage ? (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <span>{operatorReason(state.errorMessage, '상품 목록을 불러오지 못했습니다.')}</span>
          <button type="button" onClick={() => void state.refetch()} className="rounded px-2 py-1 font-semibold underline" aria-label="상품 목록 다시 시도">
            다시 시도
          </button>
        </div>
      ) : null}
      {state.overviewErrorMessage ? (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          <span>{state.overviewErrorMessage}</span>
          <button type="button" onClick={() => void state.refetch()} className="rounded px-2 py-1 font-semibold underline" aria-label="상품 요약 다시 시도">
            다시 시도
          </button>
        </div>
      ) : null}

      {/* The period caption hangs up to 15px below the period control. The
          header's bottom padding and the actions' wrapped row gap reserve that
          room, so the caption never covers the next block or a wrapped action,
          and nothing moves when it appears. */}
      <header className="flex flex-wrap items-center justify-between gap-3 pb-3">
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
        <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-bold text-[var(--text-tertiary)]">조회·광고 지표 범위</span>
            <div
              className="relative flex items-center rounded-xl bg-[var(--surface-sunken)] p-1"
              title='7·14·30일은 방문·조회·장바구니·주문·광고 지표의 조회 범위입니다. 상품 표의 매출·판매·원가·매출총이익·총이익률은 현재 KST 월 기준이며 이 선택으로 바뀌지 않습니다.'
            >
            {PERIOD_OPTIONS.map((item) => (
              <button
                key={item.days}
                type="button"
                onClick={() => state.setPeriodDays(item.days)}
                className={cn(
                  'rounded-lg px-3 py-1.5 text-[13px] font-semibold',
                  item.days === state.periodDays
                    ? 'bg-[var(--primary)] text-white shadow-sm'
                    : 'text-[var(--text-tertiary)] hover:bg-[var(--surface)]',
                )}
              >
                {item.label}
              </button>
            ))}
            {/* Out of flow, so the caption appearing never moves the period controls. */}
            {partialTrafficCaption ? (
              <p className="pointer-events-none absolute right-0 top-full mt-1 whitespace-nowrap text-[11px] font-semibold leading-none text-amber-700">
                {partialTrafficCaption}
              </p>
            ) : null}
            </div>
          </div>
          <ProductOperationsDataStatusAction
            open={state.dataStatusOpen}
            onOpenChange={state.setDataStatusOpen}
            onProductsRefetch={state.refetch}
            periodDays={state.periodDays}
          />
        </div>
      </header>

      {state.overviewData ? (
        <ProductOperationsCommandCenter
          data={state.overviewData}
          onShowAbcGrade={state.setAbcGrade}
          onShowInventoryFocus={state.setInventoryFocus}
        />
      ) : null}


      <section className="flex flex-wrap items-center gap-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--card-bg)] px-4 py-3">
        <form onSubmit={state.handleSearch} className="relative min-w-[240px] max-w-sm flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-quaternary)]" />
          <input
            aria-label="상품명 · 상품 코드 · 옵션 · 바코드 검색"
            value={state.search}
            onChange={(event) => state.setSearch(event.target.value)}
            placeholder="상품명 · 상품 코드 · 옵션 · 바코드 검색"
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
            [PRODUCT_ADVERTISING_LABELS.active, 'active'],
            [PRODUCT_ADVERTISING_LABELS.inactive, 'inactive'],
            [PRODUCT_ADVERTISING_LABELS.unconfigured, 'unconfigured'],
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
          value={inventoryFilterValue}
          onChange={(event) => {
            const value = event.target.value;
            if (value.startsWith('focus:')) {
              state.setInventoryFocus(value.slice('focus:'.length) as ProductOperationsInventoryFocus);
            } else {
              state.setInventoryStatus(value as ProductInventoryStatus | 'all');
            }
          }}
          className="h-10 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-sunken)] px-3 text-[14px] font-medium text-[var(--text-secondary)]"
        >
          <option value="all">전체 재고</option>
          <option value="focus:attention">재고 설정 확인</option>
          <option value="focus:out_of_stock">품절</option>
          <option value="focus:imminent">임박 재고</option>
          <option value="focus:reorder">발주 필요</option>
          {(['uncollected', 'sellable', 'configuration_required', 'review_required'] as const)
            .map((status) => <option key={status} value={status}>{PRODUCT_INVENTORY_LABELS[status]}</option>)}
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

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-sunken)] px-4 py-3 text-[12px] font-semibold text-[var(--text-tertiary)]">
        <span>당월 실적 · KST {monthlyYearMonth} · 측정 {monthlyCoverage}</span>
        <span>현재고는 최신 저장값 · ABC 공식 기준일 {abcOfficialCutoff}</span>
      </div>

      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="정렬">
        <span className="text-[13px] font-semibold text-[var(--text-tertiary)]">정렬</span>
        <div className="flex flex-wrap items-center rounded-xl bg-[var(--surface-sunken)] p-1">
          {SORT_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              disabled={option.disabled}
              aria-pressed={!option.disabled && state.sort === option.value}
              title={option.disabledReason}
              onClick={() => {
                if (!option.disabled) state.setSort(option.value as typeof state.sort);
              }}
              className={cn(
                'rounded-lg px-3 py-1.5 text-[13px] font-semibold transition-colors',
                option.disabled
                  ? 'cursor-not-allowed text-[var(--text-quaternary)] opacity-50'
                  : state.sort === option.value
                  ? 'bg-[var(--primary)] text-white shadow-sm'
                  : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]',
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div
        role="region"
        aria-label="상품 목록 표"
        tabIndex={0}
        className="overflow-x-auto overscroll-x-contain pb-2"
      >
        <div className={PRODUCT_TABLE_MIN_WIDTH}>
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
                <ProductRowCard key={product.id} product={product} onOpenAbcDetail={setAbcDetailProduct} />
              ))}
            </div>
          ) : null}
        </div>
      </div>

      {!data?.items.length && !state.errorMessage ? (
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

      <ProductAbcDetailDialog
        open={abcDetailProduct !== null}
        onOpenChange={(open) => !open && setAbcDetailProduct(null)}
        product={abcDetailProduct}
      />
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

function currentKstYearMonth(): string {
  return businessDateKey(kstBusinessDate(new Date())).slice(0, 7);
}

function monthlyCoverageLabel(items: MasterProductOperationsListItem[]): string {
  const measured = items.flatMap((item) => item.monthly ? [item.monthly] : []);
  if (measured.length === 0) return '미측정';

  const coverageRanges = new Set(measured.map((monthly) => `${monthly.coverageStartDate}–${monthly.coverageEndDate}`));
  const hasUnmeasuredRows = measured.length < items.length;
  if (coverageRanges.size > 1) {
    return hasUnmeasuredRows
      ? '상품별 수집 범위 상이 · 미측정 상품 있음'
      : '상품별 수집 범위 상이';
  }

  const [range] = coverageRanges;
  return hasUnmeasuredRows ? `수집상품만 ${range} · 미측정 상품 있음` : range!;
}
