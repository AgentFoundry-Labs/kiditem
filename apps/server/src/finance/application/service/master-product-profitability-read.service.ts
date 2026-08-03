import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import type { ProductAbcCostBreakdown, ProductAbcCostStatus } from '@kiditem/shared/product-abc';
import {
  MASTER_PRODUCT_AD_SPEND_READ_PORT,
  type MasterProductAdSpendEvidence,
  type MasterProductAdSpendReadPort,
} from '../../../advertising/application/port/in/master-product-ad-spend-read.port';
import {
  MASTER_PRODUCT_PROFIT_FACT_READ_PORT,
  type MasterProductProfitFactEvidence,
  type MasterProductProfitFactReadPort,
} from '../../../analytics/application/port/in/master-product-profit-fact-read.port';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  type MasterProductAdvertisingStatus,
  type MasterProductProfitabilityEvidence,
  type MasterProductProfitabilityReadPort,
  type MasterProductProfitabilityScope,
  type MasterProductSellpiaStatus,
  type MonthlyContributionFact,
} from '../port/in/master-product-profitability-read.port';

const DEFERRED_ZERO = { amount: 0, status: 'NOT_APPLIED' } as const;

@Injectable()
export class MasterProductProfitabilityReadService
  implements MasterProductProfitabilityReadPort
{
  constructor(
    @Inject(MASTER_PRODUCT_PROFIT_FACT_READ_PORT)
    private readonly sellpiaFacts: MasterProductProfitFactReadPort,
    @Inject(MASTER_PRODUCT_AD_SPEND_READ_PORT)
    private readonly adSpend: MasterProductAdSpendReadPort,
    private readonly prisma: PrismaService,
  ) {}

  async readMany(input: {
    organizationId: string;
    masterProductIds?: readonly string[];
    asOfDate: Date;
    scope: MasterProductProfitabilityScope;
  }): Promise<readonly MasterProductProfitabilityEvidence[]> {
    const masterProductIds = await this.resolveMasterProductIds(input);
    if (masterProductIds.length === 0) return [];
    const sourceRange = {
      from: addUtcDays(atUtcCalendarDay(input.asOfDate), -400),
      to: atUtcCalendarDay(input.asOfDate),
    };
    const sellpiaRead = await this.readSellpiaFacts(
      input.organizationId,
      masterProductIds,
      sourceRange,
    );
    const sellpiaSnapshot = sellpiaRead.evidence;
    const sellpiaByMaster = new Map(sellpiaSnapshot.map((evidence) => [
      evidence.masterProductId,
      evidence,
    ]));
    const adEvidenceByMaster = await this.readAdFacts({
      organizationId: input.organizationId,
      asOfDate: sourceRange.to,
      sellpiaSnapshot,
    });

    return masterProductIds.map((masterProductId) => {
      const sellpia = sellpiaByMaster.get(masterProductId);
      const sellpiaStatus = sellpiaRead.failed
        ? 'STALE'
        : sellpiaStatusOf(sellpia, sourceRange);
      const ad = adEvidenceByMaster.get(masterProductId) ?? missingAdEvidence(masterProductId);
      const adStatus = toAdvertisingStatus(ad.status);
      const monthlyFacts = (sellpia?.monthlyFacts ?? []).map((fact) =>
        toContributionFact(fact, ad, adStatus));
      const observationDays = profitabilityObservationDays(monthlyFacts, input.asOfDate);
      return {
        masterProductId,
        asOfDate: sourceRange.to,
        firstValidPaidSaleAt: null,
        validPaidOrderDates: [],
        paidOrderCount: 0,
        observationDays,
        eligibilityReached: true,
        sellpiaStatus,
        adStatus,
        sellpiaCapturedAt: latestCapturedAt(sellpia?.monthlyFacts ?? []),
        advertisingCapturedAt: ad.capturedAt,
        advertisingCoverageStartDate: ad.coverageStartDate,
        advertisingCoverageEndDate: ad.coverageEndDate,
        ordersStatus: 'NOT_APPLIED',
        ordersCoverageStartDate: null,
        ordersCoverageEndDate: null,
        ordersCapturedAt: null,
        orderLinkedLineCount: 0,
        orderUnlinkedLineCount: 0,
        mappingStatus: mappingStatusOf(sellpia),
        mappingInventoryGeneration: sellpia?.mappingInventoryGeneration ?? null,
        mappingVerifiedAt: sellpia?.mappingVerifiedAt ?? null,
        monthlyFacts,
      } satisfies MasterProductProfitabilityEvidence;
    });
  }

  private async resolveMasterProductIds(input: {
    organizationId: string;
    masterProductIds?: readonly string[];
    scope: MasterProductProfitabilityScope;
  }): Promise<string[]> {
    const supplied = [...new Set(input.masterProductIds ?? [])];
    if (input.scope === 'ACTIVE_EVALUATION') {
      if (supplied.length === 0) {
        throw new BadRequestException('Active profitability evaluation requires explicit master product IDs');
      }
      return supplied;
    }
    if (supplied.length > 0) return supplied;
    const masters = await this.prisma.masterProduct.findMany({
      where: { organizationId: input.organizationId },
      select: { id: true },
    });
    return masters.map((master) => master.id).sort();
  }

  private async readSellpiaFacts(
    organizationId: string,
    masterProductIds: readonly string[],
    range: { from: Date; to: Date },
  ): Promise<{
    failed: boolean;
    evidence: readonly MasterProductProfitFactEvidence[];
  }> {
    try {
      const snapshot = await this.sellpiaFacts.readProfitFacts({
        organizationId,
        masterProductIds,
        range,
      });
      return { failed: false, evidence: snapshot.evidence };
    } catch {
      return {
        failed: true,
        evidence: masterProductIds.map((masterProductId) => ({
          masterProductId,
          mappingStatus: 'STALE' as const,
          mappingInventoryGeneration: null,
          mappingVerifiedAt: null,
          monthlyFacts: [],
        })),
      };
    }
  }

  private async readAdFacts(input: {
    organizationId: string;
    asOfDate: Date;
    sellpiaSnapshot: readonly { masterProductId: string; monthlyFacts: readonly { coverageStartDate: Date; coverageEndDate: Date }[] }[];
  }): Promise<Map<string, MasterProductAdSpendEvidence>> {
    const requests = input.sellpiaSnapshot.map((evidence) => ({
      masterProductId: evidence.masterProductId,
      coverage: evidence.monthlyFacts.map((fact) => ({
        startDate: fact.coverageStartDate,
        endDate: fact.coverageEndDate,
      })),
    }));
    try {
      const rows = await this.adSpend.readDailyAdSpend({
        organizationId: input.organizationId,
        requests,
        asOfDate: input.asOfDate,
      });
      return new Map(rows.map((row) => [row.masterProductId, row]));
    } catch {
      return new Map(requests.map((request) => [
        request.masterProductId,
        { ...missingAdEvidence(request.masterProductId), status: 'STALE' as const },
      ]));
    }
  }

}

