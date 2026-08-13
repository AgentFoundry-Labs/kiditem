import type { SourcingRecommendationItem } from '@kiditem/shared/sourcing';
import type {
  EntryInterestKeywordStatus,
  EntryRecommendation,
  EntrySourceKey,
  EntrySourceStatus,
} from '../decision-center/lib/entry-recommendation-api';
import type { TodayRecommendationRow } from '../recommendations/lib/today-recommendations';

/**
 * Dashboard-only projection of the normalized recommendation read model.
 *
 * The server owns score, grade and baseline action. This adapter exists only to
 * preserve the established card/table props while those views are migrated; it
 * must not invent a competing recommendation score.
 */
export function toTodayRecommendationRow(item: SourcingRecommendationItem): TodayRecommendationRow {
  const coupang = item.coupang;
  const salesLast28d = coupang?.salesLast28d ?? null;
  const viewsLast28d = coupang?.viewsLast28d ?? null;
  const ratingCount = coupang?.ratingCount ?? item.rating ?? null;
  const primaryKeyword = item.keyword ?? item.sourceKeywords[0] ?? '미분류';

  return {
    productId: coupang?.productId ?? item.externalOfferId,
    itemId: null,
    vendorItemId: null,
    productName: item.displayName,
    itemName: null,
    brandName: null,
    manufacture: item.supplierName,
    categoryHierarchy: null,
    imagePath: item.imageUrl,
    salePrice: coupang?.salePriceKrw ?? item.salePriceKrw,
    rating: coupang?.ratingAverage ?? item.rating,
    ratingCount,
    pvLast28Day: viewsLast28d,
    salesLast28d,
    estimatedRevenue28d:
      coupang?.salePriceKrw != null && salesLast28d != null
        ? coupang.salePriceKrw * salesLast28d
        : null,
    conversionRate28d:
      salesLast28d != null && viewsLast28d != null && viewsLast28d > 0
        ? salesLast28d / viewsLast28d
        : null,
    deliveryInfo: item.shippingLabel,
    keywords: item.sourceKeywords.length > 0 ? item.sourceKeywords : [primaryKeyword],
    primaryKeyword,
    score: item.score,
    grade: item.grade,
    reasons: item.reasonCodes,
    risks: item.riskCodes,
    lowReviewSalesPower:
      salesLast28d != null ? salesLast28d / Math.max(ratingCount ?? 0, 1) : 0,
    marketReactionSignal: item.scoreComponents.marketReaction ?? 0,
    newEntrySignal: item.scoreComponents.newProductSignal ?? 0,
    salesLast3d: null,
    pvLast3d: null,
    threeDaySalesTracked: false,
    threeDayTrackingDays: null,
    salesDelta: null,
    viewDelta: null,
    reviewDelta: null,
  };
}

export function toTodayRecommendationRows(items: SourcingRecommendationItem[]): TodayRecommendationRow[] {
  return items.map(toTodayRecommendationRow);
}

/**
 * Entry board compatibility projection. It keeps the established table/detail
 * props while all score, grade, action, provenance, and interest matching stay
 * server-owned on `SourcingRecommendationItem`.
 */
export function toEntryRecommendation(item: SourcingRecommendationItem): EntryRecommendation {
  return {
    id: item.itemKey,
    rank: item.rank,
    keyword: item.keyword,
    isNewKeyword: item.isNewKeyword,
    title: item.displayName,
    imageUrl: item.imageUrl,
    overseasMall: item.sourcePlatform === '1688' ? '1688' : '쿠팡',
    sourceUrl: item.sourceUrl,
    overseasPriceKrw: item.overseasPriceKrw,
    overseasPriceCny: item.overseasPriceCny,
    salePriceKrw: item.salePriceKrw,
    shippingLabel: item.shippingLabel ?? '-',
    rating: item.rating ?? item.coupang?.ratingAverage ?? null,
    tags: item.tags,
    minOrderQuantity: item.minOrderQuantity,
    estimatedMarginRate: item.estimatedMarginRate,
    estimatedProfitKrw: item.estimatedProfitKrw,
    supplierName: item.supplierName,
    coupang: item.coupang
      ? {
          productId: item.coupang.productId,
          productName: item.coupang.productName,
          salePrice: item.coupang.salePriceKrw,
          reviews: item.coupang.ratingCount,
        }
      : null,
    score: item.score,
    grade: item.grade,
    components: {
      margin: scoreComponent(item, 'margin'),
      demand: scoreComponent(item, 'demand'),
      competition: scoreComponent(item, 'competition'),
      momentum: scoreComponent(item, 'momentum'),
      supplier: scoreComponent(item, 'supplier'),
    },
    reasons: item.reasonCodes,
    risks: item.riskCodes,
    contributingSources: entrySourceKeys(item),
    interest: item.interest,
  };
}

