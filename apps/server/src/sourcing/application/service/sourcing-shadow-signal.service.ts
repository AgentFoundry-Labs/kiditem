import { createHash } from 'node:crypto';
import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { canonicalJson } from '../../domain/sourcing-stable-json';
import {
  SOURCING_BROWSER_SOURCE_ATTEMPT_REPOSITORY_PORT,
  type SourcingBrowserSourceAttemptRepositoryPort,
  type SourcingBrowserSourceAttempt,
} from '../port/out/repository/sourcing-browser-source-attempt.repository.port';
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
  MARKET_SHADOW_SNAPSHOT_SCOPE,
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

export type MarketShadowCollectionStatus = 'collecting' | 'complete' | 'partial' | 'failed';

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
  FetchMarketShadowSignalsResult | FetchLinkfoxEchotikNewProductRankResult;

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
  attemptId: string;
  state: 'RUNNING' | 'COMPLETE' | 'FAILED';
  expiresAt: Date;
  errorCode: string | null;
  errorMessage: string | null;
  snapshot: MarketShadowSnapshotRow | null;
}
export interface MarketShadowSourceStatus {
  ready: boolean;
  latestAttempt: Omit<MarketShadowCollectionResult, 'snapshot'> | null;
  latestComplete: MarketShadowSnapshotRow | null;
  actualCutoffAt: Date | null;
}
export interface MarketShadowCollectionControls {
  signal?: AbortSignal;
}
const SHADOW_ALERT = {
  sourceType: MARKET_SHADOW_SNAPSHOT_SCOPE,
  dedupeKey: 'source:market-shadow-signals',
  title: '시장 Shadow 수집 실패',
  href: '/sourcing-ai/market',
};
const SHADOW_REQUEST_FINGERPRINT = shadowHash({ source: MARKET_SHADOW_SNAPSHOT_SCOPE });

@Injectable()
export class SourcingShadowSignalService {
  constructor(
    @Inject(MARKET_SHADOW_SIGNAL_PORT)
    private readonly googleTrends: MarketShadowSignalPort,
    @Inject(MARKET_SHADOW_SNAPSHOT_REPOSITORY_PORT)
    private readonly snapshots: MarketShadowSnapshotRepositoryPort,
    @Inject(TREND_COLLECTION_REPOSITORY_PORT)
    private readonly trends: TrendCollectionRepositoryPort,
    @Inject(SOURCING_BROWSER_SOURCE_ATTEMPT_REPOSITORY_PORT)
    private readonly attempts: SourcingBrowserSourceAttemptRepositoryPort,
    @Optional()
    @Inject(LINKFOX_ECHOTIK_SHADOW_PORT)
    private readonly linkfox?: LinkfoxEchotikShadowPort,
  ) {}

