import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { kstBusinessDate } from '../../../common/kst';
import {
  OPERATION_ATTEMPT_VERIFIER_PORT,
  type OperationAttemptVerifierPort,
} from '../../../operations/application/port/in/operation-attempt-verifier.port';
import {
  SOURCING_COLLECTION_REPOSITORY_PORT,
  type ClaimAuthorizedRunResult,
  type SourcingCollectionRepositoryPort,
} from '../port/out/repository/sourcing-collection.repository.port';
import type {
  LiveCommerceBroadcastSnapshotUpsert,
  LiveCommerceProductSnapshotUpsert,
} from '../port/out/repository/live-commerce.repository.port';
import { SourcingLiveCommerceUrlInputSchema } from '../../domain/operation/sourcing.operations';
import {
  hashCollectionRequest,
  mapTrendTypedRecordsToAuthorizedOutput,
} from './sourcing-collection-mappers';

const OPERATION_KEY = 'sourcing.collect_live_commerce_url';
const COLLECTOR_VERSION = 'sourcing-browser-live-commerce/v1';
const BROWSER_SOURCES = ['1688', 'douyin'] as const;

type BrowserLiveSource = (typeof BROWSER_SOURCES)[number];

export interface BrowserLiveCommerceBatch {
  source: BrowserLiveSource;
  pageUrl: string;
  broadcast: {
    broadcastId: string;
    title?: string;
    broadcasterId?: string;
    broadcasterName?: string;
    status?: string;
    viewerCount?: number;
    likeCount?: number;
    startedAt?: string;
    endedAt?: string;
    coverImageUrl?: string;
  };
  products: Array<{
    productId: string;
    rank?: number;
    title?: string;
    priceCny?: number;
    salesCount?: number;
    imageUrl?: string;
    sourceUrl?: string;
  }>;
}

export interface BrowserLiveCommerceIngestResult {
  businessDate: string;
  source: BrowserLiveSource;
  broadcastCount: 1;
  productCount: number;
  duplicate: boolean;
}

/** Fenced canonical owner ingestion for the exact browser live-URL operation. */
@Injectable()
export class SourcingBrowserLiveCommerceOperationService {
  constructor(
    @Inject(OPERATION_ATTEMPT_VERIFIER_PORT)
    private readonly attemptVerifier: OperationAttemptVerifierPort,
    @Inject(SOURCING_COLLECTION_REPOSITORY_PORT)
    private readonly collections: SourcingCollectionRepositoryPort,
  ) {}

  async ingest(input: {
    organizationId: string;
    operationRunId: string;
    attemptToken: string;
    batch: BrowserLiveCommerceBatch;
  }): Promise<BrowserLiveCommerceIngestResult> {
    const batch = normalizeBatch(input.batch, input.organizationId);
    const commit = await this.attemptVerifier.withActiveBrowserAttemptFence(
      {
        organizationId: input.organizationId,
        runId: input.operationRunId,
        expectedOperationKey: OPERATION_KEY,
        attemptToken: input.attemptToken,
      },
      async (attempt, transaction) => {
        const operationInput = SourcingLiveCommerceUrlInputSchema.safeParse(attempt.input);
        if (
          !operationInput.success
          || normalizeUrl(operationInput.data.url) !== batch.pageUrl
          || sourceForUrl(batch.pageUrl) !== batch.source
        ) {
          throw new ConflictException('live_commerce_browser_operation_input_mismatch');
        }
        const claim = await this.collections.claimAuthorizedRunInAttempt(transaction, {
          organizationId: input.organizationId,
          sourceKey: `${batch.source}.live_commerce`,
          scopeKey: 'default',
          targetKey: `operation:${input.operationRunId}`,
          idempotencyKey: `browser-live-commerce:${input.operationRunId}`,
          requestHash: hashCollectionRequest({
            operationRunId: input.operationRunId,
            source: batch.source,
            pageUrl: batch.pageUrl,
          }),
          collectorKey: 'browser-live-commerce-operation',
          collectorVersion: COLLECTOR_VERSION,
          triggerKind: 'extension',
          triggeredByUserId: attempt.requestedByUserId,
          leaseDurationMs: 120_000,
        });
        if (claim.kind === 'existing') return { duplicate: true };
        if (claim.kind !== 'claimed') throw claimConflict(claim);
        const committed = await this.collections.commitInAttempt(transaction, {
          permit: claim.permit,
          output: mapTrendTypedRecordsToAuthorizedOutput({
            permit: claim.permit,
            typedRecords: [
              { kind: 'live_commerce_broadcast' as const, row: batch.broadcast },
              ...batch.products.map((row) => ({ kind: 'live_commerce_product' as const, row })),
            ],
            qualityReport: {
              source: batch.source,
              operationRunId: input.operationRunId,
              productCount: batch.products.length,
            },
          }),
        });
        if (committed.kind !== 'committed') {
          throw new ConflictException(`live_commerce_browser_commit_${committed.kind}`);
        }
        return { duplicate: false };
      },
    );
    return {
      businessDate: toDateString(kstBusinessDate(new Date())),
      source: batch.source,
      broadcastCount: 1,
      productCount: batch.products.length,
      duplicate: commit.duplicate,
    };
  }
}

