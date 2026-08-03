import { Injectable } from '@nestjs/common';
import type {
  ProductOperationsDataSourceStatus,
  ProductOperationsPeriodDays,
} from '@kiditem/shared/product-operations';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  ProductOperationsDataStatusFacts,
  ProductOperationsDataStatusRepositoryPort,
} from '../../../application/port/out/repository/product-operations-data-status.repository.port';

type SourceAggregate = {
  _min: { businessDate: Date | null };
  _max: {
    businessDate: Date | null;
    lastObservedAt: Date | null;
    trafficObservedAt?: Date | null;
    adObservedAt?: Date | null;
  };
};

@Injectable()
export class ProductOperationsDataStatusRepositoryAdapter
implements ProductOperationsDataStatusRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async read(
    organizationId: string,
    periodDays: ProductOperationsPeriodDays,
  ): Promise<ProductOperationsDataStatusFacts> {
    const cutoffDate = yesterdayKst();
    const periodStart = utcCalendarDate(addCalendarDays(cutoffDate, -(periodDays - 1)));
    const listingScope = {
      organizationId,
      businessDate: { gte: periodStart },
      listing: { is: { organizationId, masterProductId: { not: null } } },
    } as const;

    const [traffic, advertising, sellpia, products] = await Promise.all([
      this.prisma.channelListingDailySnapshot.aggregate({
        where: {
          ...listingScope,
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
        _min: { businessDate: true },
        _max: { businessDate: true, trafficObservedAt: true, lastObservedAt: true },
      }),
      this.prisma.channelListingDailySnapshot.aggregate({
        where: {
          ...listingScope,
          OR: [
            { adCoverageStatus: { not: null } },
            { adSpend: { not: 0 } },
          ],
        },
        _min: { businessDate: true },
        _max: { businessDate: true, adObservedAt: true, lastObservedAt: true },
      }),
      this.prisma.sellpiaProductMonthlySales.aggregate({
        where: { organizationId },
        _max: { coverageEndDate: true, capturedAt: true },
      }),
      this.prisma.masterProduct.findMany({
        where: { organizationId, isActive: true },
        select: {
          abcGrade: true,
          abcEvaluation: {
            select: {
              calculationStatus: true,
              evaluationCutoffDate: true,
              sourceCoverageEndDate: true,
              calculatedAt: true,
            },
          },
        },
      }),
    ]);

    const trafficSource = dailySource(traffic as SourceAggregate, 'traffic', cutoffDate);
    const advertisingSource = dailySource(
      advertising as SourceAggregate,
      'advertising',
      cutoffDate,
    );
    const sellpiaSource = sourceStatus({
      coverageEndDate: sellpia._max.coverageEndDate,
      capturedAt: sellpia._max.capturedAt,
      cutoffDate,
    });
    const abcCoverage = products.reduce<Date | null>((earliest, product) => {
      const date = product.abcEvaluation?.evaluationCutoffDate
        ?? product.abcEvaluation?.sourceCoverageEndDate
        ?? null;
      return date && (!earliest || date < earliest) ? date : earliest;
    }, null);
    const abcCaptured = products.reduce<Date | null>((latest, product) => {
      const date = product.abcEvaluation?.calculatedAt ?? null;
      return date && (!latest || date > latest) ? date : latest;
    }, null);
    const abcSource = sourceStatus({
      coverageEndDate: abcCoverage,
      capturedAt: abcCaptured,
      cutoffDate,
    });
    const classifiedProductCount = products.filter(({ abcGrade }) =>
      abcGrade === 'A' || abcGrade === 'B' || abcGrade === 'C').length;
    const unclassifiedProductCount = products.length - classifiedProductCount;
    const mappingRequiredProductCount = products.filter(({ abcGrade, abcEvaluation }) =>
      abcGrade === null && abcEvaluation?.calculationStatus === 'SOURCE_UNMAPPED').length;
    // Kept in the public response only for compatibility with clients built
    // against the previous contract. Orders no longer block ABC calculation.
    const orderEvidenceRequiredProductCount = 0;
    const displayDates = [
      trafficSource.coverageEndDate,
      advertisingSource.coverageEndDate,
      sellpiaSource.coverageEndDate,
      abcSource.coverageEndDate,
    ].filter((date): date is string => date !== null);

    return {
      displayDataAsOf: displayDates.length > 0
        ? displayDates.reduce((earliest, date) => date < earliest ? date : earliest)
        : null,
      sources: {
        traffic: trafficSource,
        advertising: advertisingSource,
        sellpiaProfit: sellpiaSource,
        abc: abcSource,
      },
      abcSummary: {
        classifiedProductCount,
        unclassifiedProductCount,
        mappingRequiredProductCount,
        orderEvidenceRequiredProductCount,
        otherPendingProductCount: Math.max(
          0,
          unclassifiedProductCount
            - mappingRequiredProductCount
            - orderEvidenceRequiredProductCount,
        ),
      },
    };
  }
}

function dailySource(
  aggregate: SourceAggregate,
  source: 'traffic' | 'advertising',
  cutoffDate: string,
): ProductOperationsDataSourceStatus {
  return sourceStatus({
    coverageEndDate: aggregate._max.businessDate,
    capturedAt: source === 'traffic'
      ? aggregate._max.trafficObservedAt ?? aggregate._max.lastObservedAt
      : aggregate._max.adObservedAt ?? aggregate._max.lastObservedAt,
    cutoffDate,
  });
}

function sourceStatus(input: {
  coverageEndDate: Date | null;
  capturedAt: Date | null;
  cutoffDate: string;
}): ProductOperationsDataSourceStatus {
  if (!input.coverageEndDate || !input.capturedAt) {
    return {
      status: 'NOT_COLLECTED',
      coverageEndDate: null,
      capturedAt: null,
      lastErrorAt: null,
    };
  }
  const coverageEndDate = calendarDate(input.coverageEndDate);
  return {
    status: coverageEndDate >= input.cutoffDate ? 'CURRENT' : 'OUTDATED',
    coverageEndDate,
    capturedAt: input.capturedAt.toISOString(),
    lastErrorAt: null,
  };
}

function yesterdayKst(now = new Date()): string {
  const shifted = new Date(now.getTime() + (9 * 60 * 60 * 1000) - 86_400_000);
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