  async collect(
    input: { organizationId: string; requestedByUserId?: string | null; idempotencyKey: string },
    now = new Date(),
    controls: MarketShadowCollectionControls = {},
  ): Promise<MarketShadowCollectionResult> {
    const { organizationId, idempotencyKey } = input;
    if (!idempotencyKey?.trim() || idempotencyKey.length > 128)
      throw new BadRequestException('A bounded Idempotency-Key is required');
    const replayId = await this.snapshots.findAttemptIdByKey(organizationId, idempotencyKey);
    if (replayId) return this.readAttempt(organizationId, replayId);
    controls.signal?.throwIfAborted();
    const businessDate = kstBusinessDate(now);
    const seedKeywords = buildSeedKeywords(await this.trends.listSeeds(organizationId));
    const linkfoxPilot = resolveLinkfoxPilot(organizationId);
    controls.signal?.throwIfAborted();
    const plan = {
      source: MARKET_SHADOW_SNAPSHOT_SCOPE,
      businessDate: businessDate.toISOString().slice(0, 10),
      generatedAt: now.toISOString(),
      generatorVersion: GENERATOR_VERSION,
      experiment: 'paired-shadow-v1',
      seedKeywords,
      windowDays: SHADOW_WINDOW_DAYS,
      googleLimit: 100,
      linkfoxPilot,
      linkfoxPageSize: 50,
    };
    const admitted = await this.attempts.beginAttempt({
      organizationId,
      sourceKey: MARKET_SHADOW_SNAPSHOT_SCOPE,
      scopeKey: 'day',
      targetKey: plan.businessDate,
      idempotencyKey,
      requestFingerprint: SHADOW_REQUEST_FINGERPRINT,
      plan,
      planChecksum: shadowHash(plan),
      requestedByUserId: input.requestedByUserId ?? null,
      collectorKey: MARKET_SHADOW_SNAPSHOT_SCOPE,
      collectorVersion: GENERATOR_VERSION,
      expiresInMs: 15 * 60_000,
      triggerKind: 'manual',
      failureAlert: SHADOW_ALERT,
    });
    if (!admitted.created) return this.readAttempt(organizationId, admitted.attempt.attemptId);
    const attempt = admitted.attempt;
    let payload: MarketShadowSnapshotPayload | undefined;
    let failure: { code: string; message: string } | undefined;
    try {
      controls.signal?.throwIfAborted();
      payload = await this.collectPayload(
        organizationId,
        businessDate,
        seedKeywords,
        linkfoxPilot,
        now,
        controls,
      );
      controls.signal?.throwIfAborted();
    } catch (error) {
      failure = {
        code: controls.signal?.aborted ? 'SHADOW_COLLECTION_CANCELLED' : 'SHADOW_COLLECTION_FAILED',
        message: safeErrorMessage(error),
      };
    }
    if (payload && payload.result.status !== 'complete')
      failure = {
        code: 'SHADOW_COLLECTION_FAILED',
        message:
          payload.result.errors
            .map((error) => error.source + ': ' + error.message)
            .join('; ')
            .slice(0, 300) || 'Required shadow source failed.',
      };
    try {
      if (failure) {
        await this.attempts.failAttempt({
          organizationId,
          attemptId: attempt.attemptId,
          attemptToken: attempt.attemptToken,
          ...failure,
        });
      } else if (payload) {
        const payloadHash = shadowHash(payload);
        await this.attempts.completeAttempt({
          organizationId,
          attemptId: attempt.attemptId,
          attemptToken: attempt.attemptToken,
          planChecksum: attempt.planChecksum,
          contentChecksum: payloadHash,
          sourceWindowStartAt: businessDate,
          sourceWindowEndAt: now,
          output: {
            discoveredCount: 1,
            rejectedCount: 0,
            typedRecords: [],
            qualityReport: { completeSnapshot: true },
            observations: [
              {
                organizationId,
                ingestionRunId: attempt.attemptId,
                sourceKey: MARKET_SHADOW_SNAPSHOT_SCOPE,
                platform: 'market_shadow',
                evidenceFamily: 'market_shadow_snapshot',
                signalRole: 'demand',
                granularity: 'inferred_observation',
                conceptKey: null,
                supportsCandidate: false,
                sourceEntityType: 'market_shadow_snapshot',
                sourceEntityId: plan.businessDate,
                schemaVersion: GENERATOR_VERSION,
                observationKey: shadowHash({
                  attemptId: attempt.attemptId,
                  day: plan.businessDate,
                }),
                revision: 1,
                sourceUrl: null,
                eventAt: now,
                observedAt: now,
                availableAt: now,
                revisionAt: null,
                payloadHash,
                rawPayload: payload,
                ingestedAt: now,
              },
            ],
          },
        });
      }
    } catch (error) {
      const receipt = await this.readAttempt(organizationId, attempt.attemptId);
      if (receipt.state !== 'RUNNING') return receipt;
      throw error;
    }
    return this.readAttempt(organizationId, attempt.attemptId);
  }

  async readAttempt(
    organizationId: string,
    attemptId: string,
  ): Promise<MarketShadowCollectionResult> {
    const attempt = await this.attempts.readAttempt({ organizationId, attemptId });
    if (
      !attempt ||
      attempt.sourceKey !== MARKET_SHADOW_SNAPSHOT_SCOPE ||
      attempt.scopeKey !== 'day'
    )
      throw new NotFoundException('SHADOW_ATTEMPT_NOT_FOUND');
    return {
      ...this.safeReceipt(attempt),
      snapshot:
        attempt.state === 'COMPLETE'
          ? await this.snapshots.findByAttempt(organizationId, attempt.attemptId)
          : null,
    };
  }

  private safeReceipt(
    attempt: SourcingBrowserSourceAttempt,
  ): Omit<MarketShadowCollectionResult, 'snapshot'> {
    return {
      attemptId: attempt.attemptId,
      state: attempt.state,
      expiresAt: attempt.expiresAt,
      errorCode: attempt.errorCode,
      errorMessage: attempt.errorMessage,
    };
  }

  async getStatus(organizationId: string, now = new Date()): Promise<MarketShadowSourceStatus> {
    const latest = await this.snapshots.readLatest(organizationId);
    const latestAttempt = latest.latestAttempt ? this.safeReceipt(latest.latestAttempt) : null;
    const latestComplete = latest.latestComplete;
    return {
      ready: !!latestComplete
        && latestComplete.businessDate.getTime() === kstBusinessDate(now).getTime(),
      latestAttempt,
      latestComplete,
      actualCutoffAt: latest.actualCutoffAt,
    };
  }

