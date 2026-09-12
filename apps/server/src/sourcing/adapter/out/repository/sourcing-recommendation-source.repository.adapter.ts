import { Injectable } from '@nestjs/common';
import {
  SourcingWingCatalogObservationSchema,
  type SourcingWingCatalogObservation,
} from '@kiditem/shared/sourcing';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  SourcingCoupangObservationSource,
  SourcingOfferObservationSource,
  SourcingRecommendationSourceRepositoryPort,
} from '../../../application/port/out/repository/sourcing-recommendation-source.repository.port';

const MAX_QUERY_LIMIT = 400;
const WING_SOURCE_KEY = 'coupang.wing_catalog';

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
          ingestionRun: { status: 'COMPLETE', isCurrentComplete: true },
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
    const completeAttempts = await this.prisma.sourcingEvidenceIngestionRun.findMany({
      where: { organizationId: input.organizationId, sourceKey: WING_SOURCE_KEY,
        scopeKey: 'default', targetKey: 'catalog', status: 'COMPLETE',
        completedAt: { gte: lookbackStart(input.cutoffAt, input.lookbackDays), lte: input.cutoffAt } },
      select: { id: true, qualityReport: true },
      orderBy: [{ completedAt: 'desc' }, { id: 'desc' }],
    });
    const latestByKeyword = new Map<string, string>();
    for (const attempt of completeAttempts) {
      const coverage = isRecord(attempt.qualityReport) ? attempt.qualityReport.snapshots : null;
      for (const snapshot of Array.isArray(coverage) ? coverage : []) {
        if (isRecord(snapshot) && typeof snapshot.keyword === 'string' && !latestByKeyword.has(snapshot.keyword)) {
          latestByKeyword.set(snapshot.keyword, attempt.id);
        }
      }
    }
    if (latestByKeyword.size === 0) return { items: [], rejectedCount: 0 };
    const rows = await this.prisma.sourcingEvidenceObservation.findMany({
      where: {
        organizationId: input.organizationId,
        platform: 'coupang',
        sourceKey: 'coupang.wing_catalog',
        schemaVersion: 'coupang-wing-catalog/v2',
        availableAt: { lte: input.cutoffAt },
        ingestedAt: { gte: lookbackStart(input.cutoffAt, input.lookbackDays), lte: input.cutoffAt },
        supersededByObservation: null,
        ingestionRun: { status: 'COMPLETE' },
        OR: [...latestByKeyword].map(([conceptKey, ingestionRunId]) => ({ conceptKey, ingestionRunId })),
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
    const publication = await this.prisma.sourcingEvidenceIngestionRun.findFirst({
      where: { organizationId: input.organizationId, sourceKey: WING_SOURCE_KEY,
        scopeKey: 'default', targetKey: 'catalog', status: 'COMPLETE', completedAt: { not: null },
        qualityReport: { path: ['snapshots'], array_contains: [{ keyword: input.normalizedKeyword }] } },
      select: { id: true, completedAt: true },
      orderBy: [{ completedAt: 'desc' }, { id: 'desc' }],
    });
    if (!publication) return { generatedAt: null, items: [], rejectedCount: 0 };
    const rows = await this.prisma.sourcingEvidenceObservation.findMany({
      where: {
        organizationId: input.organizationId,
        platform: 'coupang',
        sourceKey: 'coupang.wing_catalog',
        schemaVersion: 'coupang-wing-catalog/v2',
        ingestionRunId: publication.id,
        conceptKey: input.normalizedKeyword,
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
      generatedAt: publication.completedAt,
      items: [...byProduct.values()].slice(0, limit),
      rejectedCount,
    };
  }
}

function parseWingCatalogPayload(
  value: unknown,
): SourcingWingCatalogObservation | null {
  const current = SourcingWingCatalogObservationSchema.safeParse(value);
  return current.success ? current.data : null;
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
