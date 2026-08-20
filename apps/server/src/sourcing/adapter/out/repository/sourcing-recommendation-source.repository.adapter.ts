import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import {
  SourcingCoupangObservationCommandSchema,
  SourcingWingCatalogPurposeSchema,
  SourcingWingCatalogObservationSchema,
  type SourcingWingCatalogObservation,
  type SourcingWingCatalogPurpose,
} from '@kiditem/shared/sourcing';
import { PrismaService } from '../../../../prisma/prisma.service';
import { canonicalJson } from '../../../domain/sourcing-stable-json';
import type {
  SourcingCoupangObservationSource,
  SourcingOfferObservationSource,
  SourcingRecommendationSourceRepositoryPort,
} from '../../../application/port/out/repository/sourcing-recommendation-source.repository.port';

const TERMINAL_COLLECTION_STATUSES = ['complete', 'partial'];
const MAX_QUERY_LIMIT = 400;
const MAX_WING_SNAPSHOT_MARKER_CANDIDATES = 24;
const WING_SOURCE_KEY = 'coupang.wing_catalog';
const WING_BATCH_COLLECTOR_KEY = 'wing-catalog-observation-ingest';
const WING_FINALIZE_COLLECTOR_KEY = 'wing-catalog-operation-finalize';

@Injectable()
export class SourcingRecommendationSourceRepositoryAdapter
  implements SourcingRecommendationSourceRepositoryPort
{
  constructor(private readonly prisma: PrismaService) {}

  async listLatestOfferObservations(input: {
    organizationId: string;
    cutoffAt: Date;
    lookbackDays: number;
    limit: number;
  }): Promise<{ items: SourcingOfferObservationSource[]; rejectedCount: number }> {
    const rows = await this.prisma.sourcing1688OfferKeywordObservation.findMany({
      where: {
        organizationId: input.organizationId,
        capturedAt: { gte: lookbackStart(input.cutoffAt, input.lookbackDays), lte: input.cutoffAt },
        evidenceObservation: {
          availableAt: { lte: input.cutoffAt },
          ingestedAt: { lte: input.cutoffAt },
          supersededByObservation: null,
          schemaVersion: '1688-hot-product/v2',
          ingestionRun: { status: { in: TERMINAL_COLLECTION_STATUSES } },
        },
      },
      orderBy: [{ capturedAt: 'desc' }, { id: 'desc' }],
      take: boundedQueryLimit(input.limit),
    });
    const byObservationIdentity = new Map<string, SourcingOfferObservationSource>();
    let rejectedCount = 0;
    for (const row of rows) {
      const externalOfferId = row.externalOfferId.trim();
      const sourceKeyword = row.sourceKeywordNormalized.trim();
      if (!externalOfferId || !sourceKeyword || !isRecord(row.rawOffer)) {
        rejectedCount += 1;
        continue;
      }
      const result: SourcingOfferObservationSource = {
        id: row.id,
        evidenceObservationId: row.evidenceObservationId,
        ingestionRunId: row.ingestionRunId,
        businessDate: row.businessDate,
        sourceKeyword,
        externalOfferId,
        variantKey: row.variantKeyNormalized,
        sourceUrl: row.sourceUrl,
        title: row.title,
        supplierName: row.supplierName,
        imageUrl: row.imageUrl,
        rank: row.rank,
        priceCny: row.priceCny == null ? null : Number(row.priceCny),
        monthlySales: row.monthlySales,
        capturedAt: row.capturedAt,
        rawOffer: row.rawOffer,
      };
      const key = `${sourceKeyword}\u001f${externalOfferId}\u001f${row.variantKeyNormalized}`;
      if (!byObservationIdentity.has(key)) byObservationIdentity.set(key, result);
    }
    return { items: [...byObservationIdentity.values()].slice(0, input.limit), rejectedCount };
  }

  async listLatestCoupangObservations(input: {
    organizationId: string;
    cutoffAt: Date;
    lookbackDays: number;
    limit: number;
  }): Promise<{ items: SourcingCoupangObservationSource[]; rejectedCount: number }> {
    const rows = await this.prisma.sourcingEvidenceObservation.findMany({
      where: {
        organizationId: input.organizationId,
        platform: 'coupang',
        sourceKey: 'coupang.wing_catalog',
        schemaVersion: {
          in: ['coupang-wing-catalog/v1', 'coupang-wing-catalog/v2'],
        },
        availableAt: { lte: input.cutoffAt },
        ingestedAt: { gte: lookbackStart(input.cutoffAt, input.lookbackDays), lte: input.cutoffAt },
        supersededByObservation: null,
        ingestionRun: { status: { in: TERMINAL_COLLECTION_STATUSES } },
      },
      select: { id: true, payload: true },
      orderBy: [{ observedAt: 'desc' }, { id: 'desc' }],
      take: boundedQueryLimit(input.limit),
    });
    const byProduct = new Map<string, SourcingCoupangObservationSource>();
    let rejectedCount = 0;
    for (const row of rows) {
      const item = parseWingCatalogPayload(row.payload);
      if (!item) {
        rejectedCount += 1;
        continue;
      }
      const source: SourcingCoupangObservationSource = {
        evidenceObservationId: row.id,
        productId: item.productId,
        itemId: item.itemId,
        vendorItemId: item.vendorItemId,
        productName: item.productName,
        sourceKeyword: item.sourceKeyword,
        salePriceKrw: item.salePriceKrw,
        ratingCount: item.ratingCount,
        ratingAverage: item.ratingAverage,
        viewsLast28d: item.viewsLast28d,
        salesLast28d: item.salesLast28d,
        capturedAt: new Date(item.capturedAt),
      };
      const key = `${source.productId}\u001f${source.vendorItemId ?? source.itemId ?? ''}`;
      if (!byProduct.has(key)) byProduct.set(key, source);
    }
    return { items: [...byProduct.values()].slice(0, input.limit), rejectedCount };
  }

  async listWingCatalogSnapshot(input: {
    organizationId: string;
    normalizedKeyword: string;
    limit: number;
  }): Promise<{
    generatedAt: Date | null;
    items: SourcingWingCatalogObservation[];
    rejectedCount: number;
  }> {
    const limit = Math.max(1, Math.min(400, Math.floor(input.limit)));
    const markers = await this.prisma.sourcingEvidenceIngestionRun.findMany({
      where: {
        organizationId: input.organizationId,
        sourceKey: WING_SOURCE_KEY,
        scopeKey: 'default',
        collectorKey: WING_FINALIZE_COLLECTOR_KEY,
        status: { in: TERMINAL_COLLECTION_STATUSES },
        completedAt: { not: null },
        qualityReport: {
          path: ['snapshots'],
          array_contains: [{ keyword: input.normalizedKeyword }],
        },
      },
      select: {
        id: true,
        organizationId: true,
        scopeKey: true,
        targetKey: true,
        idempotencyKey: true,
        requestHash: true,
        completedAt: true,
        qualityReport: true,
      },
      orderBy: [{ completedAt: 'desc' }, { id: 'desc' }],
      take: MAX_WING_SNAPSHOT_MARKER_CANDIDATES,
    });
    const candidates = markers.flatMap((marker) => {
      if (!marker.completedAt) return [];
      const parsed = parseWingSnapshotMarker(marker.qualityReport, input.normalizedKeyword);
      if (!parsed || !isExactFinalizeMarker(marker, parsed, input.organizationId)) {
        return [];
      }
      return [{ ...parsed, generatedAt: marker.completedAt }];
    });
    const batchIdempotencyKeys = [
      ...new Set(candidates.map((candidate) => candidate.batchIdempotencyKey)),
    ];
    const batches =
      batchIdempotencyKeys.length === 0
        ? []
        : await this.prisma.sourcingEvidenceIngestionRun.findMany({
            where: {
              organizationId: input.organizationId,
              sourceKey: WING_SOURCE_KEY,
              scopeKey: 'default',
              collectorKey: WING_BATCH_COLLECTOR_KEY,
              idempotencyKey: { in: batchIdempotencyKeys },
              status: { in: TERMINAL_COLLECTION_STATUSES },
              completedAt: { not: null },
            },
            select: {
              id: true,
              organizationId: true,
              sourceKey: true,
              scopeKey: true,
              targetKey: true,
              idempotencyKey: true,
              requestHash: true,
              collectorKey: true,
              status: true,
              completedAt: true,
            },
            take: MAX_WING_SNAPSHOT_MARKER_CANDIDATES,
          });
    const batchesByIdempotencyKey = new Map(batches.map((batch) => [batch.idempotencyKey, batch]));
    let publication: { ingestionRunId: string; generatedAt: Date } | null = null;
    for (const candidate of candidates) {
      const batch = batchesByIdempotencyKey.get(candidate.batchIdempotencyKey);
      if (!batch || !isExactWingBatch(batch, candidate, input.organizationId)) continue;
      publication = {
        ingestionRunId: batch.id,
        generatedAt: candidate.generatedAt,
      };
      break;
    }
    if (!publication) {
      return { generatedAt: null, items: [], rejectedCount: 0 };
    }
    const rows = await this.prisma.sourcingEvidenceObservation.findMany({
      where: {
        organizationId: input.organizationId,
        platform: 'coupang',
        sourceKey: 'coupang.wing_catalog',
        schemaVersion: {
          in: ['coupang-wing-catalog/v1', 'coupang-wing-catalog/v2'],
        },
        ingestionRunId: publication.ingestionRunId,
        supersededByObservation: null,
      },
      select: { id: true, payload: true },
      orderBy: [{ observedAt: 'desc' }, { id: 'desc' }],
      take: Math.min(800, limit * 2),
    });
    const byProduct = new Map<string, SourcingWingCatalogObservation>();
    let rejectedCount = 0;
    for (const row of rows) {
      const item = parseWingCatalogPayload(row.payload);
      if (!item) {
        rejectedCount += 1;
        continue;
      }
      const identity = `${item.productId}\u001f${item.vendorItemId ?? item.itemId ?? ''}`;
      if (!byProduct.has(identity)) byProduct.set(identity, item);
    }
    return {
      generatedAt: publication.generatedAt,
      items: [...byProduct.values()].slice(0, limit),
      rejectedCount,
    };
  }
}

