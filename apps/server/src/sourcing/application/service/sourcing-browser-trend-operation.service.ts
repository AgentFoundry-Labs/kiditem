import { BadRequestException, ConflictException, Inject, Injectable } from '@nestjs/common';
import { kstBusinessDate } from '../../../common/kst';
import {
  OPERATION_ATTEMPT_VERIFIER_PORT,
  type OperationAttemptVerifierPort,
} from '../../../operations/application/port/in/operation-attempt-verifier.port';
import {
  SOURCING_RECOMMENDATION_REPOSITORY_PORT,
  type SourcingRecommendationRepositoryPort,
} from '../port/out/repository/sourcing-recommendation.repository.port';
import {
  SOURCING_COLLECTION_REPOSITORY_PORT,
  type ClaimAuthorizedRunResult,
  type SourcingCollectionRepositoryPort,
} from '../port/out/repository/sourcing-collection.repository.port';
import type {
  Sourcing1688OfferKeywordObservationInput,
  TiktokCcSnapshotUpsert,
} from '../port/out/repository/trend-collection.repository.port';
import {
  Sourcing1688TrendInputSchema,
  SourcingTiktokCcTrendInputSchema,
} from '../../domain/operation/sourcing.operations';
import {
  hashCollectionRequest,
  map1688HotProductsToAuthorizedOutput,
  mapTrendTypedRecordsToAuthorizedOutput,
  normalizeCollectionTarget,
} from './sourcing-collection-mappers';
import { SourcingRecommendationService } from './sourcing-recommendation.service';

const TREND_1688_OPERATION_KEY = 'sourcing.collect_1688_trends';
const TIKTOK_CC_OPERATION_KEY = 'sourcing.collect_tiktok_cc_trends';
const BROWSER_TREND_COLLECTOR_VERSION = 'sourcing-browser-trend/v1';
const TIKTOK_TYPES = new Set(['hashtag', 'keyword', 'product', 'song']);

export interface Browser1688TrendBatch {
  keywords: Array<{
    keyword: string;
    items: Array<{
      offerId: string;
      title?: string;
      priceCny?: number;
      monthlySales?: number;
      repurchaseRate?: string;
      tradeScore?: number;
      supplierName?: string;
      imageUrl?: string;
      sourceUrl?: string;
      rank?: number;
    }>;
  }>;
  errors?: Array<{ keyword: string; message: string }>;
}

export interface BrowserTiktokCcTrendBatch {
  region: string;
  items: Array<{
    trendType: string;
    entityKey: string;
    label?: string;
    industry?: string;
    sourceKeyword?: string;
    rank?: number;
    postCount?: number;
    viewCount?: number;
    growthPct?: number;
    thumbnailUrl?: string;
    sourceUrl?: string;
  }>;
  errors?: Array<{ target: string; message: string }>;
}

export interface BrowserTrendIngestResult {
  businessDate: string;
  collected: number;
  errorCount: number;
  duplicate: boolean;
}

/**
 * Browser trend payloads never write directly from an HTTP route. The owner
 * locks the exact Operation attempt first, verifies its bounded input, and
 * commits canonical snapshots in that same fenced transaction.
 */
@Injectable()
export class SourcingBrowserTrendOperationService {
  constructor(
    @Inject(OPERATION_ATTEMPT_VERIFIER_PORT)
    private readonly attemptVerifier: OperationAttemptVerifierPort,
    @Inject(SOURCING_COLLECTION_REPOSITORY_PORT)
    private readonly collections: SourcingCollectionRepositoryPort,
    private readonly recommendations: SourcingRecommendationService,
    @Inject(SOURCING_RECOMMENDATION_REPOSITORY_PORT)
    private readonly recommendationRuns: SourcingRecommendationRepositoryPort,
  ) {}

