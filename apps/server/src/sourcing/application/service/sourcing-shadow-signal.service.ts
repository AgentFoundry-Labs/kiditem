import { Inject, Injectable, Optional } from '@nestjs/common';
import { kstBusinessDate } from '../../../common/kst';
import { matchStationeryToyTrend } from '../../domain/stationery-toy-trend';
import {
  LINKFOX_ECHOTIK_SHADOW_PORT,
  MARKET_SHADOW_SIGNAL_PORT,
  type FetchLinkfoxEchotikNewProductRankResult,
  type FetchMarketShadowSignalsResult,
  type LinkfoxEchotikRegion,
  type LinkfoxEchotikShadowPort,
  type MarketShadowSignalPort,
} from '../port/out/provider/market-shadow-signal.port';
import {
  MARKET_SHADOW_SNAPSHOT_REPOSITORY_PORT,
  type MarketShadowSnapshotRepositoryPort,
  type MarketShadowSnapshotRow,
} from '../port/out/repository/market-shadow-snapshot.repository.port';
import {
  TREND_COLLECTION_REPOSITORY_PORT,
  type NaverKeywordSnapshotRow,
  type NaverPopularKeywordSnapshotRow,
  type ShortsSnapshotRow,
  type Sourcing1688HotProductSnapshotRow,
  type TrendCollectionRepositoryPort,
} from '../port/out/repository/trend-collection.repository.port';
import {
  SHADOW_WINDOW_DAYS,
  buildSeedKeywords,
  emptyLinkfoxEvaluation,
  emptyPairedComparison,
  evaluateLinkfox,
  resolveLinkfoxPilot,
  type LinkfoxPilotState,
  type MarketShadowLinkfoxEvaluation,
  type MarketShadowLinkfoxStatus,
  type MarketShadowPairedComparison,
} from './sourcing-shadow-signal.evaluation';

export type {
  MarketShadowLinkfoxEvaluation,
  MarketShadowLinkfoxStatus,
  MarketShadowPairedComparison,
} from './sourcing-shadow-signal.evaluation';

const SHADOW_SOURCE = 'google-trends-rss';
const LINKFOX_SOURCE = 'linkfox-echotik-new-product-rank';
const GENERATOR_VERSION = 'market-shadow-signals.v1';
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export type MarketShadowCollectionStatus =
  | 'collecting'
  | 'complete'
  | 'partial'
  | 'failed';

export interface MarketShadowBaselineEvaluation {
  naverKeywordCount: number;
  naverPopularKeywordCount: number;
  hot1688Count: number;
  shortsCount: number;
  evidenceGroupCount: number;
  relevanceLabels: string[];
}

export interface MarketShadowGoogleEvaluation {
  signalCount: number;
  relevantSignalCount: number;
  relevanceRate: number;
  relevanceLabels: string[];
  overlapLabels: string[];
  novelLabels: string[];
}

type MarketShadowSourceResult =
  | FetchMarketShadowSignalsResult
  | FetchLinkfoxEchotikNewProductRankResult;

export interface MarketShadowSnapshotPayload extends Record<string, unknown> {
  version: 1;
  input: {
    experiment: 'paired-shadow-v1';
    sources: string[];
    seedKeywords: string[];
    windowDays: typeof SHADOW_WINDOW_DAYS;
  };
  result: {
    status: MarketShadowCollectionStatus;
    decisionImpact: 'disabled';
    sources: MarketShadowSourceResult[];
    evaluation: {
      baseline: MarketShadowBaselineEvaluation;
      googleTrends: MarketShadowGoogleEvaluation;
      linkfoxEchoTik: MarketShadowLinkfoxEvaluation;
      pairedComparison: MarketShadowPairedComparison;
      promotionGate: {
        minimumObservationDays: 30;
        observedDays: number;
        reviewReady: boolean;
        eligible: false;
      };
    };
    errors: Array<{ source: string; message: string }>;
  };
  meta: {
    generatedAt: string;
    generationSource: 'scheduled';
    generatorVersion: typeof GENERATOR_VERSION;
  };
}

export interface MarketShadowCollectionResult {
  claimed: boolean;
  snapshot: MarketShadowSnapshotRow;
}