type WingSnapshotCandidate = {
  operationRunId: string;
  purpose: SourcingWingCatalogPurpose;
  normalizedKeyword: string;
  batchIdempotencyKey: string;
};

function parseWingSnapshotMarker(
  qualityReport: unknown,
  normalizedKeyword: string,
): WingSnapshotCandidate | null {
  if (!isRecord(qualityReport) || qualityReport.source !== 'coupang-wing-catalog-finalize') {
    return null;
  }
  if (!isUuid(qualityReport.operationRunId)) return null;
  const purpose = SourcingWingCatalogPurposeSchema.safeParse(qualityReport.purpose);
  if (!purpose.success) return null;
  if (
    !Array.isArray(qualityReport.snapshots) ||
    qualityReport.snapshots.length < 1 ||
    qualityReport.snapshots.length > 12
  ) {
    return null;
  }
  const seenKeywords = new Set<string>();
  let match: { keyword: string; batchIdempotencyKey: string } | null = null;
  for (const candidate of qualityReport.snapshots) {
    if (
      !isRecord(candidate) ||
      typeof candidate.keyword !== 'string' ||
      candidate.keyword.length < 1 ||
      candidate.keyword.length > 100 ||
      typeof candidate.batchIdempotencyKey !== 'string' ||
      candidate.batchIdempotencyKey.length < 1 ||
      candidate.batchIdempotencyKey.length > 300 ||
      seenKeywords.has(candidate.keyword)
    )
      return null;
    seenKeywords.add(candidate.keyword);
    if (candidate.keyword === normalizedKeyword)
      match = {
        keyword: candidate.keyword,
        batchIdempotencyKey: candidate.batchIdempotencyKey,
      };
  }
  if (!match) return null;
  return {
    operationRunId: qualityReport.operationRunId,
    purpose: purpose.data,
    normalizedKeyword: match.keyword,
    batchIdempotencyKey: match.batchIdempotencyKey,
  };
}