function normalizeBatch(
  input: BrowserLiveCommerceBatch,
  organizationId: string,
): {
  source: BrowserLiveSource;
  pageUrl: string;
  broadcast: LiveCommerceBroadcastSnapshotUpsert;
  products: LiveCommerceProductSnapshotUpsert[];
} {
  const source = input.source;
  const pageUrl = normalizeUrl(input.pageUrl);
  if (!BROWSER_SOURCES.includes(source) || sourceForUrl(pageUrl) !== source) {
    throw new ConflictException('live_commerce_browser_batch_invalid');
  }
  const broadcastId = text(input.broadcast?.broadcastId, 128);
  if (!broadcastId || !Array.isArray(input.products) || input.products.length > 100) {
    throw new ConflictException('live_commerce_browser_batch_invalid');
  }
  const capturedAt = new Date();
  const businessDate = kstBusinessDate(capturedAt);
  const broadcast: LiveCommerceBroadcastSnapshotUpsert = {
    organizationId,
    businessDate,
    source,
    broadcastId,
    title: optionalText(input.broadcast.title, 500),
    broadcasterId: optionalText(input.broadcast.broadcasterId, 128),
    broadcasterName: optionalText(input.broadcast.broadcasterName, 200),
    status: optionalText(input.broadcast.status, 64),
    viewerCount: boundedInt(input.broadcast.viewerCount, 0, 2_147_483_647),
    likeCount: boundedInt(input.broadcast.likeCount, 0, 2_147_483_647),
    startedAt: optionalDate(input.broadcast.startedAt),
    endedAt: optionalDate(input.broadcast.endedAt),
    coverImageUrl: optionalHttpUrl(input.broadcast.coverImageUrl),
    sourceUrl: pageUrl,
    capturedAt,
  };
  const seen = new Set<string>();
  const products: LiveCommerceProductSnapshotUpsert[] = [];
  input.products.forEach((item, index) => {
    const productId = text(item.productId, 128);
    if (!productId || seen.has(productId)) return;
    seen.add(productId);
    products.push({
      organizationId,
      businessDate,
      source,
      broadcastId,
      productId,
      rank: boundedInt(item.rank, 1, 100) ?? index + 1,
      title: optionalText(item.title, 500),
      priceCny: boundedNumber(item.priceCny, 0, 1_000_000_000),
      salesCount: boundedInt(item.salesCount, 0, 2_147_483_647),
      imageUrl: optionalHttpUrl(item.imageUrl),
      sourceUrl: optionalSourceUrl(source, item.sourceUrl),
      capturedAt,
    });
  });
  return { source, pageUrl, broadcast, products };
}

function sourceForUrl(value: string): BrowserLiveSource | null {
  const host = new URL(value).hostname.toLowerCase();
  if (host === 'zb.1688.com' || host.endsWith('.zb.1688.com')) return '1688';
  if (host === 'live.douyin.com' || host.endsWith('.live.douyin.com')) return 'douyin';
  return null;
}

function normalizeUrl(value: unknown): string {
  if (typeof value !== 'string') throw new ConflictException('live_commerce_browser_batch_invalid');
  try {
    const parsed = new URL(value.trim());
    if (parsed.protocol !== 'https:' || !sourceForUrl(parsed.toString())) {
      throw new Error('host_invalid');
    }
    return parsed.toString();
  } catch {
    throw new ConflictException('live_commerce_browser_batch_invalid');
  }
}

function optionalSourceUrl(source: BrowserLiveSource, value: unknown): string | null {
  const result = optionalHttpUrl(value);
  if (!result) return null;
  const host = new URL(result).hostname.toLowerCase();
  const matches = source === '1688'
    ? host === '1688.com' || host.endsWith('.1688.com')
    : host === 'douyin.com' || host.endsWith('.douyin.com') || host === 'jinritemai.com' || host.endsWith('.jinritemai.com');
  return matches ? result : null;
}

function claimConflict(
  claim: Exclude<ClaimAuthorizedRunResult, { kind: 'claimed' | 'existing' }>,
): ConflictException {
  return new ConflictException(
    claim.kind === 'denied' ? claim.reasonCode : 'live_commerce_browser_claim_conflict',
  );
}

function text(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function optionalText(value: unknown, maxLength: number): string | null {
  const result = text(value, maxLength);
  return result || null;
}

function optionalHttpUrl(value: unknown): string | null {
  const result = text(value, 2_048);
  if (!result) return null;
  try {
    const parsed = new URL(result);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function optionalDate(value: unknown): Date | null {
  const result = text(value, 64);
  if (!result) return null;
  const date = new Date(result);
  return Number.isNaN(date.getTime()) ? null : date;
}

function boundedInt(value: unknown, min: number, max: number): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max
    ? value
    : null;
}

function boundedNumber(value: unknown, min: number, max: number): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
    ? value
    : null;
}

function toDateString(value: Date): string {
  return value.toISOString().slice(0, 10);
}
