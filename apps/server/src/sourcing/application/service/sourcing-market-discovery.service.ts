import { Inject, Injectable } from '@nestjs/common';
import { kstBusinessDate } from '../../../common/kst';
import {
  buildSourcing1688NewProductModel,
  SOURCING_1688_NEW_PRODUCT_MODEL_PIPELINE,
  type Sourcing1688NewProductCandidate,
  type Sourcing1688NewProductModelSourceSnapshot,
} from '../../domain/sourcing-1688-new-product-model';
import {
  buildSourcingMarketModel,
  type SourcingMarketModelCandidate,
  type SourcingMarketModelSourceSnapshot,
} from '../../domain/sourcing-market-model';
import {
  SOURCING_WORKSPACE_SNAPSHOT_REPOSITORY_PORT,
  type SourcingWorkspaceSnapshotRepositoryPort,
  type SourcingWorkspaceSnapshotRow,
} from '../port/out/repository/sourcing-workspace-snapshot.repository.port';
import {
  TREND_COLLECTION_REPOSITORY_PORT,
  type NaverKeywordSnapshotRow,
  type NaverPopularKeywordSnapshotRow,
  type ShortsSnapshotRow,
  type Sourcing1688HotProductSnapshotRow,
  type TrendCollectionRepositoryPort,
} from '../port/out/repository/trend-collection.repository.port';

const DISCOVERY_WINDOW_DAYS = 30;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const SOURCE_GROUP_COUNT = 6;

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
  todayRecommendations: SourcingWorkspaceSnapshotRow[];
  new1688Products: SourcingWorkspaceSnapshotRow[];
}

@Injectable()
export class SourcingMarketDiscoveryService {
  constructor(
    @Inject(TREND_COLLECTION_REPOSITORY_PORT)
    private readonly trends: TrendCollectionRepositoryPort,
    @Inject(SOURCING_WORKSPACE_SNAPSHOT_REPOSITORY_PORT)
    private readonly snapshots: SourcingWorkspaceSnapshotRepositoryPort,
  ) {}

  async discover(
    input: SourcingMarketDiscoveryInput,
  ): Promise<SourcingMarketDiscoveryResult> {
    const searchTerms = compactStrings([input.keyword, input.category]);
    const evidence = await this.loadEvidence(input.organizationId);
    const relevant = filterEvidence(evidence, searchTerms);

    const marketSourceSnapshots = relevant.todayRecommendations.map(toMarketSourceSnapshot);
    const marketModel = buildSourcingMarketModel({ snapshots: marketSourceSnapshots });
    const coupangMatches = marketModel.candidates.filter((candidate) => (
      matchesSearchTerms([
        candidate.productName,
        candidate.primaryKeyword,
        ...candidate.keywords,
      ], searchTerms)
    ));

    const supplierSourceSnapshots = [
      ...relevant.new1688Products.map(to1688SourceSnapshot),
      ...to1688TrendSourceSnapshots(relevant.hot1688),
      ...relevant.todayRecommendations.map(to1688SourceSnapshot),
      toDerivedMarketSourceSnapshot(input.organizationId, marketModel, relevant.todayRecommendations),
    ];
    const supplierModel = buildSourcing1688NewProductModel({
      snapshots: supplierSourceSnapshots,
    });
    const supplierMatches = supplierModel.candidates.filter((candidate) => (
      matchesSearchTerms([
        candidate.title,
        candidate.keyword,
        candidate.matchedCoupang?.productName,
        candidate.matchedCoupang?.primaryKeyword,
      ], searchTerms)
    ));
    const recommendations = supplierMatches
      .filter((candidate): candidate is Sourcing1688NewProductCandidate & {
        matchedCoupang: NonNullable<Sourcing1688NewProductCandidate['matchedCoupang']>;
      } => candidate.matchedCoupang != null && candidate.decision !== 'exclude')
      .map((candidate) => toRecommendation(candidate, input, confidenceFromEvidence({
        naverKeywordCount: relevant.naverKeywords.length,
        popularKeywordCount: relevant.popularKeywords.length,
        hot1688Count: relevant.hot1688.length,
        shortsCount: relevant.shorts.length,
        coupangCount: coupangMatches.length,
        supplierCount: supplierMatches.length,
      })));
    const coverage = {
      naverKeywordCount: relevant.naverKeywords.length,
      popularKeywordCount: relevant.popularKeywords.length,
      hot1688Count: relevant.hot1688.length,
      shortsCount: relevant.shorts.length,
      coupangCount: coupangMatches.length,
      supplierCount: supplierMatches.length,
    };

    return {
      mode: 'replay',
      windowDays: DISCOVERY_WINDOW_DAYS,
      confidence: confidenceFromEvidence(coverage),
      dataGaps: dataGaps(coverage, recommendations.length),
      marketSignals: toMarketSignals(relevant),
      coupangMatches,
      trackingSnapshots: coupangMatches.map(toTrackingSnapshot),
      supplierMatches,
      scoredOpportunities: supplierMatches.map(toScoredOpportunity),
      recommendations,
    };
  }