@Injectable()
export class SourcingShadowSignalService {
  constructor(
    @Inject(MARKET_SHADOW_SIGNAL_PORT)
    private readonly googleTrends: MarketShadowSignalPort,
    @Inject(MARKET_SHADOW_SNAPSHOT_REPOSITORY_PORT)
    private readonly snapshots: MarketShadowSnapshotRepositoryPort,
    @Inject(TREND_COLLECTION_REPOSITORY_PORT)
    private readonly trends: TrendCollectionRepositoryPort,
    @Optional()
    @Inject(LINKFOX_ECHOTIK_SHADOW_PORT)
    private readonly linkfox?: LinkfoxEchotikShadowPort,
  ) {}

  async collect(
    organizationId: string,
    now = new Date(),
  ): Promise<MarketShadowCollectionResult> {
    const businessDate = kstBusinessDate(now);
    const seeds = await this.trends.listSeeds(organizationId);
    const seedKeywords = buildSeedKeywords(seeds);
    const linkfoxPilot = resolveLinkfoxPilot(organizationId);
    const collectingPayload = buildCollectingPayload(
      seedKeywords,
      now,
      linkfoxPilot,
    );
    const claim = await this.snapshots.claimDaily({
      organizationId,
      businessDate,
      payload: collectingPayload,
    });
    if (!claim.claimed) return { claimed: false, snapshot: claim.row };

    const linkfoxRequest = linkfoxPilot.status === 'armed' && this.linkfox
      ? this.linkfox.fetchNewProductRank({
          date: businessDate.toISOString().slice(0, 10),
          region: linkfoxPilot.region,
          pageSize: 50,
        })
      : Promise.resolve(null);
    const [googleResult, baselineResult, observationResult, linkfoxResult] =
      await Promise.allSettled([
      this.googleTrends.fetchTrending({ seedKeywords, limit: 100 }),
      this.loadBaseline(organizationId),
      this.loadObservationDays(organizationId, businessDate),
      linkfoxRequest,
    ]);
    const errors: Array<{ source: string; message: string }> = [];
    const sources: MarketShadowSourceResult[] = [];

    if (googleResult.status === 'fulfilled') {
      sources.push(googleResult.value);
    } else {
      errors.push({
        source: SHADOW_SOURCE,
        message: safeErrorMessage(googleResult.reason),
      });
    }

    const baseline = baselineResult.status === 'fulfilled'
      ? baselineResult.value
      : emptyBaseline();
    if (baselineResult.status === 'rejected') {
      errors.push({
        source: 'kiditem-persisted-baseline',
        message: safeErrorMessage(baselineResult.reason),
      });
    }

    const observedDays = observationResult.status === 'fulfilled'
      ? observationResult.value
      : 1;
    if (observationResult.status === 'rejected') {
      errors.push({
        source: 'market-shadow-snapshot-history',
        message: safeErrorMessage(observationResult.reason),
      });
    }

    let linkfoxStatus = linkfoxPilot.status === 'armed'
      ? 'configuration_error' as MarketShadowLinkfoxStatus
      : linkfoxPilot.status;
    if (linkfoxPilot.status === 'configuration_error') {
      errors.push({ source: LINKFOX_SOURCE, message: linkfoxPilot.reason });
    } else if (linkfoxPilot.status === 'armed' && !this.linkfox) {
      errors.push({
        source: LINKFOX_SOURCE,
        message: 'LinkFox EchoTik provider is not configured.',
      });
    } else if (linkfoxPilot.status === 'armed') {
      if (linkfoxResult.status === 'fulfilled' && linkfoxResult.value) {
        sources.push(linkfoxResult.value);
        linkfoxStatus = 'complete';
      } else {
        linkfoxStatus = 'failed';
        errors.push({
          source: LINKFOX_SOURCE,
          message: safeErrorMessage(
            linkfoxResult.status === 'rejected'
              ? linkfoxResult.reason
              : 'LinkFox EchoTik returned no result.',
          ),
        });
      }
    }

    const status = collectionStatus({
      googleSucceeded: googleResult.status === 'fulfilled',
      baselineSucceeded: baselineResult.status === 'fulfilled',
      observationSucceeded: observationResult.status === 'fulfilled',
      linkfoxRequired: linkfoxPilot.status === 'armed'
        || linkfoxPilot.status === 'configuration_error',
      linkfoxSucceeded: linkfoxStatus === 'complete',
    });
    const payload = buildFinalPayload({
      collectingPayload,
      status,
      sources,
      baseline,
      seedKeywords,
      linkfoxStatus,
      linkfoxRegion: linkfoxPilot.region,
      observedDays,
      now,
      errors,
    });
    const snapshot = await this.snapshots.finalizeDaily({
      organizationId,
      businessDate,
      payload,
    });
    return { claimed: true, snapshot };
  }