  async ingest1688(input: {
    organizationId: string;
    operationRunId: string;
    attemptToken: string;
    batch: Browser1688TrendBatch;
  }): Promise<BrowserTrendIngestResult> {
    const batch = normalize1688Batch(input.batch);
    const commit = await this.attemptVerifier.withActiveBrowserAttemptFence(
      {
        organizationId: input.organizationId,
        runId: input.operationRunId,
        expectedOperationKey: TREND_1688_OPERATION_KEY,
        attemptToken: input.attemptToken,
      },
      async (attempt, transaction) => {
        const operationInput = Sourcing1688TrendInputSchema.safeParse(attempt.input);
        if (!operationInput.success) {
          // A run created before immutable target snapshots is invalid input,
          // not a fence loss. The browser runtime can therefore report a
          // deterministic terminal failure instead of waiting for its deadline.
          throw new BadRequestException('1688_browser_operation_snapshot_required');
        }
        const expectedKeywords = normalizeKeywordSet(operationInput.data.keywords);
        if (!sameKeywordSet(expectedKeywords, batch.keywords.map((item) => item.keyword))) {
          throw new ConflictException('1688_browser_operation_input_mismatch');
        }
        const claim = await this.collections.claimAuthorizedRunInAttempt(transaction, {
          organizationId: input.organizationId,
          sourceKey: '1688.hot_product',
          scopeKey: 'default',
          targetKey: `operation:${input.operationRunId}`,
          idempotencyKey: `browser-1688-trend:${input.operationRunId}`,
          requestHash: hashCollectionRequest({
            operationRunId: input.operationRunId,
            keywords: [...expectedKeywords].sort(),
          }),
          collectorKey: 'browser-1688-trend-operation',
          collectorVersion: BROWSER_TREND_COLLECTOR_VERSION,
          triggerKind: 'extension',
          triggeredByUserId: attempt.requestedByUserId,
          leaseDurationMs: 120_000,
        });
        if (claim.kind === 'existing') {
          return { acceptedCount: 0, duplicate: true };
        }
        if (claim.kind !== 'claimed') throw claimConflict(claim, '1688_browser_trend_claim_conflict');
        const committed = await this.collections.commitInAttempt(transaction, {
          permit: claim.permit,
          output: map1688HotProductsToAuthorizedOutput({
            permit: claim.permit,
            rows: batch.rows.map((row) => ({ ...row, organizationId: input.organizationId })),
            qualityReport: {
              source: '1688',
              errorCount: batch.errorCount,
              operationRunId: input.operationRunId,
            },
          }),
        });
        if (committed.kind !== 'committed') {
          throw new ConflictException(`1688_browser_trend_commit_${committed.kind}`);
        }
        return { acceptedCount: committed.acceptedCount, duplicate: false };
      },
    );

    if (!commit.duplicate) {
      const staged = await this.recommendations.refresh({
        organizationId: input.organizationId,
        limit: 50,
        idempotencyKey: `browser-1688:${input.operationRunId}:recommendation-refresh`,
        deferPublication: true,
      });
      const recommendationRunId = staged.data?.runId;
      if (!recommendationRunId) {
        throw new ConflictException('1688_browser_recommendation_stage_missing');
      }
      await this.attemptVerifier.withActiveBrowserAttemptFence(
        {
          organizationId: input.organizationId,
          runId: input.operationRunId,
          expectedOperationKey: TREND_1688_OPERATION_KEY,
          attemptToken: input.attemptToken,
        },
        async (_attempt, transaction) => {
          const published = await this.recommendationRuns.publishStagedRunInAttempt(
            transaction,
            { organizationId: input.organizationId, runId: recommendationRunId },
          );
          if (published === 'missing') {
            throw new ConflictException('1688_browser_recommendation_stage_missing');
          }
        },
      );
    }

    return {
      businessDate: toDateString(kstBusinessDate(new Date())),
      collected: commit.acceptedCount,
      errorCount: batch.errorCount,
      duplicate: commit.duplicate,
    };
  }

