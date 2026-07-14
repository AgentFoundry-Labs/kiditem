import {
  createManualSourcingWorkspaceSnapshotMeta,
  getTodaySourcingWorkspaceSnapshot,
  saveTodaySourcingWorkspaceSnapshot,
} from './sourcing-workspace-snapshot-api';
import {
  buildCoupangImageSearchRows,
  buildImageSearchOffer,
  scoreImageSearchOffer,
  selectBestImageSearchOffer,
} from './coupang-1688-matching';
import {
  loadDailyImageSearchCache,
  todayLocalDateKey,
  type CachedImageSearchState,
} from './daily-image-search-cache';
import type { Sourcing1688NewProductModelCandidate } from './sourcing-1688-new-product-model-api';
import type { TodayRecommendationRow } from '../recommendations/lib/today-recommendations';

type Appendable1688Item = object & {
  keyword?: string | null;
  sourceUrl?: string | null;
  title?: string | null;
};

type Persistable1688Item = Record<string, unknown> & Appendable1688Item;

interface NewProductSnapshotPayload {
  version: 1;
  input: {
    source: string;
    keyword?: string;
    category?: string;
  };
  result: {
    keyword?: string;
    category?: string;
    items: Persistable1688Item[];
  };
  meta: ReturnType<typeof createManualSourcingWorkspaceSnapshotMeta>;
}

const DEFAULT_1688_NEW_PRODUCT_SNAPSHOT_LIMIT = 240;

export async function append1688NewProductSnapshot(input: {
  source: string;
  keyword?: string;
  category?: string;
  items: Appendable1688Item[];
  limit?: number;
}) {
  const limit = input.limit ?? DEFAULT_1688_NEW_PRODUCT_SNAPSHOT_LIMIT;
  const current = await getTodaySourcingWorkspaceSnapshot<NewProductSnapshotPayload>('1688_new_products')
    .then(({ snapshot }) => snapshot?.payload ?? null)
    .catch(() => null);
  const currentItems = Array.isArray(current?.result.items) ? current.result.items : [];
  const incomingItems = input.items.map((item) => ({
    ...(item as Record<string, unknown>),
    keyword: item.keyword ?? input.keyword ?? null,
  }));

  await saveTodaySourcingWorkspaceSnapshot<NewProductSnapshotPayload>('1688_new_products', {
    version: 1,
    input: {
      source: input.source,
      keyword: input.keyword,
      category: input.category,
    },
    result: {
      keyword: input.keyword,
      category: input.category,
      items: merge1688Items([...incomingItems, ...currentItems]).slice(0, limit),
    },
    meta: createManualSourcingWorkspaceSnapshotMeta(),
  });
}

export async function appendCached1688ImageMatchesToSnapshot(input: {
  coupangRows: TodayRecommendationRow[];
  limit?: number;
}): Promise<number> {
  const matches = buildCoupangImageSearchRows({ coupangRows: input.coupangRows, limit: input.limit ?? 48 });
  const cache = loadDailyImageSearchCache();
  const items = matches.flatMap((match) => {
    const state = cache.states[match.id];
    if (state?.status !== 'success') return [];
    return state.result.items.map((item) => {
      const offer = buildImageSearchOffer(item, match.targetSalePriceKrw);
      return {
        ...item,
        keyword: match.searchQuery,
        imageMatchScore: item.score,
        targetSalePriceKrw: match.targetSalePriceKrw,
        landedCostKrw: offer.landedCostKrw,
        estimatedProfitKrw: offer.estimatedProfitKrw,
        estimatedMarginRate: offer.estimatedMarginRate,
        matchedCoupang: {
          productId: match.coupangProduct.productId,
          productName: match.coupangProduct.productName,
          primaryKeyword: match.coupangProduct.primaryKeyword,
          keywords: match.coupangProduct.keywords,
          score: match.coupangProduct.score,
          grade: match.coupangProduct.grade,
          salePrice: match.coupangProduct.salePrice ?? match.targetSalePriceKrw,
          salesLast3d: match.coupangProduct.salesLast3d,
          salesLast28d: match.coupangProduct.salesLast28d ?? 0,
          reviews: match.coupangProduct.ratingCount ?? 0,
          marketReaction: match.coupangProduct.marketReactionSignal,
          threeDayValidation: match.coupangProduct.newEntrySignal,
          matchScore: item.score,
        },
      };
    });
  });

  if (items.length === 0) return 0;
  await append1688NewProductSnapshot({
    source: '1688_image_match_cache',
    keyword: 'cached-image-match',
    items,
  });
  return items.length;
}

