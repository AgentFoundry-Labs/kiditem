import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { addDays } from '../../../../common/kst';
import {
  readCurrent1688OfferSnapshots,
  readLatestWingCatalogPublicationFacts,
} from './source-evidence.reader';
import type {
  SourcingCoupangObservationSource,
  SourcingOfferObservationSource,
  SourcingRecommendationSourceRepositoryPort,
} from '../../../application/port/out/repository/sourcing-recommendation-source.repository.port';
import type { SourcingWingCatalogObservation } from '@kiditem/shared/sourcing';

const MAX_QUERY_LIMIT = 400;

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
    const rows = await readCurrent1688OfferSnapshots(this.prisma, {
      organizationId: input.organizationId,
      capturedFrom: lookbackStart(input.cutoffAt, input.lookbackDays),
      cutoffAt: input.cutoffAt,
      limit: boundedQueryLimit(input.limit),
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
    const publication = await this.prisma.$transaction(
      (tx) => readLatestWingCatalogPublicationFacts(tx, {
        organizationId: input.organizationId,
        capturedFrom: lookbackStart(input.cutoffAt, input.lookbackDays),
        cutoffAt: input.cutoffAt,
      }),
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
    const byProduct = new Map<string, SourcingCoupangObservationSource>();
    for (const row of publication.rows) {
      const source: SourcingCoupangObservationSource = {
        evidenceObservationId: row.evidenceObservationId,
        productId: row.productId,
        itemId: row.itemId,
        vendorItemId: row.vendorItemId,
        productName: row.productName,
        sourceKeyword: row.sourceKeyword,
        salePriceKrw: row.salePriceKrw,
        ratingCount: row.ratingCount,
        ratingAverage: row.ratingAverage == null ? null : Number(row.ratingAverage),
        viewsLast28d: row.viewsLast28d,
        salesLast28d: row.salesLast28d,
        capturedAt: row.capturedAt,
      };
      const key = `${source.productId}\u001f${source.vendorItemId ?? source.itemId ?? ''}`;
      if (!byProduct.has(key)) byProduct.set(key, source);
    }
    return {
      items: [...byProduct.values()].slice(0, input.limit),
      rejectedCount: publication.rejectedCount,
    };
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
    const read = await this.prisma.$transaction(
      (tx) => readLatestWingCatalogPublicationFacts(tx, {
        organizationId: input.organizationId,
        normalizedKeywords: [input.normalizedKeyword],
      }),
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
    const publication = read.publications[0];
    if (!publication) return { generatedAt: null, items: [], rejectedCount: 0 };
    if (!publication.available) {
      return {
        generatedAt: null,
        items: [],
        rejectedCount: publication.rejectedCount,
      };
    }
    const byProduct = new Map<string, SourcingWingCatalogObservation>();
    for (const row of read.rows) {
      const item = toWingCatalogObservation(row);
      const identity = `${item.productId}\u001f${item.vendorItemId ?? item.itemId ?? ''}`;
      if (!byProduct.has(identity)) byProduct.set(identity, item);
    }
    return {
      generatedAt: publication.completedAt,
      items: [...byProduct.values()].slice(0, limit),
      rejectedCount: 0,
    };
  }
}

function toWingCatalogObservation(
  row: Awaited<ReturnType<typeof readLatestWingCatalogPublicationFacts>>['rows'][number],
): SourcingWingCatalogObservation {
  return {
    productId: row.productId,
    itemId: row.itemId,
    vendorItemId: row.vendorItemId,
    productName: row.productName,
    itemName: row.itemName,
    brandName: row.brandName,
    manufacture: row.manufacture,
    categoryHierarchy: row.categoryHierarchy,
    imagePath: row.imagePath,
    salePriceKrw: row.salePriceKrw,
    ratingAverage: row.ratingAverage == null ? null : Number(row.ratingAverage),
    ratingCount: row.ratingCount,
    viewsLast28d: row.viewsLast28d,
    salesLast28d: row.salesLast28d,
    estimatedRevenue28d: row.estimatedRevenue28d == null ? null : Number(row.estimatedRevenue28d),
    conversionRate28d: row.conversionRate28d == null ? null : Number(row.conversionRate28d),
    deliveryInfo: row.deliveryInfo,
    sourceKeyword: row.sourceKeyword,
    capturedAt: row.capturedAt.toISOString(),
  };
}

function lookbackStart(cutoffAt: Date, lookbackDays: number): Date {
  const days = Math.max(1, Math.floor(lookbackDays));
  return addDays(cutoffAt, -(days - 1));
}

function boundedQueryLimit(limit: number): number {
  return Math.max(1, Math.min(MAX_QUERY_LIMIT, Math.max(1, Math.floor(limit)) * 4));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
