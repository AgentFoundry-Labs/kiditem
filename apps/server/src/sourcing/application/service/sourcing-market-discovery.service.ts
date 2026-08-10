import { Inject, Injectable } from '@nestjs/common';
import {
  SOURCING_1688_NEW_PRODUCT_MODEL_PIPELINE,
  type Sourcing1688NewProductCandidate,
} from '../../domain/sourcing-1688-new-product-model';
import type { SourcingMarketModelCandidate } from '../../domain/sourcing-market-model';
import {
  TREND_COLLECTION_REPOSITORY_PORT,
  type NaverKeywordSnapshotRow,
  type NaverPopularKeywordSnapshotRow,
  type ShortsSnapshotRow,
  type Sourcing1688HotProductSnapshotRow,
  type TrendCollectionRepositoryPort,
} from '../port/out/repository/trend-collection.repository.port';
import {
  SourcingRecommendationService,
  type SourcingRecommendationPresenterItem,
} from './sourcing-recommendation.service';

const DISCOVERY_WINDOW_DAYS = 30;
const SOURCE_GROUP_COUNT = 6;
const RECOMMENDATION_LIMIT = 100;

export interface SourcingMarketDiscoveryInput {
  organizationId: string;
  keyword: string;
  category?: string | null;
  mode?: 'replay';
}

export type SourcingRecommendationScore = Pick<
  Sourcing1688NewProductCandidate,
  'score' | 'grade' | 'decision' | 'components' | 'reasons' | 'risks' | 'modelTags'
>;

export interface SourcingRecommendationCandidate {
  id: string;
  productName: string;
  coupangEvidence: NonNullable<Sourcing1688NewProductCandidate['matchedCoupang']>;
  supplierEvidence: Sourcing1688NewProductCandidate['wholesale'] & {
    offerId: string | null;
    sourceUrl: string;
    imageUrl: string | null;
  };
  score: SourcingRecommendationScore;
  artifact: {
    title: string;
    summary: Record<string, unknown>;
  };
}

export interface SourcingScoredOpportunity {
  id: string;
  pipeline: typeof SOURCING_1688_NEW_PRODUCT_MODEL_PIPELINE;
  productName: string;
  score: number;
  grade: Sourcing1688NewProductCandidate['grade'];
  decision: Sourcing1688NewProductCandidate['decision'];
  components: Sourcing1688NewProductCandidate['components'];
  reasons: string[];
  risks: string[];
  modelTags: string[];
  sourceSnapshotId: string;
  sourceDate: string;
}

export interface SourcingMarketDiscoveryResult {
  mode: 'replay';
  windowDays: typeof DISCOVERY_WINDOW_DAYS;
  confidence: number;
  dataGaps: string[];
  marketSignals: Array<Record<string, unknown>>;
  coupangMatches: SourcingMarketModelCandidate[];
  trackingSnapshots: Array<Record<string, unknown>>;
  supplierMatches: Sourcing1688NewProductCandidate[];
  scoredOpportunities: SourcingScoredOpportunity[];
  recommendations: SourcingRecommendationCandidate[];
}

interface DiscoveryEvidence {
  naverKeywords: NaverKeywordSnapshotRow[];
  popularKeywords: NaverPopularKeywordSnapshotRow[];
  hot1688: Sourcing1688HotProductSnapshotRow[];
  shorts: ShortsSnapshotRow[];
  recommendationRun: {
    id: string;
    generatedAt: string;
    items: SourcingRecommendationPresenterItem[];
  } | null;
}

/**
 * AgentOS discovery is a read-model projection. It never rebuilds browser
 * cache JSON or re-runs a client score: all supplier and Coupang rows come from
 * the same immutable recommendation run used by the sourcing screens.
 */
@Injectable()
export class SourcingMarketDiscoveryService {
  constructor(
    @Inject(TREND_COLLECTION_REPOSITORY_PORT)
    private readonly trends: TrendCollectionRepositoryPort,
    private readonly recommendations: SourcingRecommendationService,
  ) {}