  private async collectPayload(
    organizationId: string,
    businessDate: Date,
    seedKeywords: string[],
    linkfoxPilot: LinkfoxPilotState,
    now: Date,
    controls: MarketShadowCollectionControls,
  ): Promise<MarketShadowSnapshotPayload> {
    const collectingPayload = buildCollectingPayload(seedKeywords, now, linkfoxPilot);
    const linkfoxRequest =
      linkfoxPilot.status === 'armed' && this.linkfox
        ? this.linkfox.fetchNewProductRank({
            date: businessDate.toISOString().slice(0, 10),
            region: linkfoxPilot.region,
            pageSize: 50,
            ...(controls.signal ? { signal: controls.signal } : {}),
          })
        : Promise.resolve(null);
    const [googleResult, baselineResult, observationResult, linkfoxResult] =
      await Promise.allSettled([
        this.googleTrends.fetchTrending({
          seedKeywords,
          limit: 100,
          ...(controls.signal ? { signal: controls.signal } : {}),
        }),
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

    const baseline = baselineResult.status === 'fulfilled' ? baselineResult.value : emptyBaseline();
    if (baselineResult.status === 'rejected') {
      errors.push({
        source: 'kiditem-persisted-baseline',
        message: safeErrorMessage(baselineResult.reason),
      });
    }

    const observedDays = observationResult.status === 'fulfilled' ? observationResult.value : 1;
    if (observationResult.status === 'rejected') {
      errors.push({
        source: 'market-shadow-snapshot-history',
        message: safeErrorMessage(observationResult.reason),
      });
    }

    let linkfoxStatus =
      linkfoxPilot.status === 'armed'
        ? ('configuration_error' as MarketShadowLinkfoxStatus)
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
      linkfoxRequired:
        linkfoxPilot.status === 'armed' || linkfoxPilot.status === 'configuration_error',
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

    return payload;
  }

  async listRecent(
    organizationId: string,
    days = SHADOW_WINDOW_DAYS,
    now = new Date(),
  ): Promise<MarketShadowSnapshotRow[]> {
    const normalizedDays = Math.max(1, Math.min(30, Math.floor(days)));
    const toBusinessDate = kstBusinessDate(now);
    const fromBusinessDate = new Date(toBusinessDate.getTime() - (normalizedDays - 1) * ONE_DAY_MS);
    return this.snapshots.listRecent({
      organizationId,
      fromBusinessDate,
      toBusinessDate,
      limit: normalizedDays,
    });
  }

  private async loadBaseline(organizationId: string): Promise<MarketShadowBaselineEvaluation> {
    const query = { organizationId, days: SHADOW_WINDOW_DAYS };
    const [naverKeywords, popularKeywords, hot1688, shorts] = await Promise.all([
      this.trends.findNaverKeywordHistory(query),
      this.trends.findPopularKeywordHistory(query).then((history) => history.rows),
      this.trends.find1688HotHistory(query),
      this.trends.findShortsHistory(query),
    ]);
    return evaluateBaseline({ naverKeywords, popularKeywords, hot1688, shorts });
  }

  private async loadObservationDays(organizationId: string, businessDate: Date): Promise<number> {
    const rows = await this.snapshots.listRecent({
      organizationId,
      fromBusinessDate: new Date(businessDate.getTime() - (SHADOW_WINDOW_DAYS - 1) * ONE_DAY_MS),
      toBusinessDate: businessDate,
      limit: SHADOW_WINDOW_DAYS,
    });
    return Math.max(
      1,
      new Set(rows.map((row) => row.businessDate.toISOString().slice(0, 10))).size,
    );
  }
}

function shadowHash(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

function buildCollectingPayload(
  seedKeywords: string[],
  now: Date,
  linkfoxPilot: LinkfoxPilotState,
): MarketShadowSnapshotPayload {
  const sources = [SHADOW_SOURCE];
  if (linkfoxPilot.status === 'armed' || linkfoxPilot.status === 'configuration_error') {
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
          linkfoxPilot.status === 'armed' ? 'configuration_error' : linkfoxPilot.status,
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
    (source): source is FetchMarketShadowSignalsResult => source.source === SHADOW_SOURCE,
  );
  const linkfox = input.sources.find(
    (source): source is FetchLinkfoxEchotikNewProductRankResult => source.source === LINKFOX_SOURCE,
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
    ...input.popularKeywords.map((row) => matchStationeryToyTrend([row.keyword, row.boardLabel])),
    ...input.hot1688.map((row) => matchStationeryToyTrend([row.sourceKeyword, row.title])),
    ...input.shorts.map((row) =>
      matchStationeryToyTrend([row.keyword, row.title, row.channelName]),
    ),
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
  const relevanceLabels = uniqueStrings(result.items.map((item) => item.relevanceLabel));
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

function uniqueStrings(values: ReadonlyArray<string | null | undefined>): string[] {
  return Array.from(
    new Set(
      values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)),
    ),
  );
}

function safeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : '알 수 없는 수집 오류';
  return message
    .replace(/(api[_-]?key|authorization|token)\s*[:=]\s*[^\s,;]+/gi, '$1=[REDACTED]')
    .slice(0, 300);
}