  async listRecent(
    organizationId: string,
    days = SHADOW_WINDOW_DAYS,
    now = new Date(),
  ): Promise<MarketShadowSnapshotRow[]> {
    const normalizedDays = Math.max(1, Math.min(30, Math.floor(days)));
    const toBusinessDate = kstBusinessDate(now);
    const fromBusinessDate = new Date(
      toBusinessDate.getTime() - (normalizedDays - 1) * ONE_DAY_MS,
    );
    return this.snapshots.listRecent({
      organizationId,
      fromBusinessDate,
      toBusinessDate,
      limit: normalizedDays,
    });
  }

  private async loadBaseline(
    organizationId: string,
  ): Promise<MarketShadowBaselineEvaluation> {
    const query = { organizationId, days: SHADOW_WINDOW_DAYS };
    const [naverKeywords, popularKeywords, hot1688, shorts] = await Promise.all([
      this.trends.findNaverKeywordHistory(query),
      this.trends.findPopularKeywordHistory(query),
      this.trends.find1688HotHistory(query),
      this.trends.findShortsHistory(query),
    ]);
    return evaluateBaseline({ naverKeywords, popularKeywords, hot1688, shorts });
  }

  private async loadObservationDays(
    organizationId: string,
    businessDate: Date,
  ): Promise<number> {
    const rows = await this.snapshots.listRecent({
      organizationId,
      fromBusinessDate: new Date(
        businessDate.getTime() - (SHADOW_WINDOW_DAYS - 1) * ONE_DAY_MS,
      ),
      toBusinessDate: businessDate,
      limit: SHADOW_WINDOW_DAYS,
    });
    return Math.max(
      1,
      new Set(rows.map((row) => row.businessDate.toISOString().slice(0, 10))).size,
    );
  }
}

function buildCollectingPayload(
  seedKeywords: string[],
  now: Date,
  linkfoxPilot: LinkfoxPilotState,
): MarketShadowSnapshotPayload {
  const sources = [SHADOW_SOURCE];
  if (
    linkfoxPilot.status === 'armed'
    || linkfoxPilot.status === 'configuration_error'
  ) {
    sources.push(LINKFOX_SOURCE);
  }
  return {
    version: 1,
    input: {
      experiment: 'paired-shadow-v1',
      sources,
      seedKeywords,
      windowDays: SHADOW_WINDOW_DAYS,
    },
    result: {
      status: 'collecting',
      decisionImpact: 'disabled',
      sources: [],
      evaluation: {
        baseline: emptyBaseline(),
        googleTrends: emptyGoogleEvaluation(),
        linkfoxEchoTik: emptyLinkfoxEvaluation(
          linkfoxPilot.status === 'armed'
            ? 'configuration_error'
            : linkfoxPilot.status,
          linkfoxPilot.region,
        ),
        pairedComparison: emptyPairedComparison(),
        promotionGate: {
          minimumObservationDays: 30,
          observedDays: 0,
          reviewReady: false,
          eligible: false,
        },
      },
      errors: [],
    },
    meta: {
      generatedAt: now.toISOString(),
      generationSource: 'scheduled',
      generatorVersion: GENERATOR_VERSION,
    },
  };
}

function buildFinalPayload(input: {
  collectingPayload: MarketShadowSnapshotPayload;
  status: MarketShadowCollectionStatus;
  sources: MarketShadowSourceResult[];
  baseline: MarketShadowBaselineEvaluation;
  seedKeywords: string[];
  linkfoxStatus: MarketShadowLinkfoxStatus;
  linkfoxRegion: LinkfoxEchotikRegion | null;
  observedDays: number;
  now: Date;
  errors: Array<{ source: string; message: string }>;
}): MarketShadowSnapshotPayload {
  const google = input.sources.find(
    (source): source is FetchMarketShadowSignalsResult => (
      source.source === SHADOW_SOURCE
    ),
  );
  const linkfox = input.sources.find(
    (source): source is FetchLinkfoxEchotikNewProductRankResult => (
      source.source === LINKFOX_SOURCE
    ),
  );
  const linkfoxEvaluation = evaluateLinkfox({
    result: linkfox,
    status: input.linkfoxStatus,
    region: input.linkfoxRegion,
    seedKeywords: input.seedKeywords,
    baselineLabels: input.baseline.relevanceLabels,
    baselineEvidenceGroupCount: input.baseline.evidenceGroupCount,
    now: input.now,
  });
  return {
    ...input.collectingPayload,
    result: {
      status: input.status,
      decisionImpact: 'disabled',
      sources: input.sources,
      evaluation: {
        baseline: input.baseline,
        googleTrends: evaluateGoogle(google, input.baseline.relevanceLabels),
        linkfoxEchoTik: linkfoxEvaluation.summary,
        pairedComparison: linkfoxEvaluation.comparison,
        promotionGate: {
          minimumObservationDays: 30,
          observedDays: input.observedDays,
          reviewReady: input.observedDays >= 30,
          eligible: false,
        },
      },
      errors: input.errors,
    },
  };
}

