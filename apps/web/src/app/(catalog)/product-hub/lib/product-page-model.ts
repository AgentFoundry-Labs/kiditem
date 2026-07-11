import type { AlertItem } from '@kiditem/shared/alerts';
import { rankOf, type GradeMap } from './abc-grading';
import type { PipelineCounts, ProductListItem as Product } from './product-types';

export const DEFAULT_PIPELINE_COUNTS: PipelineCounts = {
  total: 0,
  channelLinkedProducts: 0,
  channelUnlinkedProducts: 0,
  gradeA: 0,
  gradeB: 0,
  gradeC: 0,
  active: 0,
  inactive: 0,
  cleanup: 0,
  unknown: 0,
  minus: 0,
  low: 0,
  gradeChangeA: 0,
  gradeChangeB: 0,
  gradeChangeC: 0,
  adLoss: 0,
  adCount: 0,
  noAdCount: 0,
  totalRev: 0,
  totalAd: 0,
  gradeRevA: 0,
  gradeRevB: 0,
  gradeRevC: 0,
  gradeAdA: 0,
  gradeAdB: 0,
  gradeAdC: 0,
};

export interface ProductListQueryInput {
  page: number;
  pageSize: number;
  period: number;
  gradeFilter: string;
  statusFilter: string;
  adFilter: string;
  submittedSearch: string;
  selectedCategory: string | null;
  selectedCategoryGroup: string | null;
}

export interface ProductCategoryGroup {
  key: string;
  label: string;
  title: string;
  items: readonly string[];
}

const NEW_PRODUCT_DAYS = 30;
const PRODUCT_ALERT_KEYWORDS = [
  'product',
  'inventory',
  'stock',
  'rule',
  'profit',
  'grade',
  '상품',
  '재고',
  '품절',
  '손익',
  '등급',
];

export function trafficSortVal(product: Product, key: string): number {
  const traffic = product.traffic;
  switch (key) {
    case 'visitors':
      return traffic?.visitors || 0;
    case 'views':
      return traffic?.views || 0;
    case 'cartAdds':
      return traffic?.cartAdds || 0;
    case 'orders':
      return traffic?.orders || 0;
    case 'salesQty':
      return traffic?.salesQty || 0;
    case 'revenue':
      return traffic?.revenue || 0;
    case 'profitRate':
      return product.profitRate;
    case 'adRate':
      return product.adRate;
    default:
      return 0;
  }
}

export function productCreatedAtValue(product: Product): number {
  if (!product.createdAt) return 0;
  const value = new Date(product.createdAt).getTime();
  return Number.isNaN(value) ? 0 : value;
}

export function isRecentProduct(product: Product): boolean {
  const createdAt = productCreatedAtValue(product);
  if (!createdAt) return false;
  return Date.now() - createdAt <= NEW_PRODUCT_DAYS * 24 * 60 * 60 * 1000;
}

export function filterProductOperationAlerts(alerts: AlertItem[]): AlertItem[] {
  return alerts.filter((alert) => {
    if (alert.targetType === 'master' || alert.targetType === 'product') return true;
    const text = `${alert.type} ${alert.title} ${alert.message ?? ''}`.toLowerCase();
    return PRODUCT_ALERT_KEYWORDS.some((keyword) => text.includes(keyword));
  });
}

export function buildProductListQueryParams(input: ProductListQueryInput): Record<string, string> {
  return {
    page: String(input.page),
    limit: String(input.pageSize),
    period: String(input.period),
    enriched: 'true',
    ...(input.gradeFilter !== 'all' && { grade: input.gradeFilter }),
    ...(input.statusFilter !== 'all' && { status: input.statusFilter }),
    ...(input.adFilter !== 'all' && { ad: input.adFilter }),
    ...(input.submittedSearch && { search: input.submittedSearch }),
    ...(input.selectedCategory && { category: input.selectedCategory }),
    ...(input.selectedCategoryGroup && { categoryGroup: input.selectedCategoryGroup }),
  };
}

export function filterCategoryGroupsForDisplay<T extends ProductCategoryGroup>(
  groups: readonly T[],
  activeCategoryTab: string,
  categorySearch: string,
): Array<T & { items: string[] }> {
  const keyword = categorySearch.trim().toLowerCase();
  return groups.map((group) => {
    const groupMatched = !keyword
      || group.label.toLowerCase().includes(keyword)
      || group.title.toLowerCase().includes(keyword);
    const items = group.items.filter((item) => groupMatched || item.toLowerCase().includes(keyword));
    return { ...group, items };
  }).filter((group) => {
    const tabMatched = activeCategoryTab === 'all' || activeCategoryTab === 'new' || activeCategoryTab === group.key;
    return tabMatched && group.items.length > 0;
  });
}

export function sortProductsForDisplay(
  products: Product[],
  activeCategoryTab: string,
  sortKey: string,
  sortDir: 'asc' | 'desc',
  gradeMap: GradeMap,
): Product[] {
  const scoped = activeCategoryTab === 'new'
    ? products.filter(isRecentProduct)
    : products;

  return [...scoped].sort((a, b) => {
    if (!sortKey) {
      const rankA = rankOf(a, gradeMap) || 99999;
      const rankB = rankOf(b, gradeMap) || 99999;
      return rankA - rankB;
    }

    const valueA = trafficSortVal(a, sortKey);
    const valueB = trafficSortVal(b, sortKey);
    return sortDir === 'desc' ? valueB - valueA : valueA - valueB;
  });
}

export function getRecentProducts(products: Product[], limit = 6): Product[] {
  const recent = products
    .filter(isRecentProduct)
    .toSorted((a, b) => productCreatedAtValue(b) - productCreatedAtValue(a));

  if (recent.length > 0) return recent.slice(0, limit);

  return products
    .toSorted((a, b) => productCreatedAtValue(b) - productCreatedAtValue(a))
    .slice(0, limit);
}

export function buildProductGroups(products: Product[]): Product[][] {
  const groupsByName = new Map<string, Product[]>();
  const groups: Product[][] = [];

  for (const product of products) {
    const existing = groupsByName.get(product.name);
    if (existing) {
      existing.push(product);
      continue;
    }

    const nextGroup = [product];
    groupsByName.set(product.name, nextGroup);
    groups.push(nextGroup);
  }

  return groups;
}

export function summarizePipelineCounts(
  counts: PipelineCounts | undefined,
  error: unknown,
): { counts: PipelineCounts; errorMessage: string | null } {
  return {
    counts: counts ?? DEFAULT_PIPELINE_COUNTS,
    errorMessage: error ? '상품 운영 요약을 불러오지 못했습니다.' : null,
  };
}
