import { describe, expect, it, vi } from 'vitest';
import type { AlertItem } from '@kiditem/shared/alerts';
import {
  DEFAULT_PIPELINE_COUNTS,
  buildProductListQueryParams,
  buildProductGroups,
  filterCategoryGroupsForDisplay,
  filterProductOperationAlerts,
  getRecentProducts,
  summarizePipelineCounts,
} from './product-page-model';
import type { ProductListItem } from './product-types';

function product(overrides: Partial<ProductListItem>): ProductListItem {
  return {
    id: overrides.id ?? 'product-1',
    name: overrides.name ?? '상품',
    sku: overrides.sku ?? 'SKU',
    status: overrides.status ?? 'active',
    profitRate: overrides.profitRate ?? 0,
    adRate: overrides.adRate ?? 0,
    createdAt: overrides.createdAt,
    traffic: overrides.traffic,
  } as ProductListItem;
}

function alert(overrides: Partial<AlertItem>): AlertItem {
  return {
    id: overrides.id ?? 'alert-1',
    type: overrides.type ?? 'operation',
    severity: overrides.severity ?? 'warning',
    title: overrides.title ?? '재고 확인',
    message: overrides.message ?? '',
    targetType: overrides.targetType,
    targetId: overrides.targetId,
    createdAt: overrides.createdAt ?? '2026-06-01T00:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-06-01T00:00:00.000Z',
    status: overrides.status ?? 'open',
  } as AlertItem;
}

describe('filterProductOperationAlerts', () => {
  it('keeps product-targeted and product-operation text alerts only', () => {
    const filtered = filterProductOperationAlerts([
      alert({ id: 'product-target', targetType: 'product', title: '확인' }),
      alert({ id: 'inventory-text', targetType: 'workflow', title: 'Inventory stock risk' }),
      alert({ id: 'unrelated', targetType: 'workflow', title: 'agent runtime' }),
    ]);

    expect(filtered.map((item) => item.id)).toEqual(['product-target', 'inventory-text']);
  });
});

describe('getRecentProducts', () => {
  it('returns recent products first and falls back to newest products when no product is recent', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-30T00:00:00.000Z'));

    expect(
      getRecentProducts([
        product({ id: 'old', createdAt: '2026-01-01T00:00:00.000Z' }),
        product({ id: 'recent', createdAt: '2026-06-29T00:00:00.000Z' }),
      ]).map((item) => item.id),
    ).toEqual(['recent']);

    expect(
      getRecentProducts([
        product({ id: 'older', createdAt: '2026-01-01T00:00:00.000Z' }),
        product({ id: 'newer', createdAt: '2026-02-01T00:00:00.000Z' }),
      ]).map((item) => item.id),
    ).toEqual(['newer', 'older']);

    vi.useRealTimers();
  });
});

describe('buildProductGroups', () => {
  it('groups products by name without repeated lookup work', () => {
    const groups = buildProductGroups([
      product({ id: 'a', name: 'A' }),
      product({ id: 'b', name: 'B' }),
      product({ id: 'a2', name: 'A' }),
    ]);

    expect(groups.map((group) => group.map((item) => item.id))).toEqual([['a', 'a2'], ['b']]);
  });
});

describe('summarizePipelineCounts', () => {
  it('keeps a complete zero-filled default and surfaces query errors separately', () => {
    expect(DEFAULT_PIPELINE_COUNTS).toMatchObject({ total: 0, adCount: 0, noAdCount: 0 });
    expect(summarizePipelineCounts(undefined, new Error('down'))).toEqual({
      counts: DEFAULT_PIPELINE_COUNTS,
      errorMessage: '상품 운영 요약을 불러오지 못했습니다.',
    });
  });
});

describe('buildProductListQueryParams', () => {
  it('serializes active filters and omits neutral filter values', () => {
    expect(buildProductListQueryParams({
      page: 2,
      pageSize: 20,
      period: 14,
      gradeFilter: 'A',
      statusFilter: 'all',
      adFilter: 'noad',
      submittedSearch: '  cup ',
      selectedCategory: null,
      selectedCategoryGroup: 'toy',
    })).toEqual({
      page: '2',
      limit: '20',
      period: '14',
      enriched: 'true',
      grade: 'A',
      ad: 'noad',
      search: '  cup ',
      categoryGroup: 'toy',
    });
  });
});

describe('filterCategoryGroupsForDisplay', () => {
  it('scopes groups by active tab and keeps matching items for search', () => {
    const groups = [
      { key: 'toy', label: '완구', title: '놀이', items: ['블록', '퍼즐'] },
      { key: 'snack', label: '간식', title: '달란트', items: ['사탕'] },
    ];

    expect(filterCategoryGroupsForDisplay(groups, 'toy', '퍼즐')).toEqual([
      { key: 'toy', label: '완구', title: '놀이', items: ['퍼즐'] },
    ]);
    expect(filterCategoryGroupsForDisplay(groups, 'all', '간식')).toEqual([
      { key: 'snack', label: '간식', title: '달란트', items: ['사탕'] },
    ]);
  });
});