  async ingestTiktokCc(input: {
    organizationId: string;
    operationRunId: string;
    attemptToken: string;
    batch: BrowserTiktokCcTrendBatch;
  }): Promise<BrowserTrendIngestResult> {
    const batch = normalizeTiktokBatch(input.batch);
    const commit = await this.attemptVerifier.withActiveBrowserAttemptFence(
      {
        organizationId: input.organizationId,
        runId: input.operationRunId,
        expectedOperationKey: TIKTOK_CC_OPERATION_KEY,
        attemptToken: input.attemptToken,
      },
      async (attempt, transaction) => {
        const operationInput = SourcingTiktokCcTrendInputSchema.safeParse(attempt.input);
        if (
          !operationInput.success
          || (operationInput.data.region
            && operationInput.data.region.toUpperCase() !== batch.region)
          || batch.rows.length > (operationInput.data.maxItems ?? 100)
        ) {
          throw new ConflictException('tiktok_cc_browser_operation_input_mismatch');
        }
        const claim = await this.collections.claimAuthorizedRunInAttempt(transaction, {
          organizationId: input.organizationId,
          sourceKey: 'tiktok.creative',
          scopeKey: 'default',
          targetKey: `operation:${input.operationRunId}`,
          idempotencyKey: `browser-tiktok-cc:${input.operationRunId}`,
          requestHash: hashCollectionRequest({
            operationRunId: input.operationRunId,
            region: batch.region,
            maxItems: operationInput.data.maxItems ?? 100,
          }),
          collectorKey: 'browser-tiktok-cc-operation',
          collectorVersion: BROWSER_TREND_COLLECTOR_VERSION,
          triggerKind: 'extension',
          triggeredByUserId: attempt.requestedByUserId,
          leaseDurationMs: 120_000,
        });
        if (claim.kind === 'existing') {
          return { acceptedCount: 0, duplicate: true };
        }
        if (claim.kind !== 'claimed') throw claimConflict(claim, 'tiktok_cc_browser_trend_claim_conflict');
        const committed = await this.collections.commitInAttempt(transaction, {
          permit: claim.permit,
          output: mapTrendTypedRecordsToAuthorizedOutput({
            permit: claim.permit,
            typedRecords: batch.rows.map((row) => ({
              kind: 'tiktok_creative' as const,
              row: { ...row, organizationId: input.organizationId },
            })),
            qualityReport: {
              source: 'tiktok_cc',
              region: batch.region,
              errorCount: batch.errorCount,
              operationRunId: input.operationRunId,
            },
          }),
        });
        if (committed.kind !== 'committed') {
          throw new ConflictException(`tiktok_cc_browser_trend_commit_${committed.kind}`);
        }
        return { acceptedCount: committed.acceptedCount, duplicate: false };
      },
    );
    return {
      businessDate: toDateString(kstBusinessDate(new Date())),
      collected: commit.acceptedCount,
      errorCount: batch.errorCount,
      duplicate: commit.duplicate,
    };
  }
}

function normalize1688Batch(input: Browser1688TrendBatch): {
  keywords: Array<{ keyword: string }>;
  rows: Sourcing1688OfferKeywordObservationInput[];
  errorCount: number;
} {
  if (!Array.isArray(input.keywords) || input.keywords.length === 0 || input.keywords.length > 20) {
    throw new ConflictException('1688_browser_batch_invalid');
  }
  const capturedAt = new Date();
  const businessDate = kstBusinessDate(capturedAt);
  const seen = new Set<string>();
  const keywords: Array<{ keyword: string }> = [];
  const rows: Sourcing1688OfferKeywordObservationInput[] = [];
  for (const keywordResult of input.keywords) {
    const keyword = text(keywordResult.keyword, 120);
    if (!keyword) throw new ConflictException('1688_browser_batch_invalid');
    keywords.push({ keyword });
    if (!Array.isArray(keywordResult.items) || keywordResult.items.length > 20) {
      throw new ConflictException('1688_browser_batch_invalid');
    }
    keywordResult.items.forEach((item, index) => {
      const offerId = text(item.offerId, 128);
      if (!offerId) return;
      const identity = `${normalizeCollectionTarget(keyword)}\u001f${offerId}`;
      if (seen.has(identity)) return;
      seen.add(identity);
      rows.push({
        organizationId: '',
        businessDate,
        offerId,
        sourceKeyword: keyword,
        rank: boundedInt(item.rank, 1, 20) ?? index + 1,
        title: optionalText(item.title, 500),
        priceCny: nonNegativeNumber(item.priceCny),
        monthlySales: boundedInt(item.monthlySales, 0, 2_147_483_647),
        repurchaseRate: optionalText(item.repurchaseRate, 64),
        tradeScore: item.tradeScore == null ? null : String(item.tradeScore),
        supplierName: optionalText(item.supplierName, 200),
        imageUrl: optionalUrl(item.imageUrl),
        sourceUrl: optionalUrl(item.sourceUrl),
        capturedAt,
      });
    });
  }
  return { keywords, rows, errorCount: errorCount(input.errors) };
}

