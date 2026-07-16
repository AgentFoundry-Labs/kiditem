'use client';

import { CATEGORY_TABS } from '../lib/product-page-config';

export function ProductCategoryTabs() {
  return (
    <section className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--card-bg)] shadow-sm">
      <div className="flex items-center gap-2 overflow-x-auto px-4 py-3">
        {CATEGORY_TABS.map((tab) => {
          const isAvailable = tab.key === 'all';
          return (
            <button
              key={tab.key}
              type="button"
              disabled={!isAvailable}
              title={isAvailable ? undefined : 'Sellpia 스냅샷에 카테고리 필드가 없어 현재 필터링할 수 없습니다.'}
              className={isAvailable
                ? 'h-10 shrink-0 rounded-xl bg-[var(--primary)] px-4 text-sm font-extrabold text-white shadow-sm'
                : 'h-10 shrink-0 cursor-not-allowed rounded-xl px-4 text-sm font-extrabold text-[var(--text-secondary)] opacity-80'}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
    </section>
  );
}