export function toEntryRecommendations(items: SourcingRecommendationItem[]): EntryRecommendation[] {
  return items.map(toEntryRecommendation);
}

export function toEntrySourceStatuses(items: SourcingRecommendationItem[]): EntrySourceStatus[] {
  return (['supply_1688_new', 'keyword_trend', 'coupang_competitor', 'coupang_rising'] as const)
    .map((key) => ({
      key,
      label: entrySourceLabel(key),
      rowCount: items.filter((item) => entrySourceKeys(item).includes(key)).length,
      businessDate: null,
      staleDays: null,
    }));
}

export function toEntryInterestKeywordStatuses(
  items: SourcingRecommendationItem[],
  targets: readonly { keyword?: string; label: string; source: 'keyword_analysis' | 'today_recommendation' | 'wing_catalog' | 'manual' }[],
): EntryInterestKeywordStatus[] {
  const grouped = new Map<string, EntryInterestKeywordStatus>();

  for (const target of targets) {
    const keyword = (target.keyword ?? target.label).trim();
    if (!keyword) continue;
    grouped.set(normalizeKeyword(keyword), {
      keyword,
      origins: [target.source === 'keyword_analysis' ? 'saved' : 'seed'],
      exactCount: 0,
      relatedCount: 0,
      state: 'no_signal',
      demand: null,
    });
  }

  for (const item of items) {
    const interest = item.interest;
    if (!interest) continue;
    for (const match of interest.matches) {
      const key = normalizeKeyword(match.keyword);
      const current = grouped.get(key) ?? {
        keyword: match.keyword,
        origins: interest.origins,
        exactCount: 0,
        relatedCount: 0,
        state: 'no_signal' as const,
        demand: null,
      };
      if (match.tier === 'exact') current.exactCount += 1;
      else current.relatedCount += 1;
      current.state = item.sourcePlatform === '1688' ? 'candidates' : 'demand_only';
      grouped.set(key, current);
    }
  }

  return [...grouped.values()].sort((left, right) => left.keyword.localeCompare(right.keyword, 'ko'));
}

function entrySourceKeys(item: SourcingRecommendationItem): EntrySourceKey[] {
  const keys = new Set<EntrySourceKey>();
  if (item.sourcePlatform === '1688' || item.contributingSources.some((source) => source.includes('1688'))) {
    keys.add('supply_1688_new');
  }
  if (item.contributingSources.some((source) => source.includes('keyword') || source.includes('naver'))) {
    keys.add('keyword_trend');
  }
  if (item.coupang || item.sourcePlatform === 'coupang') keys.add('coupang_competitor');
  if (item.contributingSources.some((source) => source.includes('rising'))) keys.add('coupang_rising');
  return [...keys];
}

function entrySourceLabel(key: EntrySourceKey): string {
  if (key === 'supply_1688_new') return '1688 공급';
  if (key === 'keyword_trend') return '키워드 트렌드';
  if (key === 'coupang_competitor') return '쿠팡 관측';
  return '쿠팡 급상승';
}

function scoreComponent(item: SourcingRecommendationItem, key: string): number {
  const value = item.scoreComponents[key];
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : 0;
}

function normalizeKeyword(value: string): string {
  return value.normalize('NFKC').trim().toLocaleLowerCase('ko-KR').replace(/\s+/g, '');
}
