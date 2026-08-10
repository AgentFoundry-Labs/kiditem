import { Inject, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { kstBusinessDate } from '../../../common/kst';
import {
  baselineActionForScore,
  buildCoupangRecommendations,
  SOURCING_RECOMMENDATION_CALCULATION_VERSION,
  SOURCING_RECOMMENDATION_MODEL_VERSION,
  SOURCING_RECOMMENDATION_POLICY_KEY,
  SOURCING_RECOMMENDATION_POLICY_VERSION,
} from '../../domain/sourcing-recommendation-policy';
import { canonicalJson } from '../../domain/sourcing-stable-json';
import {
  buildEntryRecommendations,
  type EntryInterestKeyword,
  type EntryPopularKeyword,
  type EntrySupplyItem,
} from '../../domain/sourcing-entry-recommendation';
import {
  SOURCING_INTEREST_TARGET_REPOSITORY_PORT,
  type SourcingInterestTargetRepositoryPort,
} from '../port/out/repository/sourcing-interest-target.repository.port';
import {
  SOURCING_RECOMMENDATION_REPOSITORY_PORT,
  type SourcingRecommendationItemWrite,
  type SourcingRecommendationRepositoryPort,
  type SourcingRecommendationRunGraph,
} from '../port/out/repository/sourcing-recommendation.repository.port';
import {
  SOURCING_RECOMMENDATION_SOURCE_REPOSITORY_PORT,
  type SourcingOfferObservationSource,
  type SourcingRecommendationSourceRepositoryPort,
} from '../port/out/repository/sourcing-recommendation-source.repository.port';
import {
  TREND_COLLECTION_REPOSITORY_PORT,
  type TrendCollectionRepositoryPort,
} from '../port/out/repository/trend-collection.repository.port';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const LOOKBACK_DAYS = 30;

export type SourcingRecommendationSurface = 'home' | 'today' | 'entry' | 'final';

export interface SourcingRecommendationEnvelope {
  status: 'ready' | 'collecting' | 'stale' | 'unavailable';
  generatedAt: string;
  lastSuccessfulAt: string | null;
  freshUntil: string | null;
  operationId: string | null;
  warnings: Array<{ code: string; message: string }>;
  error: { code: string; retryable: boolean; message: string } | null;
  data: {
    runId: string;
    items: SourcingRecommendationPresenterItem[];
    nextCursor: string | null;
  } | null;
}

export interface SourcingRecommendationPresenterItem {
  itemKey: string;
  sourcePlatform: '1688' | 'coupang';
  externalOfferId: string;
  variantKey: string;
  rank: number;
  score: number;
  grade: 'A' | 'B' | 'C' | 'WATCH';
  baselineAction: 'order' | 'observe_3d' | 'exclude';
  reasonCodes: string[];
  riskCodes: string[];
  displayName: string;
  keyword: string | null;
  isNewKeyword: boolean;
  imageUrl: string | null;
  sourceUrl: string | null;
  overseasPriceCny: number | null;
  overseasPriceKrw: number | null;
  salePriceKrw: number | null;
  supplierName: string | null;
  monthlySales: number | null;
  repurchaseRate: string | null;
  tradeScore: number | null;
  minOrderQuantity: number | null;
  estimatedMarginRate: number | null;
  estimatedProfitKrw: number | null;
  shippingLabel: string | null;
  rating: number | null;
  tags: string[];
  sourceKeywords: string[];
  offerObservationIds: string[];
  scoreComponents: Record<string, number>;
  evidenceObservationIds: string[];
  coupang: {
    productId: string;
    productName: string;
    salePriceKrw: number | null;
    ratingCount: number | null;
    ratingAverage: number | null;
    viewsLast28d: number | null;
    salesLast28d: number | null;
  } | null;
  interest: {
    tier: 'exact' | 'related';
    keywords: string[];
    origins: Array<'saved' | 'seed'>;
    matches: Array<{ keyword: string; tier: 'exact' | 'related' }>;
  } | null;
  contributingSources: string[];
}

@Injectable()
export class SourcingRecommendationService {
  constructor(
    @Inject(SOURCING_RECOMMENDATION_SOURCE_REPOSITORY_PORT)
    private readonly sources: SourcingRecommendationSourceRepositoryPort,
    @Inject(SOURCING_RECOMMENDATION_REPOSITORY_PORT)
    private readonly runs: SourcingRecommendationRepositoryPort,
    @Inject(TREND_COLLECTION_REPOSITORY_PORT)
    private readonly trends: TrendCollectionRepositoryPort,
    @Inject(SOURCING_INTEREST_TARGET_REPOSITORY_PORT)
    private readonly interests: SourcingInterestTargetRepositoryPort,
  ) {}

  async latest(input: {
    organizationId: string;
    surface: SourcingRecommendationSurface;
    limit?: number;
    cursor?: string;
  }): Promise<SourcingRecommendationEnvelope> {
    const now = new Date();
    const run = await this.runs.findLatest({ organizationId: input.organizationId, now });
    if (!run) return unavailableEnvelope(now, 'RECOMMENDATION_RUN_MISSING');
    return readyEnvelope(run, input.surface, normalizeLimit(input.limit));
  }

  async refresh(input: {
    organizationId: string;
    limit?: number;
  }): Promise<SourcingRecommendationEnvelope> {
    const limit = normalizeLimit(input.limit);
    const cutoffAt = new Date();
    const businessDate = kstBusinessDate(cutoffAt);
    const [offersResult, coupangResult, popularRows, targets, seeds] = await Promise.all([
      this.sources.listLatestOfferObservations({
        organizationId: input.organizationId,
        cutoffAt,
        lookbackDays: LOOKBACK_DAYS,
        limit,
      }),
      this.sources.listLatestCoupangObservations({
        organizationId: input.organizationId,
        cutoffAt,
        lookbackDays: LOOKBACK_DAYS,
        limit,
      }),
      this.trends.findPopularKeywordHistory({
        organizationId: input.organizationId,
        days: 14,
      }),
      this.interests.list(input.organizationId),
      this.trends.listSeeds(input.organizationId),
    ]);

    const supplyGroups = groupOfferObservations(offersResult.items);
    const entryResult = buildEntryRecommendations({
      supplyItems: supplyGroups.map((group) => toEntrySupplyItem(group.primary)),
      risingCandidates: [],
      popularKeywords: popularRows.map((row): EntryPopularKeyword => ({
        keyword: row.keyword,
        boardKey: row.boardKey,
        boardLabel: row.boardLabel,
        businessDate: row.businessDate,
        rank: row.rank,
      })),
      interestKeywords: toInterestKeywords(targets, seeds),
      supplyBusinessDate: maxBusinessDate(offersResult.items),
      risingBusinessDate: null,
      today: businessDate,
      limit,
    });

    const groupByItemKey = new Map(
      supplyGroups.map((group) => [group.primary.externalOfferId + '\u001f' + group.primary.variantKey, group]),
    );
    const offerItems = entryResult.items.map((item): SourcingRecommendationItemWrite => {
      const group = groupByItemKey.get(item.externalOfferId + '\u001f' + item.variantKey);
      const evidenceObservationIds = group?.evidenceObservationIds ?? compactIds([item.evidenceObservationId]);
      return {
        itemKey: item.itemKey,
        sourcePlatform: '1688',
        externalOfferId: item.externalOfferId,
        variantKeyNormalized: item.variantKey,
        matchedCoupangProductId: item.coupang?.productId ?? null,
        displayName: item.title,
        rank: item.rank,
        score: item.score,
        grade: item.grade,
        baselineAction: baselineActionForScore(item.score),
        reasonCodes: item.reasons,
        riskCodes: item.risks,
        scoreComponents: entryScoreComponents(item.components),
        sourceSnapshot: {
          keyword: item.keyword,
          imageUrl: item.imageUrl,
          sourceUrl: item.sourceUrl,
          overseasPriceCny: item.overseasPriceCny,
          overseasPriceKrw: item.overseasPriceKrw,
          salePriceKrw: item.salePriceKrw,
          shippingLabel: item.shippingLabel,
          rating: item.rating,
          tags: item.tags,
          minOrderQuantity: item.minOrderQuantity,
          estimatedMarginRate: item.estimatedMarginRate,
          estimatedProfitKrw: item.estimatedProfitKrw,
          supplierName: item.supplierName,
          coupang: item.coupang,
          interest: item.interest,
          contributingSources: item.contributingSources,
          offerObservationIds: group?.observationIds ?? compactIds([item.offerObservationId]),
          sourceKeywords: group?.sourceKeywords ?? [],
          isNewKeyword: item.isNewKeyword,
          monthlySales: group?.primary.monthlySales ?? null,
          repurchaseRate: stringValue(group?.primary.rawOffer.repurchaseRate),
          tradeScore: numberValue(group?.primary.rawOffer.tradeScore),
          shippingFulfillmentRate: stringValue(group?.primary.rawOffer.shippingFulfillmentRate),
          shippingPickupRate: stringValue(group?.primary.rawOffer.shippingPickupRate),
        },
        evidenceObservationIds,
      };
    });
    const wingItems = buildCoupangRecommendations(coupangResult.items).map(
      (item): SourcingRecommendationItemWrite => ({
        itemKey: item.itemKey,
        sourcePlatform: 'coupang',
        externalOfferId: item.externalOfferId,
        variantKeyNormalized: item.variantKeyNormalized,
        matchedCoupangProductId: item.externalOfferId,
        displayName: item.displayName,
        rank: item.rank,
        score: item.score,
        grade: item.grade,
        baselineAction: item.baselineAction,
        reasonCodes: item.reasonCodes,
        riskCodes: item.riskCodes,
        scoreComponents: item.scoreComponents,
        sourceSnapshot: item.sourceSnapshot,
        evidenceObservationIds: item.evidenceObservationIds,
      }),
    );
    const items = [...offerItems, ...wingItems]
      .sort((left, right) => right.score - left.score || left.itemKey.localeCompare(right.itemKey))
      .map((item, index) => ({ ...item, rank: index + 1 }));
    const warningCodes = [
      ...(offersResult.rejectedCount > 0 ? ['offer_observations_rejected'] : []),
      ...(coupangResult.rejectedCount > 0 ? ['coupang_observations_rejected'] : []),
      ...(entryResult.dataGaps.length > 0 ? ['recommendation_data_gaps'] : []),
    ];
    const inputManifest = buildInputManifest({
      businessDate,
      cutoffAt,
      offers: offersResult.items,
      coupangEvidenceIds: coupangResult.items.map((item) => item.evidenceObservationId),
      targets,
      popularRows,
    });
    const inputManifestHash = hashManifest(inputManifest.stable);
    const result = await this.runs.createOrGet({
      organizationId: input.organizationId,
      policyKey: SOURCING_RECOMMENDATION_POLICY_KEY,
      policyVersion: SOURCING_RECOMMENDATION_POLICY_VERSION,
      modelVersion: SOURCING_RECOMMENDATION_MODEL_VERSION,
      calculationVersion: SOURCING_RECOMMENDATION_CALCULATION_VERSION,
      inputManifestHash,
      inputManifest: inputManifest.full,
      status: warningCodes.length > 0 ? 'partial' : 'complete',
      businessDate,
      generatedAt: cutoffAt,
      completedAt: cutoffAt,
      expiresAt: null,
      warningCodes,
      errorCode: null,
      errorMessage: null,
      items,
    });
    return readyEnvelope(result.run, 'entry', limit);
  }
}

function groupOfferObservations(
  observations: SourcingOfferObservationSource[],
): Array<{
  primary: SourcingOfferObservationSource;
  observationIds: string[];
  evidenceObservationIds: string[];
  sourceKeywords: string[];
}> {
  const byOffer = new Map<string, SourcingOfferObservationSource[]>();
  for (const observation of observations) {
    const key = `${observation.externalOfferId}\u001f${observation.variantKey}`;
    const values = byOffer.get(key) ?? [];
    values.push(observation);
    byOffer.set(key, values);
  }
  return [...byOffer.values()].map((values) => {
    const sorted = [...values].sort((left, right) => right.capturedAt.getTime() - left.capturedAt.getTime());
    return {
      primary: sorted[0],
      observationIds: compactIds(sorted.map((item) => item.id)),
      evidenceObservationIds: compactIds(sorted.map((item) => item.evidenceObservationId)),
      sourceKeywords: [...new Set(sorted.map((item) => item.sourceKeyword))].sort(),
    };
  });
}

function toEntrySupplyItem(observation: SourcingOfferObservationSource): EntrySupplyItem {
  const raw = observation.rawOffer;
  return {
    externalOfferId: observation.externalOfferId,
    variantKey: observation.variantKey,
    offerObservationId: observation.id,
    evidenceObservationId: observation.evidenceObservationId,
    title: observation.title,
    keyword: observation.sourceKeyword,
    imageUrl: observation.imageUrl,
    sourceUrl: observation.sourceUrl,
    priceCny: observation.priceCny,
    supplierName: observation.supplierName,
    salesNum: observation.monthlySales,
    repurchaseRate: stringValue(raw.repurchaseRate),
    serviceScore: numberValue(raw.tradeScore),
    minOrderQuantity: numberValue(raw.minOrderQuantity),
  };
}

function toInterestKeywords(
  targets: Awaited<ReturnType<SourcingInterestTargetRepositoryPort['list']>>,
  seeds: Awaited<ReturnType<TrendCollectionRepositoryPort['listSeeds']>>,
): EntryInterestKeyword[] {
  return [
    ...targets.flatMap((target) => {
      if (target.targetType !== 'keyword') return [];
      const keyword = (target.keyword ?? target.label).trim();
      return keyword ? [{ keyword, origin: 'saved' as const }] : [];
    }),
    ...seeds.flatMap((seed) => {
      const keyword = seed.enabled ? seed.keyword.trim() : '';
      return keyword ? [{ keyword, origin: 'seed' as const }] : [];
    }),
  ];
}

function maxBusinessDate(observations: SourcingOfferObservationSource[]): string | null {
  if (observations.length === 0) return null;
  return observations.reduce(
    (latest, item) => (item.businessDate > latest ? item.businessDate : latest),
    observations[0].businessDate,
  ).toISOString().slice(0, 10);
}

function buildInputManifest(input: {
  businessDate: Date;
  cutoffAt: Date;
  offers: SourcingOfferObservationSource[];
  coupangEvidenceIds: string[];
  targets: Awaited<ReturnType<SourcingInterestTargetRepositoryPort['list']>>;
  popularRows: Awaited<ReturnType<TrendCollectionRepositoryPort['findPopularKeywordHistory']>>;
}): { stable: Record<string, unknown>; full: Record<string, unknown> } {
  const stable = {
    businessDate: input.businessDate.toISOString().slice(0, 10),
    offerObservations: input.offers
      .map((item) => ({ id: item.id, evidenceObservationId: item.evidenceObservationId, capturedAt: item.capturedAt.toISOString() }))
      .sort(compareJson),
    coupangEvidenceIds: compactIds(input.coupangEvidenceIds).sort(),
    interests: input.targets
      .map((target) => ({ id: target.id, version: target.version }))
      .sort(compareJson),
    popularRows: input.popularRows
      .map((row) => ({ boardKey: row.boardKey, keyword: row.keyword, businessDate: row.businessDate.toISOString(), rank: row.rank }))
      .sort(compareJson),
    policy: {
      key: SOURCING_RECOMMENDATION_POLICY_KEY,
      policyVersion: SOURCING_RECOMMENDATION_POLICY_VERSION,
      modelVersion: SOURCING_RECOMMENDATION_MODEL_VERSION,
      calculationVersion: SOURCING_RECOMMENDATION_CALCULATION_VERSION,
    },
  };
  return {
    stable,
    full: { ...stable, readCutoffAt: input.cutoffAt.toISOString() },
  };
}

function hashManifest(value: Record<string, unknown>): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

function readyEnvelope(
  run: SourcingRecommendationRunGraph,
  surface: SourcingRecommendationSurface,
  limit: number,
): SourcingRecommendationEnvelope {
  const items = presentItems(run, surface).slice(0, limit);
  return {
    status: 'ready',
    generatedAt: run.generatedAt.toISOString(),
    lastSuccessfulAt: run.completedAt?.toISOString() ?? run.generatedAt.toISOString(),
    freshUntil: run.expiresAt?.toISOString() ?? null,
    operationId: null,
    warnings: run.warningCodes.map((code) => ({ code, message: code })),
    error: null,
    data: { runId: run.id, items, nextCursor: null },
  };
}

function unavailableEnvelope(now: Date, code: string): SourcingRecommendationEnvelope {
  return {
    status: 'unavailable',
    generatedAt: now.toISOString(),
    lastSuccessfulAt: null,
    freshUntil: null,
    operationId: null,
    warnings: [],
    error: { code, retryable: true, message: '추천 데이터가 아직 생성되지 않았습니다.' },
    data: null,
  };
}

function presentItems(
  run: SourcingRecommendationRunGraph,
  surface: SourcingRecommendationSurface,
): SourcingRecommendationPresenterItem[] {
  const filtered = run.items.filter((item) => {
    if (surface === 'home' || surface === 'today') {
      return item.sourcePlatform === 'coupang';
    }
    if (surface === 'entry') return item.sourcePlatform === '1688';
    if (surface === 'final') {
      const source = recordValue(item.sourceSnapshot);
      return item.sourcePlatform === '1688' && stringsValue(source.offerObservationIds).length > 0;
    }
    return false;
  });
  return filtered.map((item, index) => presentItem(item, index + 1));
}

function presentItem(
  item: SourcingRecommendationRunGraph['items'][number],
  rank: number,
): SourcingRecommendationPresenterItem {
  const source = recordValue(item.sourceSnapshot);
  const coupang = presentCoupang(item, source);
  return {
    itemKey: item.itemKey,
    sourcePlatform: item.sourcePlatform,
    externalOfferId: item.externalOfferId,
    variantKey: item.variantKeyNormalized,
    rank,
    score: item.score,
    grade: item.grade,
    baselineAction: item.baselineAction,
    reasonCodes: item.reasonCodes,
    riskCodes: item.riskCodes,
    displayName: item.displayName,
    keyword: stringValue(source.keyword),
    isNewKeyword: source.isNewKeyword === true,
    imageUrl: stringValue(source.imageUrl),
    sourceUrl: stringValue(source.sourceUrl),
    overseasPriceCny: numberValue(source.overseasPriceCny),
    overseasPriceKrw: integerOrNull(source.overseasPriceKrw),
    salePriceKrw: integerOrNull(source.salePriceKrw),
    supplierName: stringValue(source.supplierName),
    monthlySales: numberValue(source.monthlySales),
    repurchaseRate: stringValue(source.repurchaseRate),
    tradeScore: numberValue(source.tradeScore),
    minOrderQuantity: numberValue(source.minOrderQuantity),
    estimatedMarginRate: numberValue(source.estimatedMarginRate),
    estimatedProfitKrw: integerOrNull(source.estimatedProfitKrw),
    shippingLabel: stringValue(source.shippingLabel),
    rating: numberValue(source.rating),
    tags: stringsValue(source.tags),
    sourceKeywords: stringsValue(source.sourceKeywords),
    offerObservationIds: stringsValue(source.offerObservationIds),
    scoreComponents: item.scoreComponents,
    evidenceObservationIds: item.evidenceObservationIds,
    coupang,
    interest: presentInterest(source.interest),
    contributingSources: stringsValue(source.contributingSources).length > 0
      ? stringsValue(source.contributingSources)
      : item.sourcePlatform === '1688'
        ? ['supply_1688_new']
        : ['coupang_competitor'],
  };
}

function presentCoupang(
  item: SourcingRecommendationRunGraph['items'][number],
  source: Record<string, unknown>,
): SourcingRecommendationPresenterItem['coupang'] {
  const raw = item.sourcePlatform === 'coupang'
    ? source
    : recordValue(source.coupang);
  const productId = stringValue(raw.productId);
  const productName = stringValue(raw.productName);
  if (!productId || !productName) return null;
  return {
    productId,
    productName,
    salePriceKrw: integerOrNull(raw.salePriceKrw ?? raw.salePrice),
    ratingCount: integerOrNull(raw.ratingCount ?? raw.reviews),
    ratingAverage: numberValue(raw.ratingAverage),
    viewsLast28d: integerOrNull(raw.viewsLast28d),
    salesLast28d: integerOrNull(raw.salesLast28d),
  };
}

function presentInterest(
  value: unknown,
): SourcingRecommendationPresenterItem['interest'] {
  const interest = recordValue(value);
  const tier = interest.tier;
  if (tier !== 'exact' && tier !== 'related') return null;
  const origins = stringsValue(interest.origins).filter(
    (origin): origin is 'saved' | 'seed' => origin === 'saved' || origin === 'seed',
  );
  const matches: Array<{ keyword: string; tier: 'exact' | 'related' }> = Array.isArray(interest.matches)
    ? interest.matches.flatMap((value) => {
        const match = recordValue(value);
        const keyword = stringValue(match.keyword);
        const matchTier = match.tier;
        return keyword && (matchTier === 'exact' || matchTier === 'related')
          ? [{ keyword, tier: matchTier }]
          : [];
      })
    : [];
  return {
    tier,
    keywords: stringsValue(interest.keywords),
    origins,
    matches,
  };
}

function normalizeLimit(value: number | undefined): number {
  if (value == null || !Number.isFinite(value)) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(MAX_LIMIT, Math.floor(value)));
}

function compactIds(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.map((value) => value?.trim() ?? '').filter(Boolean))];
}

function entryScoreComponents(input: {
  margin: number;
  demand: number;
  competition: number;
  momentum: number;
  supplier: number;
}): Record<string, number> {
  return {
    margin: input.margin,
    demand: input.demand,
    competition: input.competition,
    momentum: input.momentum,
    supplier: input.supplier,
  };
}

function numberValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function integerOrNull(value: unknown): number | null {
  const number = numberValue(value);
  return number == null ? null : Math.round(number);
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function stringsValue(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.flatMap((item) => {
    const string = stringValue(item);
    return string ? [string] : [];
  }))];
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function compareJson(left: object, right: object): number {
  return canonicalJson(left).localeCompare(canonicalJson(right));
}