  private async loadEvidence(organizationId: string): Promise<DiscoveryEvidence> {
    const toBusinessDate = kstBusinessDate(new Date());
    const fromBusinessDate = new Date(
      toBusinessDate.getTime() - (DISCOVERY_WINDOW_DAYS - 1) * ONE_DAY_MS,
    );
    const query = { organizationId, days: DISCOVERY_WINDOW_DAYS };
    const snapshotQuery = {
      organizationId,
      fromBusinessDate,
      toBusinessDate,
      limit: DISCOVERY_WINDOW_DAYS,
    };
    const [
      naverKeywords,
      popularKeywords,
      hot1688,
      shorts,
      todayRecommendations,
      new1688Products,
    ] = await Promise.all([
      this.trends.findNaverKeywordHistory(query),
      this.trends.findPopularKeywordHistory(query),
      this.trends.find1688HotHistory(query),
      this.trends.findShortsHistory(query),
      this.snapshots.listRecent({ ...snapshotQuery, scope: 'today_recommendations' }),
      this.snapshots.listRecent({ ...snapshotQuery, scope: '1688_new_products' }),
    ]);
    return {
      naverKeywords,
      popularKeywords,
      hot1688,
      shorts,
      todayRecommendations,
      new1688Products,
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
    todayRecommendations: evidence.todayRecommendations,
    new1688Products: evidence.new1688Products,
  };
}

function toMarketSourceSnapshot(
  row: SourcingWorkspaceSnapshotRow,
): SourcingMarketModelSourceSnapshot {
  return {
    id: row.id,
    scope: 'today_recommendations',
    businessDate: dateString(row.businessDate),
    payload: row.payload,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function to1688SourceSnapshot(
  row: SourcingWorkspaceSnapshotRow,
): Sourcing1688NewProductModelSourceSnapshot {
  return {
    id: row.id,
    scope: row.scope === '1688_new_products'
      ? '1688_new_products'
      : 'today_recommendations',
    businessDate: dateString(row.businessDate),
    payload: row.payload,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toDerivedMarketSourceSnapshot(
  organizationId: string,
  result: ReturnType<typeof buildSourcingMarketModel>,
  rows: SourcingWorkspaceSnapshotRow[],
): Sourcing1688NewProductModelSourceSnapshot {
  const latest = [...rows].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0];
  const businessDate = latest?.businessDate ?? kstBusinessDate(new Date());
  const updatedAt = latest?.updatedAt ?? businessDate;
  return {
    id: `discovery-market-model:${organizationId}:${dateString(businessDate)}`,
    scope: 'sourcing_market_model',
    businessDate: dateString(businessDate),
    payload: { result },
    updatedAt: updatedAt.toISOString(),
  };
}

function to1688TrendSourceSnapshots(
  rows: Sourcing1688HotProductSnapshotRow[],
): Sourcing1688NewProductModelSourceSnapshot[] {
  const byDate = new Map<string, Sourcing1688HotProductSnapshotRow[]>();
  for (const row of rows) {
    const date = dateString(row.businessDate);
    byDate.set(date, [...(byDate.get(date) ?? []), row]);
  }
  return [...byDate.entries()].map(([businessDate, dateRows]) => ({
    id: `trend-1688:${businessDate}`,
    scope: '1688_new_products',
    businessDate,
    payload: {
      result: {
        items: dateRows.map((row) => ({
          offerId: row.offerId,
          keyword: row.sourceKeyword,
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
      },
    },
    updatedAt: new Date(Math.max(...dateRows.map((row) => row.capturedAt.getTime()))).toISOString(),
  }));
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
  const normalizedValues = compactStrings(values).map(normalizeText);
  return searchTerms.some((term) => {
    const normalizedTerm = normalizeText(term);
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

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
}

function dateString(value: Date): string {
  return value.toISOString().slice(0, 10);
}
