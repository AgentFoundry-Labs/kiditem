import { Injectable } from '@nestjs/common';
import type {
  ProductOperationsDataSourceStatus,
  ProductOperationsPeriodDays,
} from '@kiditem/shared/product-operations';
import {
  PRODUCT_ABC_ABSOLUTE_V1_AD_SOURCE_POLICY_HASH,
} from '@kiditem/shared/product-abc';
import { PrismaService } from '../../../../prisma/prisma.service';
import { kstMonthEnd } from '../../../../common/kst';
import type {
  ProductOperationsDataStatusFacts,
  ProductOperationsDataStatusRepositoryPort,
} from '../../../application/port/out/repository/product-operations-data-status.repository.port';
import { listSellingMasterProductIds } from './selling-master-product.query';

type TrafficAggregate = {
  _max: {
    businessDate: Date | null;
    lastObservedAt: Date | null;
    trafficObservedAt: Date | null;
  };
};

type SourceRun = {
  id: string;
  status: string;
  publicationSequence: bigint | null;
  coverageStartDate: Date | null;
  coverageEndDate: Date | null;
  coveredMonths: string[];
  importedAt: Date | null;
  updatedAt: Date;
  expiresAt?: Date | null;
  errorCode: string | null;
  mappingGeneration: bigint | null;
  adSourcePolicyHash: string | null;
};

const SOURCE_TYPES = {
  sellpia: 'sellpia_product_profitability',
  advertising: 'coupang_ad_profitability',
} as const;

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
    const [traffic, formulaState, sellingMasterProductIds] = await Promise.all([
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
    ]);
    const trafficStatus = sourceStatus(traffic as TrafficAggregate, cutoffDate);
    const targetCutoff = previousKstMonthEnd();
    const mappingGeneration = formulaState?.mappingGeneration ?? 0n;
    const [sellpiaFacts, advertisingFacts, products] = await Promise.all([
      this.readSourceStatus(
        organizationId,
        SOURCE_TYPES.sellpia,
        mappingGeneration,
        targetCutoff,
      ),
      this.readSourceStatus(
        organizationId,
        SOURCE_TYPES.advertising,
        mappingGeneration,
        targetCutoff,
      ),
      this.prisma.masterProduct.findMany({
        where: { organizationId, id: { in: sellingMasterProductIds } },
        orderBy: { id: 'asc' },
        select: {
          id: true,
          abcGrade: true,
          _count: { select: { inventorySkus: true } },
        },
      }),
    ]);
    const sellpia = sellpiaFacts.status;
    const advertising = advertisingFacts.status;

    const actualCutoff = minimumCutoff(sellpia.actualCutoff, advertising.actualCutoff);
    return {
      displayDataAsOf: minimumCutoff(trafficStatus.actualCutoff, actualCutoff),
      traffic: trafficStatus,
      actualCutoff,
      sellpia,
      advertising,
      sourceVector: {
        sellpia: sellpiaFacts.manifest,
        advertising: advertisingFacts.manifest,
      },
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
        mappingValid: product._count.inventorySkus > 0,
      })),
    };
  }

  private async readSourceStatus(
    organizationId: string,
    sourceType: string,
    mappingGeneration: bigint,
    targetCutoff: string,
  ) {
    const select = {
      id: true,
      status: true,
      publicationSequence: true,
      coverageStartDate: true,
      coverageEndDate: true,
      coveredMonths: true,
      importedAt: true,
      updatedAt: true,
      expiresAt: true,
      errorCode: true,
      mappingGeneration: true,
      adSourcePolicyHash: true,
    } as const;
    const [latestAttempt, latestComplete] = await Promise.all([
      this.prisma.sourceImportRun.findFirst({
        where: { organizationId, sourceType },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select,
      }),
      this.prisma.sourceImportRun.findFirst({
        where: {
          organizationId,
          sourceType,
          status: 'completed',
          publicationSequence: { not: null },
        },
        orderBy: [{ publicationSequence: 'desc' }, { id: 'desc' }],
        select,
      }),
    ]);
    const complete = latestComplete as SourceRun | null;
    return {
      status: profitabilitySourceStatus(
      latestAttempt as SourceRun | null,
      complete,
      targetCutoff,
      mappingGeneration,
      sourceType === SOURCE_TYPES.advertising,
      ),
      manifest: sourceManifest(complete),
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

function profitabilitySourceStatus(
  latestAttempt: SourceRun | null,
  latestComplete: SourceRun | null,
  targetCutoff: string,
  mappingGeneration: bigint,
  advertising: boolean,
): ProductOperationsDataSourceStatus {
  const latestAttemptState = attemptState(latestAttempt);
  const manifest = sourceManifest(latestComplete);
  if (!manifest || !latestComplete) {
    return {
      status: 'MISSING',
      actualCutoff: null,
      capturedAt: null,
      latestAttemptState,
      errorCode: attemptErrorCode(latestAttempt, latestAttemptState),
    };
  }
  const coverageEndDate = manifest.coverageEndDate;
  const actualCutoff = coverageEndDate < targetCutoff ? coverageEndDate : targetCutoff;
  return {
    status: latestAttemptState === 'COMPLETE'
      && latestAttempt?.id === latestComplete.id
      && latestComplete.mappingGeneration === mappingGeneration
      && (!advertising
        || latestComplete.adSourcePolicyHash
          === PRODUCT_ABC_ABSOLUTE_V1_AD_SOURCE_POLICY_HASH)
      && coverageEndDate >= targetCutoff
      ? 'READY'
      : 'STALE',
    actualCutoff,
    capturedAt: (latestComplete.importedAt ?? latestComplete.updatedAt).toISOString(),
    latestAttemptState,
    errorCode: attemptErrorCode(latestAttempt, latestAttemptState),
  };
}

function sourceManifest(run: SourceRun | null) {
  if (!run
    || run.publicationSequence === null
    || run.mappingGeneration === null
    || !run.coverageStartDate
    || !run.coverageEndDate) return null;
  return {
    sourceImportRunId: run.id,
    generation: run.publicationSequence.toString(),
    mappingGeneration: run.mappingGeneration.toString(),
    coverageStartDate: calendarDate(run.coverageStartDate),
    coverageEndDate: calendarDate(run.coverageEndDate),
    coveredMonths: run.coveredMonths,
    capturedAt: (run.importedAt ?? run.updatedAt).toISOString(),
  };
}

function attemptState(run: SourceRun | null): 'RUNNING' | 'COMPLETE' | 'FAILED' | null {
  if (!run) return null;
  if (run.status === 'completed') return 'COMPLETE';
  if (run.status === 'failed' || (run.status === 'running'
    && run.expiresAt !== undefined
    && run.expiresAt !== null
    && run.expiresAt <= new Date())) return 'FAILED';
  return 'RUNNING';
}

function attemptErrorCode(
  run: SourceRun | null,
  state: 'RUNNING' | 'COMPLETE' | 'FAILED' | null,
): string | null {
  if (state !== 'FAILED') return null;
  return run?.errorCode ?? 'ATTEMPT_EXPIRED';
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