  async discover(
    input: SourcingMarketDiscoveryInput,
  ): Promise<SourcingMarketDiscoveryResult> {
    const searchTerms = compactStrings([input.keyword, input.category]);
    const evidence = filterEvidence(await this.loadEvidence(input.organizationId), searchTerms);
    const recommendationRun = evidence.recommendationRun;
    const items = recommendationRun?.items ?? [];
    const sourceDate = recommendationRun?.generatedAt.slice(0, 10) ?? '';
    const sourcePrefix = recommendationRun?.id ?? 'recommendation-run-missing';

    const coupangMatches = items
      .filter((item) => item.sourcePlatform === 'coupang')
      .filter((item) => matchesSearchTerms(coupangSearchTerms(item), searchTerms))
      .map((item) => toCoupangCandidate(item, sourcePrefix, sourceDate));
    const supplierMatches = items
      .filter((item) => item.sourcePlatform === '1688')
      .filter((item) => matchesSearchTerms(supplierSearchTerms(item), searchTerms))
      .map((item) => toSupplierCandidate(item, sourcePrefix, sourceDate))
      .filter((item): item is Sourcing1688NewProductCandidate => item !== null)
      .map((item) => ({ ...item, matchedCoupang: findCoupangMatch(item, coupangMatches) }));
    const recommendations = supplierMatches
      .filter((candidate): candidate is Sourcing1688NewProductCandidate & {
        matchedCoupang: NonNullable<Sourcing1688NewProductCandidate['matchedCoupang']>;
      } => candidate.matchedCoupang !== null && candidate.decision !== 'exclude')
      .map((candidate) => toRecommendation(candidate, input, confidenceFromEvidence({
        naverKeywordCount: evidence.naverKeywords.length,
        popularKeywordCount: evidence.popularKeywords.length,
        hot1688Count: evidence.hot1688.length,
        shortsCount: evidence.shorts.length,
        coupangCount: coupangMatches.length,
        supplierCount: supplierMatches.length,
      })));
    const coverage = {
      naverKeywordCount: evidence.naverKeywords.length,
      popularKeywordCount: evidence.popularKeywords.length,
      hot1688Count: evidence.hot1688.length,
      shortsCount: evidence.shorts.length,
      coupangCount: coupangMatches.length,
      supplierCount: supplierMatches.length,
    };

    return {
      mode: 'replay',
      windowDays: DISCOVERY_WINDOW_DAYS,
      confidence: confidenceFromEvidence(coverage),
      dataGaps: dataGaps(coverage, recommendations.length),
      marketSignals: toMarketSignals(evidence),
      coupangMatches,
      trackingSnapshots: coupangMatches.map(toTrackingSnapshot),
      supplierMatches,
      scoredOpportunities: supplierMatches.map(toScoredOpportunity),
      recommendations,
    };
  }

  private async loadEvidence(organizationId: string): Promise<DiscoveryEvidence> {
    const query = { organizationId, days: DISCOVERY_WINDOW_DAYS };
    const [naverKeywords, popularKeywords, hot1688, shorts, response] = await Promise.all([
      this.trends.findNaverKeywordHistory(query),
      this.trends.findPopularKeywordHistory(query),
      this.trends.find1688HotHistory(query),
      this.trends.findShortsHistory(query),
      this.recommendations.latest({
        organizationId,
        surface: 'home',
        limit: RECOMMENDATION_LIMIT,
      }),
    ]);
    return {
      naverKeywords,
      popularKeywords,
      hot1688,
      shorts,
      recommendationRun: response.data
        ? {
            id: response.data.runId,
            generatedAt: response.lastSuccessfulAt ?? response.generatedAt,
            items: response.data.items,
          }
        : null,
    };
  }
}

function filterEvidence(
  evidence: DiscoveryEvidence,
  searchTerms: string[],
): DiscoveryEvidence {
  return {
    naverKeywords: evidence.naverKeywords.filter((row) => (
      matchesSearchTerms([row.keyword], searchTerms)
    )),
    popularKeywords: evidence.popularKeywords.filter((row) => (
      matchesSearchTerms([row.keyword, row.boardLabel], searchTerms)
    )),
    hot1688: evidence.hot1688.filter((row) => (
      matchesSearchTerms([row.sourceKeyword, row.title], searchTerms)
    )),
    shorts: evidence.shorts.filter((row) => (
      matchesSearchTerms([row.keyword, row.title, row.channelName], searchTerms)
    )),
    recommendationRun: evidence.recommendationRun,
  };
}