function sellpiaStatusOf(
  evidence: MasterProductProfitFactEvidence | undefined,
  expectedRange: { from: Date; to: Date },
): MasterProductSellpiaStatus {
  if (!evidence) return 'STALE';
  if (evidence.mappingStatus === 'UNMAPPED' || evidence.mappingStatus === 'AMBIGUOUS') return 'UNMAPPED';
  if (evidence.monthlyFacts.length === 0) return 'MISSING';
  return hasGapFreeCoverage(evidence.monthlyFacts, expectedRange) ? 'READY' : 'STALE';
}

function mappingStatusOf(evidence: MasterProductProfitFactEvidence | undefined) {
  switch (evidence?.mappingStatus) {
    case 'MAPPED': return 'READY' as const;
    case 'UNMAPPED': return 'UNMAPPED' as const;
    case 'AMBIGUOUS': return 'AMBIGUOUS' as const;
    case 'STALE':
    default: return 'STALE' as const;
  }
}

function hasGapFreeCoverage(
  facts: readonly { coverageStartDate: Date; coverageEndDate: Date }[],
  expectedRange: { from: Date; to: Date },
): boolean {
  const ranges = facts
    .map((fact) => ({ start: atUtcCalendarDay(fact.coverageStartDate), end: atUtcCalendarDay(fact.coverageEndDate) }))
    .sort((left, right) => left.start.getTime() - right.start.getTime());
  let cursor = atUtcCalendarDay(expectedRange.from);
  const end = atUtcCalendarDay(expectedRange.to);
  for (const range of ranges) {
    if (range.end < cursor) continue;
    if (range.start > cursor) return false;
    cursor = addUtcDays(range.end, 1);
    if (cursor > end) return true;
  }
  return cursor > end;
}

function toAdvertisingStatus(status: MasterProductAdSpendEvidence['status']): MasterProductAdvertisingStatus {
  switch (status) {
    case 'OBSERVED': return 'READY';
    case 'CONFIRMED_ZERO': return 'CONFIRMED_ZERO';
    case 'STALE': return 'STALE';
    case 'MISSING': return 'MISSING';
  }
}

