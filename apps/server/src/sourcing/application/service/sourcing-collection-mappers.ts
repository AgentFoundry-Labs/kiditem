import { createHash } from 'node:crypto';
import type {
  Sourcing1688OfferKeywordObservationInput,
} from '../port/out/repository/trend-collection.repository.port';
import type {
  AuthorizedCollectionOutput,
  SourcingCollectionPermit,
  SourcingTypedCollectionRecord,
} from '../port/out/repository/sourcing-collection.repository.port';
import type { AppendSourcingEvidenceObservationCommand } from '../port/out/repository/sourcing-evidence-ledger.repository.port';
import { canonicalJson } from '../../domain/sourcing-stable-json';

type TrendTypedCollectionRecord = Extract<
  SourcingTypedCollectionRecord,
  {
    kind:
      | 'naver_keyword'
      | 'naver_popular_keyword'
      | 'offer_1688_keyword_observation'
      | 'shorts'
      | 'tiktok_creative'
      | 'live_commerce_broadcast'
      | 'live_commerce_product';
  }
>;

export function normalizeCollectionTarget(value: string): string {
  const normalized = value
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('en-US');
  if (!normalized) throw new TypeError('Collection target must not be empty.');
  return normalized;
}

export function hashCollectionRequest(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

export function map1688HotProductsToAuthorizedOutput(input: {
  permit: SourcingCollectionPermit;
  rows: Sourcing1688OfferKeywordObservationInput[];
  discoveredCount?: number;
  rejectedCount?: number;
  qualityReport?: Record<string, unknown>;
}): AuthorizedCollectionOutput {
  const rows = dedupe1688Rows(input.rows);
  const observations = rows.map((row) => to1688Observation(input.permit, row));
  return {
    observations,
    typedRecords: rows.map((row, index) => ({
      kind: 'offer_1688_keyword_observation' as const,
      row: {
        ...row,
        ingestionRunId: input.permit.runId,
        evidenceObservationKey: observations[index].observationKey,
        evidenceRevision: observations[index].revision,
      },
    })),
    discoveredCount: input.discoveredCount ?? rows.length,
    rejectedCount: input.rejectedCount ?? 0,
    qualityReport: input.qualityReport ?? {},
  };
}

function to1688Observation(
  permit: SourcingCollectionPermit,
  row: Sourcing1688OfferKeywordObservationInput,
): AppendSourcingEvidenceObservationCommand {
  const rawPayload = {
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
    ...(row.searchMetadata ? row.searchMetadata : {}),
  };
  return {
    organizationId: permit.organizationId,
    ingestionRunId: permit.runId,
    sourceKey: permit.sourceKey,
    platform: '1688',
    evidenceFamily: 'hot_product',
    signalRole: 'supply',
    granularity: 'supply_catalog',
    conceptKey: normalizeCollectionTarget(row.sourceKeyword),
    sourceEntityType: 'supplier_offer',
    sourceEntityId: row.offerId,
    schemaVersion: '1688-hot-product/v2',
    observationKey: hashCollectionRequest({
      sourceKey: permit.sourceKey,
      sourceEntityType: 'supplier_offer',
      ingestionRunId: permit.runId,
      externalOfferId: row.offerId,
      variantKey: '',
      sourceKeyword: normalizeCollectionTarget(row.sourceKeyword),
      capturedAt: row.capturedAt,
    }),
    revision: 1,
    supportsCandidate: true,
    sourceUrl: row.sourceUrl,
    eventAt: row.capturedAt,
    observedAt: row.capturedAt,
    availableAt: row.capturedAt,
    revisionAt: null,
    rawPayload,
    payloadHash: hashCollectionRequest(rawPayload),
    ingestedAt: row.capturedAt,
  };
}

export function mapTrendTypedRecordsToAuthorizedOutput(input: {
  permit: SourcingCollectionPermit;
  typedRecords: TrendTypedCollectionRecord[];
  rejectedCount?: number;
  qualityReport?: Record<string, unknown>;
}): AuthorizedCollectionOutput {
  return {
    observations: input.typedRecords.map((record) => mapTrendRecordObservation(input.permit, record)),
    typedRecords: input.typedRecords,
    discoveredCount: input.typedRecords.length,
    rejectedCount: input.rejectedCount ?? 0,
    qualityReport: input.qualityReport ?? {},
  };
}

function mapTrendRecordObservation(
  permit: SourcingCollectionPermit,
  record: TrendTypedCollectionRecord,
): AppendSourcingEvidenceObservationCommand {
  const row = record.row;
  const identity = trendRecordIdentity(record);
  const rawPayload = trendRawPayload(record);
  const isNaver = record.kind === 'naver_keyword' || record.kind === 'naver_popular_keyword';
  return {
    organizationId: permit.organizationId,
    ingestionRunId: permit.runId,
    sourceKey: permit.sourceKey,
    platform: trendPlatform(record, isNaver),
    evidenceFamily: record.kind,
    signalRole: 'demand',
    granularity: isNaver ? 'aggregate_official' : 'inferred_observation',
    conceptKey: trendConceptKey(record),
    sourceEntityType: trendEntityType(record),
    sourceEntityId: identity,
    schemaVersion: 'trend-collection/v2',
    observationKey: hashCollectionRequest({
      sourceKey: permit.sourceKey,
      recordKind: record.kind,
      ...(isNaver || record.kind === 'shorts' ? { ingestionRunId: permit.runId } : {}),
      identity,
      capturedAt: row.capturedAt,
    }),
    revision: 1,
    supportsCandidate: false,
    sourceUrl: trendSourceUrl(record),
    eventAt: row.capturedAt,
    observedAt: row.capturedAt,
    availableAt: row.capturedAt,
    revisionAt: null,
    rawPayload,
    payloadHash: hashCollectionRequest(rawPayload),
    ingestedAt: row.capturedAt,
  };
}

function trendRawPayload(record: TrendTypedCollectionRecord): Record<string, unknown> {
  if (
    record.kind === 'tiktok_creative'
    || record.kind === 'live_commerce_broadcast'
    || record.kind === 'live_commerce_product'
  ) {
    const { ingestionRunId: _ingestionRunId, ...row } = record.row;
    return { kind: record.kind, ...row };
  }
  return { kind: record.kind, ...record.row };
}

function trendRecordIdentity(record: TrendTypedCollectionRecord): string {
  if (record.kind === 'naver_keyword') return record.row.keyword;
  if (record.kind === 'naver_popular_keyword') return `${record.row.boardKey}:${record.row.keyword}`;
  if (record.kind === 'offer_1688_keyword_observation') return record.row.offerId;
  if (record.kind === 'shorts') return record.row.videoKey;
  if (record.kind === 'tiktok_creative') {
    return `${record.row.region}:${record.row.trendType}:${record.row.entityKey}`;
  }
  if (record.kind === 'live_commerce_broadcast') return `${record.row.source}:${record.row.broadcastId}`;
  return `${record.row.source}:${record.row.broadcastId}:${record.row.productId}`;
}

function trendConceptKey(record: TrendTypedCollectionRecord): string | null {
  if (record.kind === 'naver_keyword') return normalizeCollectionTarget(record.row.keyword);
  if (record.kind === 'naver_popular_keyword') return normalizeCollectionTarget(record.row.keyword);
  if (record.kind === 'offer_1688_keyword_observation') return normalizeCollectionTarget(record.row.sourceKeyword);
  if (record.kind === 'shorts') return record.row.keyword ? normalizeCollectionTarget(record.row.keyword) : null;
  if (record.kind === 'tiktok_creative') {
    return record.row.sourceKeyword ? normalizeCollectionTarget(record.row.sourceKeyword) : null;
  }
  return null;
}

function trendEntityType(record: TrendTypedCollectionRecord): string {
  if (record.kind === 'naver_keyword') return 'search_keyword';
  if (record.kind === 'naver_popular_keyword') return 'popular_keyword';
  if (record.kind === 'offer_1688_keyword_observation') return 'supplier_offer';
  if (record.kind === 'shorts') return 'short_video';
  if (record.kind === 'tiktok_creative') return 'creative_trend_entity';
  if (record.kind === 'live_commerce_broadcast') return 'live_broadcast';
  return 'live_commerce_product';
}

function trendPlatform(record: TrendTypedCollectionRecord, isNaver: boolean): string {
  if (isNaver) return 'naver';
  if (record.kind === 'shorts') return 'shortstrend';
  if (record.kind === 'tiktok_creative') return 'tiktok';
  if (record.kind === 'live_commerce_broadcast' || record.kind === 'live_commerce_product') {
    return record.row.source;
  }
  return '1688';
}

function trendSourceUrl(record: TrendTypedCollectionRecord): string | null {
  if (record.kind === 'offer_1688_keyword_observation') return record.row.sourceUrl;
  if (record.kind === 'shorts') return record.row.videoUrl;
  if (record.kind === 'tiktok_creative') return record.row.sourceUrl;
  if (record.kind === 'live_commerce_broadcast' || record.kind === 'live_commerce_product') {
    return record.row.sourceUrl;
  }
  return null;
}

function dedupe1688Rows(
  rows: Sourcing1688OfferKeywordObservationInput[],
): Sourcing1688OfferKeywordObservationInput[] {
  const byIdentity = new Map<string, Sourcing1688OfferKeywordObservationInput>();
  for (const row of rows) {
    const offerId = row.offerId.trim();
    const sourceKeyword = row.sourceKeyword.trim();
    const sourceKeywordIdentity = normalizeCollectionTarget(sourceKeyword);
    if (!offerId) continue;
    const normalized = { ...row, offerId, sourceKeyword };
    const key = `${sourceKeywordIdentity}\u0000${offerId}`;
    const existing = byIdentity.get(key);
    if (!existing || existing.capturedAt < normalized.capturedAt) {
      byIdentity.set(key, normalized);
    }
  }
  return [...byIdentity.values()];
}