function toCoupangCandidate(
  item: SourcingRecommendationPresenterItem,
  runId: string,
  sourceDate: string,
): SourcingMarketModelCandidate {
  const coupang = item.coupang;
  const productId = coupang?.productId ?? item.externalOfferId;
  const itemId = item.variantKey || null;
  const vendorItemId = item.variantKey || null;
  const keyword = item.keyword ?? '';
  const salePrice = coupang?.salePriceKrw ?? item.salePriceKrw;
  const salesLast28d = nonNegative(coupang?.salesLast28d ?? null);
  const viewsLast3d = nonNegative(coupang?.viewsLast28d ?? null);
  const reviews = nonNegative(coupang?.ratingCount ?? null);
  const conversionRate = viewsLast3d > 0 ? roundOne(salesLast28d / viewsLast3d) : 0;
  const sourceSnapshotId = `${runId}:${item.itemKey}`;

  return {
    id: item.itemKey,
    rank: item.rank,
    productId,
    itemId,
    vendorItemId,
    productName: coupang?.productName ?? item.displayName,
    imagePath: item.imageUrl,
    primaryKeyword: keyword,
    keywords: compactStrings([keyword]),
    score: item.score,
    grade: item.grade,
    decision: item.baselineAction === 'order'
      ? 'recommend'
      : item.baselineAction === 'observe_3d'
        ? 'watch'
        : 'exclude',
    components: {
      marketReaction: component(item.scoreComponents, 'sales', 'views'),
      newProductReaction: component(item.scoreComponents, 'sales'),
      interestFit: 0,
      marginPotential: salePrice == null ? 0 : 50,
      supplyReadiness: 0,
      existingRecommendation: item.score,
      riskPenalty: 0,
    },
    metrics: {
      salesLast3d: Math.round(salesLast28d / 9),
      salesLast28d,
      viewsLast3d,
      reviews,
      salePrice,
      conversionRate,
      lowReviewSalesPower: roundOne(salesLast28d / Math.max(reviews, 1)),
      reviewDelta: null,
      salesDelta: null,
    },
    reasons: item.reasonCodes,
    risks: item.riskCodes,
    modelTags: ['canonical_recommendation_run', 'coupang_demand'],
    sourceSnapshotId,
    sourceDate,
  };
}

function toSupplierCandidate(
  item: SourcingRecommendationPresenterItem,
  runId: string,
  sourceDate: string,
): Sourcing1688NewProductCandidate | null {
  const sourceUrl = item.sourceUrl;
  if (!sourceUrl) return null;
  const priceCny = item.overseasPriceCny;
  const supplierScore = component(item.scoreComponents, 'supplier');
  const marginPotential = component(item.scoreComponents, 'margin');
  const demand = component(item.scoreComponents, 'demand');
  const momentum = component(item.scoreComponents, 'momentum');
  const competition = component(item.scoreComponents, 'competition');

  return {
    id: item.itemKey,
    rank: item.rank,
    offerId: item.externalOfferId,
    title: item.displayName,
    imageUrl: item.imageUrl,
    sourceUrl,
    keyword: item.keyword,
    matchMethod: 'keyword',
    score: item.score,
    grade: item.grade,
    decision: item.baselineAction,
    components: {
      newProductSignal: demand,
      supplyQuality: supplierScore,
      coupangMatch: competition,
      marketReaction: demand,
      threeDayValidation: momentum,
      marginPotential,
      riskPenalty: 0,
    },
    wholesale: {
      priceCny,
      monthlySales: item.monthlySales,
      tradeScore: item.tradeScore,
      repurchaseRate: item.repurchaseRate,
      supplierName: item.supplierName,
      shippingFulfillmentRate: null,
      shippingPickupRate: null,
      serviceScore: item.rating,
      landedCostKrw: item.overseasPriceKrw,
      estimatedProfitKrw: item.estimatedProfitKrw,
      estimatedMarginRate: item.estimatedMarginRate,
      sourceDate,
    },
    matchedCoupang: null,
    reasons: item.reasonCodes,
    risks: item.riskCodes,
    modelTags: ['canonical_recommendation_run', '1688_supply'],
    sourceSnapshotId: `${runId}:${item.itemKey}`,
    sourceDate,
  };
}

function findCoupangMatch(
  supplier: Sourcing1688NewProductCandidate,
  candidates: SourcingMarketModelCandidate[],
): Sourcing1688NewProductCandidate['matchedCoupang'] {
  const supplierTerms = compactStrings([supplier.keyword, supplier.title]);
  const match = candidates
    .filter((candidate) => matchesSearchTerms([
      candidate.productName,
      candidate.primaryKeyword,
      ...candidate.keywords,
    ], supplierTerms))
    .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id))[0];
  if (!match) return null;

  return {
    productId: match.productId,
    productName: match.productName,
    primaryKeyword: match.primaryKeyword,
    score: match.score,
    grade: match.grade,
    salePrice: match.metrics.salePrice,
    salesLast3d: match.metrics.salesLast3d,
    salesLast28d: match.metrics.salesLast28d,
    reviews: match.metrics.reviews,
    matchScore: normalizedText(supplier.keyword) === normalizedText(match.primaryKeyword) ? 100 : 70,
  };
}