export function buildCached1688ImageMatchCandidates(input: {
  coupangRows: TodayRecommendationRow[];
  limit?: number;
}): Sourcing1688NewProductModelCandidate[] {
  const sourceDate = todayLocalDateKey();
  const matches = buildCoupangImageSearchRows({ coupangRows: input.coupangRows, limit: input.limit ?? 48 });
  const cache = loadDailyImageSearchCache();
  const candidates = matches.flatMap((match) => {
    const state = cache.states[match.id];
    if (state?.status !== 'success') return [];

    const offers = state.result.items.map((item) => buildImageSearchOffer(item, match.targetSalePriceKrw));
    const bestOffer = selectBestImageSearchOffer(offers);
    if (!bestOffer) return [];

    const score = scoreImageSearchOffer(bestOffer);
    const shippingScore = averageKnownNumbers([
      percentageValue(bestOffer.shippingFulfillmentRate),
      percentageValue(bestOffer.shippingPickupRate),
    ]) ?? 0;
    const marginScore = marginPotentialScore(bestOffer.estimatedProfitKrw, bestOffer.estimatedMarginRate);
    const marketReaction = Math.max(0, Math.min(100, Math.round(
      match.coupangProduct.marketReactionSignal * 0.58 +
      Math.min(28, match.coupangProduct.salesLast3d * 1.4) +
      Math.min(14, match.coupangProduct.score * 0.16),
    )));
    const threeDayValidation = Math.max(0, Math.min(100, Math.round(
      match.coupangProduct.newEntrySignal * 0.52 +
      Math.min(32, match.coupangProduct.salesLast3d * 1.8) +
      ((match.coupangProduct.ratingCount ?? 0) <= 300 && match.coupangProduct.salesLast3d >= 5 ? 18 : 0),
    )));
    const components = {
      newProductSignal: 58,
      supplyQuality: Math.max(0, Math.min(100, Math.round(shippingScore * 0.72 + Math.min(28, Math.log10((bestOffer.salesNum ?? 0) + 1) * 14)))),
      coupangMatch: bestOffer.matchScore,
      marketReaction,
      threeDayValidation,
      marginPotential: marginScore,
      riskPenalty: riskPenaltyScore(bestOffer.title),
    };
    const grade = gradeFromLocalScore(score, components);
    const decision = grade === 'A' || grade === 'B' ? 'order' : grade === 'EXCLUDE' ? 'exclude' : 'observe_3d';

    return [{
      id: `cached:${match.id}:${bestOffer.sourceUrl}`,
      rank: 0,
      offerId: bestOffer.id,
      title: bestOffer.title,
      imageUrl: bestOffer.imageUrl,
      sourceUrl: bestOffer.sourceUrl,
      keyword: match.searchQuery,
      matchMethod: 'image',
      score,
      grade,
      decision,
      components,
      wholesale: {
        priceCny: bestOffer.priceCny,
        monthlySales: bestOffer.salesNum ?? null,
        tradeScore: bestOffer.serviceScore ?? bestOffer.matchScore,
        repurchaseRate: bestOffer.repurchaseRate ?? null,
        supplierName: bestOffer.supplierName ?? null,
        shippingFulfillmentRate: bestOffer.shippingFulfillmentRate ?? null,
        shippingPickupRate: bestOffer.shippingPickupRate ?? null,
        serviceScore: bestOffer.serviceScore ?? null,
        landedCostKrw: bestOffer.landedCostKrw,
        estimatedProfitKrw: bestOffer.estimatedProfitKrw,
        estimatedMarginRate: bestOffer.estimatedMarginRate,
        sourceDate,
      },
      matchedCoupang: {
        productId: match.coupangProduct.productId,
        productName: match.coupangProduct.productName,
        primaryKeyword: match.coupangProduct.primaryKeyword,
        score: match.coupangProduct.score,
        grade: match.coupangProduct.grade,
        salePrice: match.coupangProduct.salePrice ?? match.targetSalePriceKrw,
        salesLast3d: match.coupangProduct.salesLast3d,
        salesLast28d: match.coupangProduct.salesLast28d ?? 0,
        reviews: match.coupangProduct.ratingCount ?? 0,
        matchScore: bestOffer.matchScore,
      },
      reasons: [
        '도매상품검색 이미지 매칭',
        '쿠팡 유사 상품 근거',
        bestOffer.estimatedProfitKrw != null && bestOffer.estimatedProfitKrw > 0 ? '마진 가능성 확인' : null,
        shippingScore >= 90 ? '배송 지표 양호' : null,
      ].filter((reason): reason is string => Boolean(reason)),
      risks: riskPenaltyScore(bestOffer.title) > 0 ? ['IP/브랜드 리스크 확인 필요'] : [],
      modelTags: ['source:local-image-match', `grade:${grade}`, `decision:${decision}`],
      sourceSnapshotId: 'local-image-search-cache',
      sourceDate,
    } satisfies Sourcing1688NewProductModelCandidate];
  });

  return candidates
    .sort((a, b) => b.score - a.score)
    .map((candidate, index) => ({ ...candidate, rank: index + 1 }));
}