function normalizeTiktokBatch(input: BrowserTiktokCcTrendBatch): {
  region: string;
  rows: TiktokCcSnapshotUpsert[];
  errorCount: number;
} {
  const region = text(input.region, 8).toUpperCase();
  if (!/^[A-Z]{2,8}$/.test(region) || !Array.isArray(input.items) || input.items.length > 100) {
    throw new ConflictException('tiktok_cc_browser_batch_invalid');
  }
  const capturedAt = new Date();
  const businessDate = kstBusinessDate(capturedAt);
  const seen = new Set<string>();
  const rows: TiktokCcSnapshotUpsert[] = [];
  input.items.forEach((item, index) => {
    const trendType = text(item.trendType, 32);
    const entityKey = text(item.entityKey, 200);
    if (!TIKTOK_TYPES.has(trendType) || !entityKey) {
      throw new ConflictException('tiktok_cc_browser_batch_invalid');
    }
    const identity = `${trendType}\u001f${entityKey}`;
    if (seen.has(identity)) return;
    seen.add(identity);
    rows.push({
      organizationId: '',
      businessDate,
      region,
      trendType,
      entityKey,
      rank: boundedInt(item.rank, 1, 1_000) ?? index + 1,
      label: optionalText(item.label, 300),
      industry: optionalText(item.industry, 120),
      sourceKeyword: optionalText(item.sourceKeyword, 80),
      postCount: boundedInt(item.postCount, 0, 2_147_483_647),
      viewCount: boundedInt(item.viewCount, 0, 9_000_000_000_000),
      growthPct: boundedNumber(item.growthPct, -100_000, 10_000_000),
      thumbnailUrl: optionalUrl(item.thumbnailUrl),
      sourceUrl: optionalUrl(item.sourceUrl),
      capturedAt,
    });
  });
  return { region, rows, errorCount: errorCount(input.errors) };
}

function normalizeKeywordSet(keywords: readonly string[]): Set<string> {
  const result = new Set<string>();
  for (const keyword of keywords) {
    const normalized = normalizeCollectionTarget(keyword);
    if (result.has(normalized)) throw new ConflictException('1688_browser_operation_input_mismatch');
    result.add(normalized);
  }
  return result;
}

function sameKeywordSet(expected: Set<string>, actual: readonly string[]): boolean {
  let supplied: Set<string>;
  try {
    supplied = normalizeKeywordSet(actual);
  } catch {
    return false;
  }
  return supplied.size === expected.size && [...supplied].every((keyword) => expected.has(keyword));
}

function claimConflict(
  claim: Exclude<ClaimAuthorizedRunResult, { kind: 'claimed' | 'existing' }>,
  fallbackCode: string,
): ConflictException {
  return new ConflictException(claim.kind === 'denied' ? claim.reasonCode : fallbackCode);
}

function text(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function optionalText(value: unknown, maxLength: number): string | null {
  const result = text(value, maxLength);
  return result || null;
}

function optionalUrl(value: unknown): string | null {
  const result = text(value, 2_048);
  if (!result) return null;
  try {
    const parsed = new URL(result);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? result : null;
  } catch {
    return null;
  }
}

function boundedInt(value: unknown, min: number, max: number): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max
    ? value
    : null;
}

function nonNegativeNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1_000_000_000
    ? value
    : null;
}

function boundedNumber(value: unknown, min: number, max: number): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
    ? value
    : null;
}

function errorCount(value: unknown): number {
  return Array.isArray(value) ? Math.min(value.length, 50) : 0;
}

function toDateString(value: Date): string {
  return value.toISOString().slice(0, 10);
}