function isExactFinalizeMarker(
  marker: {
    organizationId: string;
    scopeKey: string;
    targetKey: string;
    idempotencyKey: string;
    requestHash: string;
  },
  candidate: WingSnapshotCandidate,
  organizationId: string,
): boolean {
  return (
    marker.organizationId === organizationId &&
    marker.scopeKey === 'default' &&
    marker.targetKey === `finalize:${candidate.operationRunId}` &&
    marker.idempotencyKey === `wing-operation:${candidate.operationRunId}:finalize` &&
    marker.requestHash ===
      collectionHash({
        operationRunId: candidate.operationRunId,
        purpose: candidate.purpose,
        kind: 'finalize',
      })
  );
}

function isExactWingBatch(
  batch: {
    organizationId: string;
    sourceKey: string;
    scopeKey: string;
    targetKey: string;
    idempotencyKey: string;
    requestHash: string;
    collectorKey: string;
    status: string;
    completedAt: Date | null;
  },
  candidate: WingSnapshotCandidate,
  organizationId: string,
): boolean {
  return (
    batch.organizationId === organizationId &&
    batch.sourceKey === WING_SOURCE_KEY &&
    batch.scopeKey === 'default' &&
    batch.targetKey === `keyword:${candidate.normalizedKeyword}` &&
    batch.idempotencyKey === candidate.batchIdempotencyKey &&
    batch.idempotencyKey ===
      keywordBatchIdempotencyKey(candidate.operationRunId, candidate.normalizedKeyword) &&
    batch.requestHash ===
      collectionHash({
        operationRunId: candidate.operationRunId,
        normalizedKeyword: candidate.normalizedKeyword,
      }) &&
    batch.collectorKey === WING_BATCH_COLLECTOR_KEY &&
    TERMINAL_COLLECTION_STATUSES.includes(batch.status) &&
    batch.completedAt instanceof Date
  );
}