function toContributionFact(
  fact: {
    yearMonth: string; coverageStartDate: Date; coverageEndDate: Date; coveredDays: number;
    revenue: number; sellpiaInAmount: number; sourceProductCodes: readonly string[]; sourceOptionCodes: readonly string[];
  },
  ad: MasterProductAdSpendEvidence,
  adStatus: MasterProductAdvertisingStatus,
): MonthlyContributionFact {
  const adSpend = adStatus === 'READY' || adStatus === 'CONFIRMED_ZERO'
    ? ad.dailyFacts
      .filter((daily) => daily.businessDate >= fact.coverageStartDate && daily.businessDate <= fact.coverageEndDate)
      .reduce((sum, daily) => sum + daily.adSpend, 0)
    : 0;
  const costBreakdown = buildCostBreakdown({
    revenue: fact.revenue,
    sellpiaInAmount: fact.sellpiaInAmount,
    adSpend,
    adStatus,
  });
  const contributionProfit = fact.revenue - fact.sellpiaInAmount - adSpend;
  return {
    yearMonth: fact.yearMonth,
    coverageStartDate: fact.coverageStartDate,
    coverageEndDate: fact.coverageEndDate,
    coveredDays: fact.coveredDays,
    coverageMidpointEpochDay: (epochDay(fact.coverageStartDate) + epochDay(fact.coverageEndDate)) / 2,
    revenue: fact.revenue,
    sellpiaInAmount: fact.sellpiaInAmount,
    adSpend,
    costBreakdown,
    contributionProfit,
    negativeCoveredDays: contributionProfit < 0 ? fact.coveredDays : 0,
    lossGranularity: 'MONTH_INFERRED',
    sourceProductCodes: fact.sourceProductCodes,
    sourceOptionCodes: fact.sourceOptionCodes,
  };
}

function buildCostBreakdown(input: {
  revenue: number;
  sellpiaInAmount: number;
  adSpend: number;
  adStatus: MasterProductAdvertisingStatus;
}): ProductAbcCostBreakdown {
  return {
    recognizedRevenue: observedComponent(input.revenue, 'OBSERVED'),
    orderTimeCogs: observedComponent(input.sellpiaInAmount, 'OBSERVED'),
    advertisingSpend: input.adStatus === 'READY' || input.adStatus === 'CONFIRMED_ZERO'
      ? observedComponent(input.adSpend, input.adStatus === 'CONFIRMED_ZERO' ? 'CONFIRMED_ZERO' : 'OBSERVED')
      : unavailableAdComponent(input.adStatus),
    marketplaceCommission: DEFERRED_ZERO,
    outboundFulfillment: DEFERRED_ZERO,
    returnLoss: DEFERRED_ZERO,
    otherVariableCost: DEFERRED_ZERO,
  };
}

function observedComponent(amount: number, status: Extract<ProductAbcCostStatus, 'OBSERVED' | 'CONFIRMED_ZERO'>) {
  return { amount, status } as const;
}

function unavailableAdComponent(status: MasterProductAdvertisingStatus) {
  return { amount: 0, status: status === 'STALE' ? 'STALE' : 'MISSING' } as const;
}

function missingAdEvidence(masterProductId: string): MasterProductAdSpendEvidence {
  return {
    masterProductId,
    status: 'MISSING',
    coverageStartDate: null,
    coverageEndDate: null,
    capturedAt: null,
    dailyFacts: [],
  };
}

function latestCapturedAt(facts: readonly { capturedAt: Date }[]): Date | null {
  if (facts.length === 0) return null;
  return new Date(Math.max(...facts.map((fact) => fact.capturedAt.getTime())));
}

function atUtcCalendarDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addUtcDays(date: Date, days: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + days));
}

function epochDay(date: Date): number {
  return Math.floor(atUtcCalendarDay(date).getTime() / 86_400_000);
}

function kstCalendarDaysInclusive(first: Date, asOf: Date): number {
  const firstKst = kstEpochDay(first);
  const asOfKst = kstEpochDay(asOf);
  return Math.max(0, asOfKst - firstKst + 1);
}

function profitabilityObservationDays(
  facts: readonly MonthlyContributionFact[],
  asOfDate: Date,
): number {
  const observedStarts = facts
    .filter((fact) => fact.revenue > 0 || fact.sellpiaInAmount > 0)
    .map((fact) => fact.coverageStartDate.getTime());
  if (observedStarts.length === 0) return 0;
  return kstCalendarDaysInclusive(new Date(Math.min(...observedStarts)), asOfDate);
}

function kstEpochDay(date: Date): number {
  const shifted = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return Math.floor(Date.UTC(
    shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate(),
  ) / 86_400_000);
}
