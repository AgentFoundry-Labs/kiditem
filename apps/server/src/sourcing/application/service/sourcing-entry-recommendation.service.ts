import { Injectable } from '@nestjs/common';
import type {
  EntryInterestKeywordStatus,
  EntryRecommendation,
  EntryRecommendationComponents,
  EntryRecommendationResult,
  EntrySourceKey,
  EntrySourceStatus,
} from '../../domain/sourcing-entry-recommendation';
import {
  SourcingRecommendationService,
  type SourcingRecommendationPresenterItem,
} from './sourcing-recommendation.service';
import {
  businessDateKey,
  currentBusinessDate,
  datesInclusive,
  parseBusinessDate,
  toBusinessDate as parseBusinessTimestamp,
} from '../../../common/kst';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

export interface GetEntryRecommendationsInput {
  organizationId: string;
  limit?: number;
}

/**
 * 기존 `/sourcing/entry/recommendations` 화면 계약을 보존하는 presenter이다.
 *
 * 추천 계산과 원본 관측 조회는 `SourcingRecommendationService`만 소유한다. 이
 * facade는 이전 Entry 카드가 기대하는 필드로 저장된 recommendation run을 투영할
 * 뿐, workspace JSON이나 별도의 점수 모델을 다시 읽거나 계산하지 않는다.
 */
@Injectable()
export class SourcingEntryRecommendationService {
  constructor(private readonly recommendations: SourcingRecommendationService) {}

  async getRecommendations(
    input: GetEntryRecommendationsInput,
  ): Promise<EntryRecommendationResult> {
    const result = await this.recommendations.latest({
      organizationId: input.organizationId,
      surface: 'entry',
      limit: normalizeLimit(input.limit),
    });
    const items = (result.data?.items ?? []).map(toEntryRecommendation);
    const businessDate = toBusinessDate(result.lastSuccessfulAt);

    return {
      items,
      sources: buildSourceStatuses(items, businessDate),
      interestKeywords: readInterestKeywords(result.data?.items ?? []),
      dataGaps: [
        ...result.warnings.map((warning) => warning.message),
        ...(result.error ? [result.error.message] : []),
      ],
    };
  }
}

function toEntryRecommendation(item: SourcingRecommendationPresenterItem): EntryRecommendation {
  const components = toComponents(item.scoreComponents);
  const contributingSources = readContributingSources(item.contributingSources);

  return {
    itemKey: item.itemKey,
    id: item.itemKey,
    externalOfferId: item.externalOfferId,
    variantKey: item.variantKey,
    offerObservationId: item.offerObservationIds[0] ?? null,
    evidenceObservationId: item.evidenceObservationIds[0] ?? null,
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
    shippingLabel: item.shippingLabel ?? '배송 정보 없음',
    rating: item.rating,
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
    components,
    reasons: item.reasonCodes,
    risks: item.riskCodes,
    contributingSources,
    interest: item.interest,
  };
}

function buildSourceStatuses(
  items: EntryRecommendation[],
  businessDate: string | null,
): EntrySourceStatus[] {
  const keys: EntrySourceKey[] = [
    'supply_1688_new',
    'keyword_trend',
    'coupang_competitor',
    'coupang_rising',
  ];
  const labels: Record<EntrySourceKey, string> = {
    supply_1688_new: '1688 신상품',
    keyword_trend: '키워드 트렌드',
    coupang_competitor: '쿠팡 경쟁상품',
    coupang_rising: '쿠팡 급상승',
  };
  const staleDays = businessDate ? ageInDays(businessDate) : null;

  return keys.map((key) => ({
    key,
    label: labels[key],
    rowCount: items.filter((item) => item.contributingSources.includes(key)).length,
    businessDate,
    staleDays,
  }));
}

function readInterestKeywords(
  items: SourcingRecommendationPresenterItem[],
): EntryInterestKeywordStatus[] {
  const byKeyword = new Map<string, EntryInterestKeywordStatus>();
  for (const item of items) {
    const interest = item.interest;
    if (!interest) continue;
    for (const match of interest.matches) {
      const existing = byKeyword.get(match.keyword);
      const exactCount = match.tier === 'exact' ? 1 : 0;
      const relatedCount = match.tier === 'related' ? 1 : 0;
      if (existing) {
        existing.exactCount += exactCount;
        existing.relatedCount += relatedCount;
        continue;
      }
      byKeyword.set(match.keyword, {
        keyword: match.keyword,
        origins: interest.origins,
        exactCount,
        relatedCount,
        state: 'candidates',
        demand: null,
      });
    }
  }
  return [...byKeyword.values()].sort((left, right) => left.keyword.localeCompare(right.keyword));
}

function toComponents(value: Record<string, number>): EntryRecommendationComponents {
  return {
    margin: finiteNumber(value.margin) ?? 0,
    demand: finiteNumber(value.demand) ?? 0,
    competition: finiteNumber(value.competition) ?? 0,
    momentum: finiteNumber(value.momentum) ?? 0,
    supplier: finiteNumber(value.supplier) ?? 0,
  };
}

function readContributingSources(value: unknown): EntrySourceKey[] {
  const allowed = new Set<EntrySourceKey>([
    'supply_1688_new',
    'keyword_trend',
    'coupang_competitor',
    'coupang_rising',
  ]);
  const sources = strings(value).filter((source): source is EntrySourceKey => allowed.has(source as EntrySourceKey));
  return sources.length > 0 ? sources : ['supply_1688_new'];
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.flatMap((item) => typeof item === 'string' && item.trim() ? [item.trim()] : [])
    : [];
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function toBusinessDate(value: string | null): string | null {
  if (!value) return null;
  const date = parseBusinessTimestamp(value);
  return date ? businessDateKey(date) : null;
}

function ageInDays(date: string): number {
  const then = parseBusinessDate(date);
  if (!then) return 0;
  const today = currentBusinessDate();
  return then > today ? 0 : datesInclusive(then, today).length - 1;
}

function normalizeLimit(value: number | undefined): number {
  if (value == null || !Number.isFinite(value)) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(MAX_LIMIT, Math.floor(value)));
}
