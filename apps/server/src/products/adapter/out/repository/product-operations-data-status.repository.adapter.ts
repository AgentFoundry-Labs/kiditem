import { Inject, Injectable } from '@nestjs/common';
import {
  MASTER_PRODUCT_PROFITABILITY_READ_PORT,
  type ProfitabilityEvidence,
  type SourceGenerationView,
} from '../../../../finance/application/port/in/master-product-profitability-read.port';
import { PrismaService } from '../../../../prisma/prisma.service';
import { kstMonthEnd } from '../../../../common/kst';
import { listSellingMasterProductIds } from './selling-master-product.query';
import type {
  ProductOperationsDataStatusFacts,
  ProductOperationsDataStatusRepositoryPort,
} from '../../../application/port/out/repository/product-operations-data-status.repository.port';
import type {
  ProductOperationsDataSourceStatus,
  ProductOperationsPeriodDays,
} from '@kiditem/shared/product-operations';

type TrafficAggregate = {
  _max: {
    businessDate: Date | null;
    lastObservedAt: Date | null;
    trafficObservedAt: Date | null;
  };
};

@Injectable()
export class ProductOperationsDataStatusRepositoryAdapter
implements ProductOperationsDataStatusRepositoryPort {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(MASTER_PRODUCT_PROFITABILITY_READ_PORT)
    private readonly evidence: ProfitabilityEvidence,
  ) {}

  async read(
    organizationId: string,
    periodDays: ProductOperationsPeriodDays,
  ): Promise<ProductOperationsDataStatusFacts> {
    const cutoffDate = yesterdayKst();
    const periodStart = utcCalendarDate(addCalendarDays(cutoffDate, -(periodDays - 1)));
    const [traffic, formulaState, sellingMasterProductIds, evidence] = await Promise.all([
      this.prisma.channelListingDailySnapshot.aggregate({
        where: {
          organizationId,
          businessDate: { gte: periodStart },
          listing: { is: { organizationId, masterProductId: { not: null } } },
          OR: [
            { trafficCoverageStatus: { not: null } },
            { trafficVisitors: { not: 0 } },
            { trafficViews: { not: 0 } },
            { trafficCartAdds: { not: 0 } },
            { trafficOrders: { not: 0 } },
            { trafficSalesQty: { not: 0 } },
            { trafficRevenue: { not: 0 } },
          ],
        },
        _max: {
          businessDate: true,
          trafficObservedAt: true,
          lastObservedAt: true,
        },
      }),
      this.prisma.masterProductAbcFormulaState.findUnique({
        where: { organizationId },
        select: {
          formulaRevision: true,
          publicationRevision: true,
          officialCutoffDate: true,
          publishedAt: true,
          mappingGeneration: true,
        },
      }),
      listSellingMasterProductIds(this.prisma, organizationId),
      this.evidence.load({ organizationId, targetCutoff: previousKstMonthEnd() }),
    ]);
    const trafficStatus = sourceStatus(traffic as TrafficAggregate, cutoffDate);
    const mappingGeneration = formulaState?.mappingGeneration ?? 0n;
    const products = await this.prisma.masterProduct.findMany({
      where: { organizationId, id: { in: sellingMasterProductIds } },
      orderBy: { id: 'asc' },
      select: { id: true, abcGrade: true },
    });
    const productEvidence = new Map(evidence.products.map((product) => [product.masterProductId, product]));
    const actualCutoff = evidence.actualCutoff;
    return {
      displayDataAsOf: minimumCutoff(trafficStatus.actualCutoff, actualCutoff),
      traffic: trafficStatus,
      actualCutoff,
      sellpia: { ...evidence.sources.sellpia, capturedAt: evidence.sourceVector.sellpia.capturedAt },
      advertising: { ...evidence.sources.advertising, capturedAt: evidence.sourceVector.advertising.capturedAt },
      sourceVector: {
        sellpia: sourceManifest(evidence.sourceVector.sellpia),
        advertising: sourceManifest(evidence.sourceVector.advertising),
      },
      mappingReady: evidence.mappingGeneration === mappingGeneration.toString(),
      contributionBasis: evidence.contributionBasis,
      formulaState: {
        formulaRevision: formulaState?.formulaRevision ?? 0,
        publicationRevision: formulaState?.publicationRevision ?? 0,
        officialCutoff: formulaState?.officialCutoffDate
          ? calendarDate(formulaState.officialCutoffDate)
          : null,
        publishedAt: formulaState?.publishedAt?.toISOString() ?? null,
        mappingGeneration: mappingGeneration.toString(),
      },
      products: products.map((product) => ({
        masterProductId: product.id,
        abcGrade: isAbcGrade(product.abcGrade) ? product.abcGrade : null,
        mappingValid: productEvidence.get(product.id)?.mappingValid ?? false,
      })),
    };
  }
}

function sourceStatus(
  aggregate: TrafficAggregate,
  cutoffDate: string,
): ProductOperationsDataSourceStatus {
  const capturedAt = aggregate._max.trafficObservedAt ?? aggregate._max.lastObservedAt;
  if (!aggregate._max.businessDate || !capturedAt) {
    return {
      status: 'MISSING',
      actualCutoff: null,
      capturedAt: null,
      latestAttemptState: null,
      errorCode: null,
    };
  }
  const actualCutoff = calendarDate(aggregate._max.businessDate);
  return {
    status: actualCutoff >= cutoffDate ? 'READY' : 'STALE',
    actualCutoff,
    capturedAt: capturedAt.toISOString(),
    latestAttemptState: null,
    errorCode: null,
  };
}

function sourceManifest(source: SourceGenerationView) {
  if (!source.sourceImportRunId || source.publicationSequence === null
    || source.mappingGeneration === null || !source.coverageStartDate
    || !source.coverageEndDate || !source.capturedAt) return null;
  return {
    sourceImportRunId: source.sourceImportRunId,
    generation: source.publicationSequence,
    mappingGeneration: source.mappingGeneration,
    coverageStartDate: source.coverageStartDate,
    coverageEndDate: source.coverageEndDate,
    capturedAt: source.capturedAt,
  };
}

function minimumCutoff(left: string | null, right: string | null): string | null {
  if (!left || !right) return null;
  return left < right ? left : right;
}

function isAbcGrade(value: string | null): value is 'A' | 'B' | 'C' {
  return value === 'A' || value === 'B' || value === 'C';
}

function yesterdayKst(now = new Date()): string {
  const shifted = new Date(now.getTime() + (9 * 60 * 60 * 1_000) - 86_400_000);
  return shifted.toISOString().slice(0, 10);
}

function previousKstMonthEnd(now = new Date()): string {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1_000);
  const year = kst.getUTCMonth() === 0
    ? kst.getUTCFullYear() - 1
    : kst.getUTCFullYear();
  const month = kst.getUTCMonth() === 0 ? 12 : kst.getUTCMonth();
  return kstMonthEnd(`${year}-${String(month).padStart(2, '0')}`);
}

function addCalendarDays(date: string, days: number): string {
  const value = utcCalendarDate(date);
  value.setUTCDate(value.getUTCDate() + days);
  return calendarDate(value);
}

function utcCalendarDate(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

function calendarDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
