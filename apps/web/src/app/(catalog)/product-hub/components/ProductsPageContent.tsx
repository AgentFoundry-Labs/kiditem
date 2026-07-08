'use client';

import { BarChart3, Download, Package, Search, Upload } from 'lucide-react';
import PageSkeleton from '@/components/ui/PageSkeleton';
import { cn } from '@/lib/utils';
import { useProductHubPageState } from '../hooks/useProductHubPageState';
import { AD_FILTERS, CATEGORY_TABS, PAGE_SIZE, PERIOD_OPTIONS, STOCK_FILTERS } from '../lib/product-page-config';
import AddProductModal from './AddProductModal';
import ExcelUploadModal from './ExcelUploadModal';
import { ProductCategorySelector } from './category-selection/ProductCategorySelector';
import { ProductGroupRow } from './ProductGroupRow';
import { ProductRowCard } from './ProductRowCard';
import { ProductsColumnHeader } from './ProductsColumnHeader';
import { ProductCommandCenter } from './ProductCommandCenter';

export default function ProductsPageContent() {
  const state = useProductHubPageState();

  if (state.isLoading && state.allProducts.length === 0) return <PageSkeleton variant="table" />;

  return (
    <div className="space-y-4">
      {state.errorMsg && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {state.errorMsg}
        </div>
      )}
      {state.pipelineCountsErrorMessage && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          {state.pipelineCountsErrorMessage}
        </div>
      )}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'var(--primary)' }}>
            <Package size={20} className="text-white" />
          </div>
          <div className="flex items-baseline gap-2">
            <h1 className="text-2xl font-extrabold tracking-tight" style={{ color: 'var(--text-primary)' }}>상품 운영 센터</h1>
            <span className="text-[13px] font-semibold" style={{ color: 'var(--text-tertiary)' }}>
              매출 · 광고 · 재고 · 수익성 통합 관리
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-xl p-1" style={{ background: 'var(--surface-sunken)' }}>
            {PERIOD_OPTIONS.map(item => (
              <button
                key={item.days}
                onClick={() => { state.setPeriod(item.days); state.setPage(1); }}
                className="px-3 py-1.5 text-[13px] font-semibold rounded-lg transition-colors"
                style={state.period === item.days
                  ? { background: 'var(--primary)', color: '#fff', boxShadow: 'var(--shadow-sm)' }
                  : { color: 'var(--text-tertiary)' }}
              >
                {item.label}
              </button>
            ))}
          </div>
          <input ref={state.trafficRef} type="file" accept=".xlsx,.xls,.csv" onChange={state.handleTrafficUpload} className="hidden" />
          <button
            onClick={() => state.trafficRef.current?.click()}
            className="flex items-center gap-1.5 h-9 px-4 rounded-xl text-[13px] font-semibold transition-colors"
            style={{ background: 'var(--surface-sunken)', color: 'var(--text-secondary)' }}
          >
            <BarChart3 size={14} /> 트래픽 업로드
          </button>
          {state.trafficMsg && <span className="text-[13px] font-semibold" style={{ color: 'var(--primary)' }}>{state.trafficMsg}</span>}
          <button
            onClick={state.handleExcelDownload}
            className="flex items-center gap-1.5 h-9 px-4 rounded-xl text-[13px] font-semibold transition-colors"
            style={{ background: 'var(--surface-sunken)', color: 'var(--text-secondary)' }}
          >
            <Download size={14} />
          </button>
          <button
            onClick={() => state.setShowUploadModal(true)}
            className="flex items-center gap-1.5 h-9 px-4 rounded-xl text-[13px] font-semibold transition-colors"
            style={{ background: 'var(--surface-sunken)', color: 'var(--text-secondary)' }}
          >
            <Upload size={14} />
          </button>
          <button
            onClick={() => state.setShowModal(true)}
            className="flex items-center gap-1.5 h-9 px-4 rounded-xl text-[13px] font-semibold text-white"
            style={{ background: 'var(--primary)' }}
          >
            + 상품 추가
          </button>
        </div>
      </div>

      <ProductCommandCenter
        pipelineCounts={state.pipelineCounts}
        newProductCount={state.newProducts.length}
        productAlerts={state.productAlerts}
        onSelectSegment={state.applySegment}
      />

      <ProductCategorySelector
        categoryTabs={CATEGORY_TABS}
        activeCategoryTab={state.activeCategoryTab}
        isCategoryOpen={state.isCategoryOpen}
        selectedCategory={state.selectedCategory}
        selectedCategoryGroup={state.selectedCategoryGroup}
        categorySearch={state.categorySearch}
        filteredCategoryGroups={state.filteredCategoryGroups}
        newProducts={state.newProducts}
        onTabClick={state.handleCategoryTabClick}
        onCategorySearchChange={state.setCategorySearch}
        onCategoryOpenChange={state.setIsCategoryOpen}
        onClearCategoryFilter={state.clearCategoryFilter}
        onSelectCategoryGroup={state.selectCategoryGroup}
        onSelectCategory={state.selectCategory}
      />

      <div className="flex items-center gap-3 rounded-2xl px-4 py-3" style={{ background: 'var(--card-bg)', border: '1px solid var(--border-subtle)' }}>
        <form onSubmit={state.handleSearch} className="relative flex-1 max-w-sm">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-quaternary)' }} />
          <input
            type="text"
            value={state.search}
            onChange={(event) => state.setSearch(event.target.value)}
            placeholder="상품명 · SKU 검색"
            className="h-10 pl-9 pr-3 text-[14px] rounded-xl w-full"
            style={{ background: 'var(--surface-sunken)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}
          />
        </form>
        <select
          value={state.statusFilter}
          onChange={(event) => { state.setStatusFilter(event.target.value); state.setPage(1); }}
          className="h-10 px-3 rounded-xl text-[14px] font-medium"
          style={{ background: 'var(--surface-sunken)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}
        >
          <option value="all">전체 상태</option>
          <option value="active">판매중</option>
          <option value="unknown">상태미수집</option>
          <option value="inactive">판매중지</option>
        </select>
        <div className="flex items-center rounded-xl p-1" style={{ background: 'var(--surface-sunken)' }}>
          {AD_FILTERS.map(filter => (
            <button
              key={filter.key}
              onClick={() => { state.setAdFilter(filter.key); state.setPage(1); }}
              className="px-3 py-1.5 text-[13px] font-semibold rounded-lg transition-colors"
              style={state.adFilter === filter.key
                ? { background: 'var(--primary)', color: '#fff' }
                : { color: 'var(--text-tertiary)' }}
            >
              {filter.label}
            </button>
          ))}
        </div>
        <select
          value={state.stockFilter}
          onChange={(event) => { state.setStockFilter(event.target.value); state.setPage(1); }}
          className="h-10 px-3 rounded-xl text-[14px] font-medium"
          style={{ background: 'var(--surface-sunken)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}
        >
          {STOCK_FILTERS.map((filter) => (
            <option key={filter.key} value={filter.key}>{filter.label}</option>
          ))}
        </select>
        <select
          value={state.gradeFilter}
          onChange={(event) => { state.setGradeFilter(event.target.value); state.setPage(1); }}
          className="h-10 px-3 rounded-xl text-[14px] font-medium"
          style={{ background: 'var(--surface-sunken)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}
        >
          <option value="all">전체 등급</option>
          <option value="A">A 핵심</option>
          <option value="B">B 성장</option>
          <option value="C">C 정리</option>
          <option value="minus">적자</option>
          <option value="low">3% 이하</option>
        </select>
        <span className="text-[13px] font-semibold tabular-nums" style={{ color: 'var(--text-tertiary)' }}>
          {state.visibleTotalCount}개 표시
        </span>
      </div>

      <ProductsColumnHeader sortKey={state.sortKey} sortDir={state.sortDir} onToggleSort={state.toggleSort} />

      {state.isPlaceholderData && state.allProducts.length > 0 && (
        <div
          className="flex items-center gap-2 rounded-xl px-3 py-2 text-[13px] font-semibold"
          style={{ background: 'var(--card-bg)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}
        >
          <div
            className="w-4 h-4 border-2 border-t-transparent rounded-full animate-spin"
            style={{ borderColor: 'var(--primary)', borderTopColor: 'transparent' }}
          />
          상품 목록을 최신 조건으로 갱신하는 중입니다.
        </div>
      )}

      <div>
        {state.displayProducts.length === 0 && !state.isLoading ? (
          <div
            className="rounded-xl p-12 text-center"
            style={{ background: 'var(--card-bg)', border: '1px solid var(--border-subtle)', color: 'var(--text-tertiary)' }}
          >
            등록된 상품이 없습니다.
          </div>
        ) : (
          <div className="space-y-3">
            {state.productGroups.map(group => {
              if (group.length === 1) {
                return (
                  <ProductRowCard
                    key={group[0].id}
                    product={group[0]}
                    gradeMap={state.gradeMap}
                    gradeChange={state.gradeChangesByProductId.get(group[0].id)}
                    periodDays={state.period}
                  />
                );
              }
              return (
                <ProductGroupRow
                  key={group[0].name}
                  group={group}
                  gradeMap={state.gradeMap}
                  gradeChangesByProductId={state.gradeChangesByProductId}
                  periodDays={state.period}
                  isExpanded={state.expandedGroups.has(group[0].name)}
                  onToggle={() => state.toggleGroup(group[0].name)}
                />
              );
            })}
          </div>
        )}

        {state.totalPages > 1 && (
          <div className="flex items-center justify-between mt-4">
            <span className="text-xs text-gray-400 font-mono">
              {state.totalCount}개 중 {(state.page - 1) * PAGE_SIZE + 1}-{Math.min(state.page * PAGE_SIZE, state.totalCount)}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => state.goToPage(state.page - 1)}
                disabled={state.page <= 1}
                className="px-3 py-1.5 text-xs border border-gray-200 rounded-md hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                이전
              </button>
              {Array.from({ length: Math.min(state.totalPages, 7) }, (_, i) => {
                let pg: number;
                if (state.totalPages <= 7) pg = i + 1;
                else if (state.page <= 4) pg = i + 1;
                else if (state.page >= state.totalPages - 3) pg = state.totalPages - 6 + i;
                else pg = state.page - 3 + i;
                return (
                  <button
                    key={pg}
                    onClick={() => state.goToPage(pg)}
                    className={cn(
                      'w-8 h-8 text-xs rounded-md',
                      pg === state.page
                        ? 'bg-purple-600 text-white font-semibold'
                        : 'border border-gray-200 hover:bg-gray-50 text-gray-600',
                    )}
                  >
                    {pg}
                  </button>
                );
              })}
              <button
                onClick={() => state.goToPage(state.page + 1)}
                disabled={state.page >= state.totalPages}
                className="px-3 py-1.5 text-xs border border-gray-200 rounded-md hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                다음
              </button>
            </div>
          </div>
        )}
      </div>

      {state.showModal && (
        <AddProductModal
          onClose={() => state.setShowModal(false)}
          onSaved={state.handleSavedProduct}
        />
      )}

      {state.showUploadModal && (
        <ExcelUploadModal
          onClose={() => state.setShowUploadModal(false)}
          onComplete={state.handleUploadComplete}
        />
      )}
    </div>
  );
}
