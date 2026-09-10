import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { classifyDailyTrafficFact } from '@kiditem/shared/advertising';
import {
  MASTER_PRODUCT_PROFITABILITY_READ_PORT,
  type ProfitabilityEvidence,
  type SourceGenerationView,
} from '../../../../finance/application/port/in/master-product-profitability-read.port';
import { PrismaService } from '../../../../prisma/prisma.service';
import { listSellingMasterProductIds } from './selling-master-product.query';
import type {
  ProductOperationsDataStatusFacts,
  ProductOperationsDataStatusRepositoryPort,
} from '../../../application/port/out/repository/product-operations-data-status.repository.port';
import type {
  ProductOperationsDataSourceStatus,
  ProductOperationsPeriodDays,
} from '@kiditem/shared/product-operations';

type TrafficFact = {
  businessDate: Date;
  lastObservedAt: Date;
  trafficObservedAt: Date | null;
  metaJson: Prisma.JsonValue | null;
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
    // Read the cheap status inputs first, then open the profitability snapshot.
    // The latter fans out to repeatable-read source transactions; keeping it
    // out of this batch prevents one list request from occupying every pool
    // connection with independent read snapshots.
    const [traffic, formulaState, sellingMasterProductIds] = await Promise.all([
      this.prisma.channelListingDailySnapshot.findMany({
        where: {
          organizationId,
          businessDate: {
            gte: periodStart,
            lte: utcCalendarDate(cutoffDate),
          },
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
        select: {
          businessDate: true,
          metaJson: true,
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
    ]);
    const evidence = await this.evidence.load({ organizationId, targetCutoff: cutoffDate });
    const trafficStatus = sourceStatus(traffic, calendarDate(periodStart), cutoffDate);
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
        saleStartDate: productEvidence.get(product.id)?.saleStartDate ?? null,
      })),
    };
  }
}

function sourceStatus(
  rows: readonly TrafficFact[],
  periodStart: string,
  cutoffDate: string,
): ProductOperationsDataSourceStatus {
  const validRows = rows.filter((row) =>
    calendarDate(row.businessDate) >= periodStart
      && calendarDate(row.businessDate) <= cutoffDate
      && classifyDailyTrafficFact(row.metaJson, calendarDate(row.businessDate)) !== null,
  );
  if (validRows.length === 0) {
    return {
      status: 'MISSING',
      actualCutoff: null,
      capturedAt: null,
      latestAttemptState: null,
      errorCode: null,
    };
  }
  const latestDate = validRows.reduce(
    (latest, row) => row.businessDate > latest ? row.businessDate : latest,
    validRows[0]!.businessDate,
  );
  const capturedAt = validRows.reduce(
    (latest, row) => {
      const observedAt = row.trafficObservedAt ?? row.lastObservedAt;
      return observedAt > latest ? observedAt : latest;
    },
    validRows[0]!.trafficObservedAt ?? validRows[0]!.lastObservedAt,
  );
  const actualCutoff = calendarDate(latestDate);
  const targetDates = enumerateDates(periodStart, cutoffDate);
  const validDates = new Set(validRows.map((row) => calendarDate(row.businessDate)));
  const completeCoverage = targetDates.every((date) => validDates.has(date));
  return {
    status: actualCutoff >= cutoffDate && completeCoverage ? 'READY' : 'STALE',
    actualCutoff,
    capturedAt: capturedAt.toISOString(),
    latestAttemptState: null,
    errorCode: null,
  };
}

function enumerateDates(from: string, to: string): string[] {
  const dates: string[] = [];
  const cursor = utcCalendarDate(from);
  const end = utcCalendarDate(to);
  while (cursor <= end) {
    dates.push(calendarDate(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
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