function evaluateBaseline(input: {
  naverKeywords: NaverKeywordSnapshotRow[];
  popularKeywords: NaverPopularKeywordSnapshotRow[];
  hot1688: Sourcing1688HotProductSnapshotRow[];
  shorts: ShortsSnapshotRow[];
}): MarketShadowBaselineEvaluation {
  const relevanceLabels = uniqueStrings([
    ...input.naverKeywords.map((row) => matchStationeryToyTrend([row.keyword])),
    ...input.popularKeywords.map((row) => (
      matchStationeryToyTrend([row.keyword, row.boardLabel])
    )),
    ...input.hot1688.map((row) => (
      matchStationeryToyTrend([row.sourceKeyword, row.title])
    )),
    ...input.shorts.map((row) => (
      matchStationeryToyTrend([row.keyword, row.title, row.channelName])
    )),
  ]);
  const counts = [
    input.naverKeywords.length,
    input.popularKeywords.length,
    input.hot1688.length,
    input.shorts.length,
  ];
  return {
    naverKeywordCount: counts[0],
    naverPopularKeywordCount: counts[1],
    hot1688Count: counts[2],
    shortsCount: counts[3],
    evidenceGroupCount: counts.filter((count) => count > 0).length,
    relevanceLabels,
  };
}

function evaluateGoogle(
  result: FetchMarketShadowSignalsResult | undefined,
  baselineLabels: string[],
): MarketShadowGoogleEvaluation {
  if (!result) return emptyGoogleEvaluation();
  const relevanceLabels = uniqueStrings(
    result.items.map((item) => item.relevanceLabel),
  );
  const baseline = new Set(baselineLabels);
  return {
    signalCount: result.items.length,
    relevantSignalCount: result.items.filter((item) => item.relevanceLabel).length,
    relevanceRate: roundRate(
      result.items.filter((item) => item.relevanceLabel).length,
      result.items.length,
    ),
    relevanceLabels,
    overlapLabels: relevanceLabels.filter((label) => baseline.has(label)),
    novelLabels: relevanceLabels.filter((label) => !baseline.has(label)),
  };
}

function emptyBaseline(): MarketShadowBaselineEvaluation {
  return {
    naverKeywordCount: 0,
    naverPopularKeywordCount: 0,
    hot1688Count: 0,
    shortsCount: 0,
    evidenceGroupCount: 0,
    relevanceLabels: [],
  };
}

function emptyGoogleEvaluation(): MarketShadowGoogleEvaluation {
  return {
    signalCount: 0,
    relevantSignalCount: 0,
    relevanceRate: 0,
    relevanceLabels: [],
    overlapLabels: [],
    novelLabels: [],
  };
}

function collectionStatus(input: {
  googleSucceeded: boolean;
  baselineSucceeded: boolean;
  observationSucceeded: boolean;
  linkfoxRequired: boolean;
  linkfoxSucceeded: boolean;
}): MarketShadowCollectionStatus {
  const outcomes = [
    input.googleSucceeded,
    input.baselineSucceeded,
    input.observationSucceeded,
    ...(input.linkfoxRequired ? [input.linkfoxSucceeded] : []),
  ];
  if (outcomes.every(Boolean)) return 'complete';
  if (outcomes.some(Boolean)) return 'partial';
  return 'failed';
}

function roundRate(numerator: number, denominator: number): number {
  if (denominator === 0) return 0;
  return Math.round((numerator / denominator) * 1000) / 1000;
}

function uniqueStrings(
  values: ReadonlyArray<string | null | undefined>,
): string[] {
  return Array.from(new Set(values
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value))));
}

function safeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : '알 수 없는 수집 오류';
  return message
    .replace(/(api[_-]?key|authorization|token)\s*[:=]\s*[^\s,;]+/gi, '$1=[REDACTED]')
    .slice(0, 300);
}