function merge1688Items(items: Persistable1688Item[]): Persistable1688Item[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = itemKey(item);
    if (!key) return false;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function itemKey(item: Persistable1688Item): string {
  const matchedCoupang = item.matchedCoupang;
  const coupangProductId = matchedCoupang && typeof matchedCoupang === 'object' && 'productId' in matchedCoupang
    ? String(matchedCoupang.productId ?? '').trim()
    : '';
  const offerKey = String(item.sourceUrl || item.title || '').trim();
  return [coupangProductId, offerKey].filter(Boolean).join(':');
}

function percentageValue(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value.replace(/[,％%]/g, '').trim());
  if (!Number.isFinite(parsed)) return null;
  return parsed <= 1 ? parsed * 100 : parsed;
}

function averageKnownNumbers(values: Array<number | null>): number | null {
  const known = values.filter((value): value is number => value != null && Number.isFinite(value));
  if (known.length === 0) return null;
  return known.reduce((sum, value) => sum + value, 0) / known.length;
}

function marginPotentialScore(profitKrw: number | null, marginRate: number | null): number {
  let score = 32;
  if (profitKrw != null) {
    if (profitKrw >= 7000) score += 36;
    else if (profitKrw >= 4500) score += 28;
    else if (profitKrw >= 2500) score += 18;
    else if (profitKrw >= 1000) score += 8;
    else score -= 16;
  }
  if (marginRate != null) {
    if (marginRate >= 35) score += 28;
    else if (marginRate >= 24) score += 20;
    else if (marginRate >= 14) score += 10;
    else score -= 12;
  }
  return clampScore(score);
}

function riskPenaltyScore(title: string): number {
  const normalized = title.toLowerCase();
  const riskyTerms = ['산리오', '포켓몬', '디즈니', '마블', '짱구', '캐릭터', '정품', '호환', '奥特曼', '迪士尼'];
  return riskyTerms.some((term) => normalized.includes(term.toLowerCase())) ? 35 : 0;
}

function gradeFromLocalScore(
  score: number,
  components: Sourcing1688NewProductModelCandidate['components'],
): Sourcing1688NewProductModelCandidate['grade'] {
  if (score >= 78 && components.coupangMatch >= 45 && components.riskPenalty <= 45) return 'A';
  if (score >= 64 && components.coupangMatch >= 35 && components.riskPenalty <= 60) return 'B';
  if (score >= 50) return 'C';
  if (score >= 36) return 'WATCH';
  return 'EXCLUDE';
}

function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}
