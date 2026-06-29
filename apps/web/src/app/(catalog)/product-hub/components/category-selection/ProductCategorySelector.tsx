'use client';

import { CalendarDays, ChevronDown, Package, RotateCcw, Search, Tags } from 'lucide-react';
import { cn, formatDate, formatNumber } from '@/lib/utils';
import type { ProductListItem as Product } from '../../lib/product-types';

interface CategoryGroup {
  key: string;
  label: string;
  title: string;
  items: readonly string[];
}

interface CategoryTab {
  key: string;
  label: string;
}

interface ProductCategorySelectorProps {
  categoryTabs: readonly CategoryTab[];
  activeCategoryTab: string;
  isCategoryOpen: boolean;
  selectedCategory: string | null;
  selectedCategoryGroup: string | null;
  categorySearch: string;
  filteredCategoryGroups: CategoryGroup[];
  newProducts: Product[];
  onTabClick: (key: string) => void;
  onCategorySearchChange: (value: string) => void;
  onCategoryOpenChange: (open: boolean) => void;
  onClearCategoryFilter: () => void;
  onSelectCategoryGroup: (groupKey: string) => void;
  onSelectCategory: (category: string, groupKey: string) => void;
}

export function ProductCategorySelector({
  categoryTabs,
  activeCategoryTab,
  isCategoryOpen,
  selectedCategory,
  selectedCategoryGroup,
  categorySearch,
  filteredCategoryGroups,
  newProducts,
  onTabClick,
  onCategorySearchChange,
  onCategoryOpenChange,
  onClearCategoryFilter,
  onSelectCategoryGroup,
  onSelectCategory,
}: ProductCategorySelectorProps) {
  const hasActiveCategoryFilter =
    selectedCategory || selectedCategoryGroup || categorySearch || activeCategoryTab === 'new';

  return (
    <section className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--card-bg)] shadow-sm">
      <div className="flex items-center gap-2 overflow-x-auto px-4 py-3">
        {categoryTabs.map((tab) => {
          const active = activeCategoryTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => onTabClick(tab.key)}
              className={cn(
                'h-10 shrink-0 rounded-xl px-4 text-sm font-extrabold transition-colors',
                active
                  ? 'bg-[var(--primary)] text-white shadow-sm'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]',
              )}
            >
              {tab.label}
            </button>
          );
        })}
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {isCategoryOpen && hasActiveCategoryFilter && (
            <button
              onClick={onClearCategoryFilter}
              className="flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-extrabold text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-sunken)]"
            >
              <RotateCcw size={13} />
              초기화
            </button>
          )}
          {isCategoryOpen && (
            <button
              type="button"
              onClick={() => onCategoryOpenChange(false)}
              className="flex h-8 items-center gap-1.5 rounded-lg bg-[var(--surface-sunken)] px-3 text-xs font-extrabold text-[var(--text-secondary)] transition-colors hover:text-[var(--primary)]"
            >
              닫기
              <ChevronDown size={14} className="rotate-180" />
            </button>
          )}
        </div>
      </div>

      {isCategoryOpen && (
        <>
          <div className="border-t border-[var(--border-subtle)] px-4 py-3">
            <form
              onSubmit={(event) => event.preventDefault()}
              className="relative max-w-[420px]"
            >
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-quaternary)]" />
              <input
                type="text"
                value={categorySearch}
                onChange={(event) => onCategorySearchChange(event.target.value)}
                placeholder="카테고리명 검색 예: 비눗방울, 색종이"
                className="h-10 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-sunken)] pl-9 pr-3 text-[14px] font-medium text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--primary)]"
              />
            </form>
          </div>

          <div className="grid grid-cols-[minmax(0,1fr)_280px] gap-4 border-t border-[var(--border-subtle)] p-4">
            <div className="grid grid-cols-2 gap-x-5 gap-y-4 xl:grid-cols-3">
              {filteredCategoryGroups.map((group) => (
                <div key={group.key} className="min-w-0">
                  <button
                    onClick={() => onSelectCategoryGroup(group.key)}
                    className={cn(
                      'flex w-full items-center justify-between border-b pb-2 text-left text-[13px] font-extrabold transition-colors',
                      selectedCategoryGroup === group.key
                        ? 'border-[var(--primary)] text-[var(--primary)]'
                        : 'border-[var(--border-subtle)] text-[var(--text-primary)] hover:text-[var(--primary)]',
                    )}
                  >
                    <span className="truncate">{group.title}</span>
                    <Tags size={14} className="shrink-0" />
                  </button>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {group.items.map((item) => {
                      const active = selectedCategory === item;
                      return (
                        <button
                          key={item}
                          onClick={() => onSelectCategory(item, group.key)}
                          className={cn(
                            'rounded-md px-2 py-1 text-xs font-semibold transition-colors',
                            active
                              ? 'bg-[var(--primary)] text-white'
                              : 'bg-[var(--surface-sunken)] text-[var(--text-secondary)] hover:bg-[var(--primary-soft)] hover:text-[var(--primary)]',
                          )}
                        >
                          {item}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            <aside className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-sunken)] p-3">
              <div className="flex items-center gap-2 text-[13px] font-extrabold text-[var(--text-primary)]">
                <CalendarDays size={15} className="text-[var(--primary)]" />
                신상품
              </div>
              <p className="mt-1 text-xs font-medium text-[var(--text-muted)]">최근 등록 상품을 먼저 훑어봅니다.</p>
              <div className="mt-3 space-y-2">
                {newProducts.length === 0 ? (
                  <p className="rounded-lg bg-[var(--card-bg)] px-3 py-4 text-center text-xs font-semibold text-[var(--text-muted)]">
                    신상품 데이터가 없습니다.
                  </p>
                ) : newProducts.map((product) => (
                  <button
                    key={product.id}
                    onClick={() => { window.location.href = `/product-hub/${product.id}`; }}
                    className="flex w-full items-center gap-2 rounded-lg bg-[var(--card-bg)] p-2 text-left transition-colors hover:bg-[var(--primary-soft)]"
                  >
                    <div className="h-10 w-10 shrink-0 overflow-hidden rounded-md bg-[var(--surface)]">
                      {(product.thumbnailUrl || product.imageUrl) ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={product.thumbnailUrl || product.imageUrl || ''}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-[var(--text-quaternary)]">
                          <Package size={15} />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-extrabold text-[var(--text-primary)]">{product.name}</p>
                      <p className="mt-0.5 text-[11px] font-medium text-[var(--text-muted)]">
                        {product.createdAt ? formatDate(product.createdAt) : '등록일 없음'} · 재고 {formatNumber(product.availableStock)}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </aside>
          </div>
        </>
      )}
    </section>
  );
}