function keywordBatchIdempotencyKey(operationRunId: string, normalizedKeyword: string): string {
  return `wing-operation:${operationRunId}:${collectionHash(normalizedKeyword)}`;
}

function collectionHash(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)
  );
}

function parseWingCatalogPayload(
  value: unknown,
): SourcingWingCatalogObservation | null {
  const current = SourcingWingCatalogObservationSchema.safeParse(value);
  if (current.success) return current.data;

  const legacy = SourcingCoupangObservationCommandSchema.safeParse({
    idempotencyKey: '00000000-0000-4000-8000-000000000000',
    items: [value],
  });
  if (!legacy.success) return null;
  const item = legacy.data.items[0];
  return {
    ...item,
    itemName: null,
    brandName: null,
    manufacture: null,
    categoryHierarchy: null,
    imagePath: null,
    estimatedRevenue28d: null,
    conversionRate28d: null,
    deliveryInfo: null,
  };
}

function lookbackStart(cutoffAt: Date, lookbackDays: number): Date {
  const days = Math.max(1, Math.floor(lookbackDays));
  return new Date(cutoffAt.getTime() - (days - 1) * 86_400_000);
}

function boundedQueryLimit(limit: number): number {
  return Math.max(1, Math.min(MAX_QUERY_LIMIT, Math.max(1, Math.floor(limit)) * 4));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
