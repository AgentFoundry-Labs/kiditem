import { createHash } from 'node:crypto';
import type {
  Sourcing1688HotProductSnapshotUpsert,
} from '../port/out/repository/trend-collection.repository.port';
import type {
  AuthorizedCollectionOutput,
  SourcingCollectionPermit,
  SourcingTypedCollectionRecord,
} from '../port/out/repository/sourcing-collection.repository.port';
import type { AppendSourcingEvidenceObservationCommand } from '../port/out/repository/sourcing-evidence-ledger.repository.port';

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
  rows: Sourcing1688HotProductSnapshotUpsert[];
  rejectedCount?: number;
  qualityReport?: Record<string, unknown>;
}): AuthorizedCollectionOutput {
  const rows = dedupe1688Rows(input.rows);
  return {
    observations: rows.map((row) => {
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
      };
      return {
        organizationId: input.permit.organizationId,
        ingestionRunId: input.permit.runId,
        sourceEntitlementVersionId: input.permit.entitlementVersionId,
        sourceKey: input.permit.sourceKey,
        platform: '1688',
        evidenceFamily: 'hot_product',
        signalRole: 'supply' as const,
        granularity: 'supply_catalog' as const,
        conceptKey: normalizeCollectionTarget(row.sourceKeyword),
        sourceEntityType: 'supplier_offer',
        sourceEntityId: row.offerId,
        schemaVersion: '1688-hot-product/v2',
        observationKey: hashCollectionRequest({
          sourceKey: input.permit.sourceKey,
          sourceEntityType: 'supplier_offer',
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
        decisionImpactAtIngest: input.permit.decisionImpactAtIngest,
        ingestedAt: row.capturedAt,
      };
    }),
    typedRecords: rows.map((row) => ({ kind: 'offer_1688_hot' as const, row })),
    discoveredCount: rows.length,
    rejectedCount: input.rejectedCount ?? 0,
    qualityReport: input.qualityReport ?? {},
  };
}

export function mapTrendTypedRecordsToAuthorizedOutput(input: {
  permit: SourcingCollectionPermit;
  typedRecords: SourcingTypedCollectionRecord[];
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
  record: SourcingTypedCollectionRecord,
): AppendSourcingEvidenceObservationCommand {
  const row = record.row;
  const identity = trendRecordIdentity(record);
  const rawPayload = { kind: record.kind, ...row };
  const isNaver = record.kind === 'naver_keyword' || record.kind === 'naver_popular_keyword';
  return {
    organizationId: permit.organizationId,
    ingestionRunId: permit.runId,
    sourceEntitlementVersionId: permit.entitlementVersionId,
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
    decisionImpactAtIngest: permit.decisionImpactAtIngest,
    ingestedAt: row.capturedAt,
  };
}

function trendRecordIdentity(record: SourcingTypedCollectionRecord): string {
  const row = record.row;
  if (record.kind === 'naver_keyword') return row.keyword;
  if (record.kind === 'naver_popular_keyword') return `${row.boardKey}:${row.keyword}`;
  if (record.kind === 'offer_1688_hot') return row.offerId;
  if (record.kind === 'shorts') return row.videoKey;
  if (record.kind === 'tiktok_creative') {
    return `${row.region}:${row.trendType}:${row.entityKey}`;
  }
  if (record.kind === 'live_commerce_broadcast') return `${row.source}:${row.broadcastId}`;
  return `${row.source}:${row.broadcastId}:${row.productId}`;
}

function trendConceptKey(record: SourcingTypedCollectionRecord): string | null {
  const row = record.row;
  if (record.kind === 'naver_keyword') return normalizeCollectionTarget(row.keyword);
  if (record.kind === 'naver_popular_keyword') return normalizeCollectionTarget(row.keyword);
  if (record.kind === 'offer_1688_hot') return normalizeCollectionTarget(row.sourceKeyword);
  if (record.kind === 'shorts') return row.keyword ? normalizeCollectionTarget(row.keyword) : null;
  if (record.kind === 'tiktok_creative') {
    return row.sourceKeyword ? normalizeCollectionTarget(row.sourceKeyword) : null;
  }
  return null;
}

function trendEntityType(record: SourcingTypedCollectionRecord): string {
  if (record.kind === 'naver_keyword') return 'search_keyword';
  if (record.kind === 'naver_popular_keyword') return 'popular_keyword';
  if (record.kind === 'offer_1688_hot') return 'supplier_offer';
  if (record.kind === 'shorts') return 'short_video';
  if (record.kind === 'tiktok_creative') return 'creative_trend_entity';
  if (record.kind === 'live_commerce_broadcast') return 'live_broadcast';
  return 'live_commerce_product';
}

function trendPlatform(record: SourcingTypedCollectionRecord, isNaver: boolean): string {
  if (isNaver) return 'naver';
  if (record.kind === 'shorts') return 'shortstrend';
  if (record.kind === 'tiktok_creative') return 'tiktok';
  if (record.kind === 'live_commerce_broadcast' || record.kind === 'live_commerce_product') {
    return record.row.source;
  }
  return '1688';
}

function trendSourceUrl(record: SourcingTypedCollectionRecord): string | null {
  if (record.kind === 'offer_1688_hot') return record.row.sourceUrl;
  if (record.kind === 'shorts') return record.row.videoUrl;
  if (record.kind === 'tiktok_creative') return record.row.sourceUrl;
  return record.row.sourceUrl;
}

function dedupe1688Rows(
  rows: Sourcing1688HotProductSnapshotUpsert[],
): Sourcing1688HotProductSnapshotUpsert[] {
  const byIdentity = new Map<string, Sourcing1688HotProductSnapshotUpsert>();
  for (const row of rows) {
    const offerId = row.offerId.trim();
    const sourceKeyword = normalizeCollectionTarget(row.sourceKeyword);
    if (!offerId) continue;
    const normalized = { ...row, offerId, sourceKeyword };
    const key = `${sourceKeyword}\u0000${offerId}`;
    const existing = byIdentity.get(key);
    if (!existing || existing.capturedAt < normalized.capturedAt) {
      byIdentity.set(key, normalized);
    }
  }
  return [...byIdentity.values()];
}

function canonicalJson(value: unknown): string {
  if (value === null) return 'null';
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}
