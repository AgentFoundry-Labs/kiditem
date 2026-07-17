import {
  DEFAULT_STATIONERY_TOY_TREND_SEEDS,
  matchStationeryToyTrend,
} from '../../domain/stationery-toy-trend';
import {
  LINKFOX_ECHOTIK_SUPPORTED_REGIONS,
  type FetchLinkfoxEchotikNewProductRankResult,
  type LinkfoxEchotikRegion,
} from '../port/out/provider/market-shadow-signal.port';
import type { TrendSeedRow } from '../port/out/repository/trend-collection.repository.port';

export const SHADOW_WINDOW_DAYS = 30;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export type MarketShadowLinkfoxStatus =
  | 'disabled'
  | 'not_in_pilot'
  | 'configuration_error'
  | 'complete'
  | 'failed';

export interface MarketShadowLinkfoxEvaluation {
  status: MarketShadowLinkfoxStatus;
  region: LinkfoxEchotikRegion | null;
  productCount: number;
  relevantProductCount: number;
  freshProductCount: number;
  evidenceCompleteness: number;
  costPoints: number | null;
  relevanceLabels: string[];
}

export interface MarketShadowPairedComparison {
  controlEvidenceGroupCount: number;
  treatmentProductCount: number;
  overlapCount: number;
  novelRelevantCount: number;
  freshCount: number;
  evidenceCompleteness: number;
  costPoints: number | null;
}

interface LinkfoxPilotBase {
  region: LinkfoxEchotikRegion | null;
}

export type LinkfoxPilotState =
  | (LinkfoxPilotBase & { status: 'disabled' | 'not_in_pilot' })
  | (LinkfoxPilotBase & { status: 'configuration_error'; reason: string })
  | { status: 'armed'; region: LinkfoxEchotikRegion };

export function buildSeedKeywords(seeds: TrendSeedRow[]): string[] {
  return uniqueStrings([
    ...DEFAULT_STATIONERY_TOY_TREND_SEEDS.flatMap((seed) => [
      seed.keyword,
      seed.keywordCn,
    ]),
    ...seeds
      .filter((seed) => seed.enabled)
      .flatMap((seed) => [seed.keyword, seed.keywordCn]),
  ]);
}

export function resolveLinkfoxPilot(
  organizationId: string,
): LinkfoxPilotState {
  if (process.env.SOURCING_LINKFOX_SHADOW_ENABLED !== '1') {
    return { status: 'disabled', region: null };
  }
  const pilotOrganizationIds = new Set(
    (process.env.SOURCING_LINKFOX_PILOT_ORGANIZATION_IDS ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  );
  if (!pilotOrganizationIds.has(organizationId)) {
    return { status: 'not_in_pilot', region: null };
  }

  const rawRegion = (process.env.SOURCING_LINKFOX_ECHOTIK_REGION ?? '')
    .trim()
    .toUpperCase();
  if (
    !LINKFOX_ECHOTIK_SUPPORTED_REGIONS.includes(
      rawRegion as LinkfoxEchotikRegion,
    )
  ) {
    return {
      status: 'configuration_error',
      region: null,
      reason: rawRegion
        ? `Unsupported LinkFox EchoTik region: ${rawRegion}.`
        : 'SOURCING_LINKFOX_ECHOTIK_REGION is required for the pilot.',
    };
  }
  return { status: 'armed', region: rawRegion as LinkfoxEchotikRegion };
}

export function evaluateLinkfox(input: {
  result: FetchLinkfoxEchotikNewProductRankResult | undefined;
  status: MarketShadowLinkfoxStatus;
  region: LinkfoxEchotikRegion | null;
  seedKeywords: string[];
  baselineLabels: string[];
  baselineEvidenceGroupCount: number;
  now: Date;
}): {
  summary: MarketShadowLinkfoxEvaluation;
  comparison: MarketShadowPairedComparison;
} {
  if (!input.result) {
    return {
      summary: emptyLinkfoxEvaluation(input.status, input.region),
      comparison: {
        ...emptyPairedComparison(),
        controlEvidenceGroupCount: input.baselineEvidenceGroupCount,
      },
    };
  }

  const baseline = new Set(input.baselineLabels);
  const products = input.result.products.map((product) => ({
    product,
    relevanceLabel: matchStationeryToyTrend(
      [product.title, product.salesTrendFlagText],
      input.seedKeywords,
    ),
  }));
  const relevant = products.filter((entry) => entry.relevanceLabel);
  const relevanceLabels = uniqueStrings(
    relevant.map((entry) => entry.relevanceLabel),
  );
  const freshProductCount = products.filter(({ product }) =>
    isFreshDate(product.availableDate, input.now, SHADOW_WINDOW_DAYS),
  ).length;
  const evidenceCompleteness = linkfoxEvidenceCompleteness(
    products.map((entry) => entry.product),
  );
  const overlapCount = relevant.filter(
    ({ relevanceLabel }) => relevanceLabel != null && baseline.has(relevanceLabel),
  ).length;
  const novelRelevantCount = relevant.length - overlapCount;

  return {
    summary: {
      status: input.status,
      region: input.result.region,
      productCount: products.length,
      relevantProductCount: relevant.length,
      freshProductCount,
      evidenceCompleteness,
      costPoints: input.result.costToken,
      relevanceLabels,
    },
    comparison: {
      controlEvidenceGroupCount: input.baselineEvidenceGroupCount,
      treatmentProductCount: products.length,
      overlapCount,
      novelRelevantCount,
      freshCount: freshProductCount,
      evidenceCompleteness,
      costPoints: input.result.costToken,
    },
  };
}

export function emptyLinkfoxEvaluation(
  status: MarketShadowLinkfoxStatus,
  region: LinkfoxEchotikRegion | null,
): MarketShadowLinkfoxEvaluation {
  return {
    status,
    region,
    productCount: 0,
    relevantProductCount: 0,
    freshProductCount: 0,
    evidenceCompleteness: 0,
    costPoints: null,
    relevanceLabels: [],
  };
}

export function emptyPairedComparison(): MarketShadowPairedComparison {
  return {
    controlEvidenceGroupCount: 0,
    treatmentProductCount: 0,
    overlapCount: 0,
    novelRelevantCount: 0,
    freshCount: 0,
    evidenceCompleteness: 0,
    costPoints: null,
  };
}

function isFreshDate(value: string | null, now: Date, days: number): boolean {
  if (!value) return false;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return false;
  return (
    timestamp <= now.getTime() && timestamp >= now.getTime() - days * ONE_DAY_MS
  );
}

function linkfoxEvidenceCompleteness(
  products: FetchLinkfoxEchotikNewProductRankResult['products'],
): number {
  if (products.length === 0) return 0;
  const fieldCount = products.reduce(
    (count, product) =>
      count +
      [
        product.title,
        product.price ?? product.minPrice ?? product.maxPrice,
        product.currency,
        product.totalSale30dCnt,
        product.availableDate,
        product.categoryId,
        product.imageUrls.length > 0 ? product.imageUrls[0] : null,
      ].filter((value) => value !== null && value !== '').length,
    0,
  );
  return roundRate(fieldCount, products.length * 7);
}

function roundRate(numerator: number, denominator: number): number {
  if (denominator === 0) return 0;
  return Math.round((numerator / denominator) * 1000) / 1000;
}

function uniqueStrings(
  values: ReadonlyArray<string | null | undefined>,
): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value)),
    ),
  );
}