function supplierSearchTerms(item: SourcingRecommendationPresenterItem): string[] {
  return [item.displayName, item.keyword].filter(
    (value): value is string => Boolean(value),
  );
}

function coupangSearchTerms(item: SourcingRecommendationPresenterItem): string[] {
  return [item.displayName, item.keyword, item.coupang?.productName].filter(
    (value): value is string => Boolean(value),
  );
}

function toMarketSignals(evidence: DiscoveryEvidence): Array<Record<string, unknown>> {
  return [
    ...evidence.naverKeywords.map((row) => ({
      source: 'naver_keyword',
      keyword: row.keyword,
      businessDate: dateString(row.businessDate),
      monthlyTotalSearchCount: row.monthlyTotalSearchCount,
      monthlyPcSearchCount: row.monthlyPcSearchCount,
      monthlyMobileSearchCount: row.monthlyMobileSearchCount,
      competitionIndex: row.competitionIndex,
      averageAdRank: row.averageAdRank,
      trendRatio: row.trendRatio,
      trendDelta: row.trendDelta,
      capturedAt: row.capturedAt.toISOString(),
    })),
    ...evidence.popularKeywords.map((row) => ({
      source: 'naver_popular',
      boardKey: row.boardKey,
      boardLabel: row.boardLabel,
      cid: row.cid,
      businessDate: dateString(row.businessDate),
      rank: row.rank,
      keyword: row.keyword,
      linkId: row.linkId,
    })),
    ...evidence.hot1688.map((row) => ({
      source: '1688_hot',
      businessDate: dateString(row.businessDate),
      capturedAt: row.capturedAt.toISOString(),
      offerId: row.offerId,
      sourceKeyword: row.sourceKeyword,
      rank: row.rank,
      title: row.title,
      priceCny: row.priceCny,
      monthlySales: row.monthlySales,
      repurchaseRate: row.repurchaseRate,
      tradeScore: row.tradeScore,
      supplierName: row.supplierName,
      imageUrl: row.imageUrl,
      sourceUrl: row.sourceUrl,
    })),
    ...evidence.shorts.map((row) => ({
      source: 'shorts',
      businessDate: dateString(row.businessDate),
      capturedAt: row.capturedAt.toISOString(),
      videoKey: row.videoKey,
      rank: row.rank,
      title: row.title,
      channelName: row.channelName,
      viewCount: row.viewCount,
      likeCount: row.likeCount,
      commentCount: row.commentCount,
      keyword: row.keyword,
      publishedAt: row.publishedAt?.toISOString() ?? null,
      thumbnailUrl: row.thumbnailUrl,
      videoUrl: row.videoUrl,
    })),
  ];
}

function toTrackingSnapshot(candidate: SourcingMarketModelCandidate): Record<string, unknown> {
  return {
    id: candidate.id,
    productId: candidate.productId,
    itemId: candidate.itemId,
    vendorItemId: candidate.vendorItemId,
    productName: candidate.productName,
    primaryKeyword: candidate.primaryKeyword,
    score: candidate.score,
    grade: candidate.grade,
    decision: candidate.decision,
    components: candidate.components,
    metrics: candidate.metrics,
    reasons: candidate.reasons,
    risks: candidate.risks,
    sourceSnapshotId: candidate.sourceSnapshotId,
    sourceDate: candidate.sourceDate,
  };
}

function toScoredOpportunity(
  candidate: Sourcing1688NewProductCandidate,
): SourcingScoredOpportunity {
  return {
    id: candidate.id,
    pipeline: SOURCING_1688_NEW_PRODUCT_MODEL_PIPELINE,
    productName: candidate.title,
    score: candidate.score,
    grade: candidate.grade,
    decision: candidate.decision,
    components: candidate.components,
    reasons: candidate.reasons,
    risks: candidate.risks,
    modelTags: candidate.modelTags,
    sourceSnapshotId: candidate.sourceSnapshotId,
    sourceDate: candidate.sourceDate,
  };
}

function toRecommendation(
  candidate: Sourcing1688NewProductCandidate & {
    matchedCoupang: NonNullable<Sourcing1688NewProductCandidate['matchedCoupang']>;
  },
  input: SourcingMarketDiscoveryInput,
  confidence: number,
): SourcingRecommendationCandidate {
  const score: SourcingRecommendationScore = {
    score: candidate.score,
    grade: candidate.grade,
    decision: candidate.decision,
    components: candidate.components,
    reasons: candidate.reasons,
    risks: candidate.risks,
    modelTags: candidate.modelTags,
  };
  const supplierEvidence = {
    offerId: candidate.offerId,
    sourceUrl: candidate.sourceUrl,
    imageUrl: candidate.imageUrl,
    ...candidate.wholesale,
  };
  const actionLabel = candidate.decision === 'order' ? '테스트 발주' : '3일 관찰';
  return {
    id: `sourcing-recommendation:${candidate.id}:${candidate.matchedCoupang.productId}`,
    productName: candidate.title,
    coupangEvidence: candidate.matchedCoupang,
    supplierEvidence,
    score,
    artifact: {
      title: `${candidate.title} ${actionLabel} 후보`,
      summary: {
        keyword: input.keyword.trim(),
        category: input.category ?? null,
        productName: candidate.title,
        offerId: candidate.offerId,
        sourceUrl: candidate.sourceUrl,
        supplierName: candidate.wholesale.supplierName,
        priceCny: candidate.wholesale.priceCny,
        monthlySales: candidate.wholesale.monthlySales,
        repurchaseRate: candidate.wholesale.repurchaseRate,
        tradeScore: candidate.wholesale.tradeScore,
        landedCostKrw: candidate.wholesale.landedCostKrw,
        estimatedProfitKrw: candidate.wholesale.estimatedProfitKrw,
        estimatedMarginRate: candidate.wholesale.estimatedMarginRate,
        coupangProductId: candidate.matchedCoupang.productId,
        coupangProductName: candidate.matchedCoupang.productName,
        coupangSalePrice: candidate.matchedCoupang.salePrice,
        coupangSalesLast3d: candidate.matchedCoupang.salesLast3d,
        coupangReviews: candidate.matchedCoupang.reviews,
        matchScore: candidate.matchedCoupang.matchScore,
        score: candidate.score,
        grade: candidate.grade,
        decision: candidate.decision,
        components: candidate.components,
        reasons: candidate.reasons,
        risks: candidate.risks,
        confidence,
        sourceSnapshotId: candidate.sourceSnapshotId,
        sourceDate: candidate.sourceDate,
      },
    },
  };
}

interface EvidenceCoverage {
  naverKeywordCount: number;
  popularKeywordCount: number;
  hot1688Count: number;
  shortsCount: number;
  coupangCount: number;
  supplierCount: number;
}

function confidenceFromEvidence(coverage: EvidenceCoverage): number {
  const present = Object.values(coverage).filter((count) => count > 0).length;
  return Math.round((present / SOURCE_GROUP_COUNT) * 100) / 100;
}

function dataGaps(coverage: EvidenceCoverage, recommendationCount: number): string[] {
  const gaps: string[] = [];
  if (coverage.naverKeywordCount === 0) gaps.push('naver_keyword_history_missing');
  if (coverage.popularKeywordCount === 0) gaps.push('naver_popular_history_missing');
  if (coverage.hot1688Count === 0) gaps.push('1688_history_missing');
  if (coverage.shortsCount === 0) gaps.push('shorts_history_missing');
  if (coverage.coupangCount === 0) gaps.push('coupang_recommendation_evidence_missing');
  if (coverage.supplierCount === 0) gaps.push('1688_supplier_evidence_missing');
  if (recommendationCount === 0) gaps.push('coupang_supplier_cross_evidence_missing');
  return gaps;
}

function matchesSearchTerms(
  values: Array<string | null | undefined>,
  searchTerms: string[],
): boolean {
  if (searchTerms.length === 0) return true;
  const normalizedValues = compactStrings(values).map(normalizedText);
  return searchTerms.some((term) => {
    const normalizedTerm = normalizedText(term);
    return normalizedValues.some((value) => (
      value.includes(normalizedTerm) || normalizedTerm.includes(value)
    ));
  });
}

function compactStrings(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value))));
}

function normalizedText(value: string | null | undefined): string {
  return value?.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '') ?? '';
}

function component(values: Record<string, number>, ...keys: string[]): number {
  const known = keys
    .map((key) => values[key])
    .filter((value): value is number => Number.isFinite(value));
  if (known.length === 0) return 0;
  return Math.round(known.reduce((sum, value) => sum + value, 0) / known.length);
}

function nonNegative(value: number | null): number {
  return value == null ? 0 : Math.max(0, value);
}

function roundOne(value: number): number {
  return Math.round(value * 10) / 10;
}

function dateString(value: Date): string {
  return value.toISOString().slice(0, 10);
}
