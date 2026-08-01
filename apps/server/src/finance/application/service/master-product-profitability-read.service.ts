import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import type { ProductAbcCostBreakdown, ProductAbcCostStatus } from '@kiditem/shared/product-abc';
import {
  MASTER_PRODUCT_AD_SPEND_READ_PORT,
  type MasterProductAdSpendEvidence,
  type MasterProductAdSpendReadPort,
} from '../../../advertising/application/port/in/master-product-ad-spend-read.port';
import {
  MASTER_PRODUCT_PROFIT_FACT_READ_PORT,
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
const EXCLUDED_ORDER_STATUSES = ['cancelled', 'returned', 'refunded'] as const;

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
    const [sellpiaRead, paidOrders] = await Promise.all([
      this.readSellpiaFacts(input.organizationId, masterProductIds, sourceRange),
      this.readPaidOrders(input.organizationId, masterProductIds, input.asOfDate),
    ]);
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
      const orders = paidOrders.get(masterProductId) ?? [];
      const firstValidPaidSaleAt = orders[0] ?? null;
      const observationDays = firstValidPaidSaleAt
        ? kstCalendarDaysInclusive(firstValidPaidSaleAt, input.asOfDate)
        : 0;
      const monthlyFacts = (sellpia?.monthlyFacts ?? []).map((fact) =>
        toContributionFact(fact, ad, adStatus));
      return {
        masterProductId,
        asOfDate: sourceRange.to,
        firstValidPaidSaleAt,
        validPaidOrderDates: orders,
        paidOrderCount: orders.length,
        observationDays,
        eligibilityReached: observationDays >= 30 || orders.length >= 20,
        sellpiaStatus,
        adStatus,
        sellpiaCapturedAt: latestCapturedAt(sellpia?.monthlyFacts ?? []),
        advertisingCapturedAt: ad.capturedAt,
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
    evidence: readonly {
      masterProductId: string;
      mappingStatus: 'MAPPED' | 'UNMAPPED';
      monthlyFacts: readonly {
        coverageStartDate: Date;
        coverageEndDate: Date;
        yearMonth: string;
        coveredDays: number;
        revenue: number;
        sellpiaInAmount: number;
        sourceProductCodes: readonly string[];
        sourceOptionCodes: readonly string[];
        capturedAt: Date;
      }[];
    }[];
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
          mappingStatus: 'MAPPED' as const,
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

  private async readPaidOrders(
    organizationId: string,
    masterProductIds: readonly string[],
    asOfDate: Date,
  ): Promise<Map<string, Date[]>> {
    const rows = await this.prisma.orderLineItem.findMany({
      where: {
        organizationId,
        listingOption: {
          is: {
            organizationId,
            listing: { is: { organizationId, masterProductId: { in: [...masterProductIds] } } },
          },
        },
        order: {
          is: {
            organizationId,
            paidAt: { not: null, lte: asOfDate },
            status: { notIn: [...EXCLUDED_ORDER_STATUSES] },
          },
        },
      },
      select: {
        orderId: true,
        order: { select: { paidAt: true } },
        listingOption: { select: { listing: { select: { masterProductId: true } } } },
      },
    });
    const byMaster = new Map<string, Map<string, Date>>();
    for (const row of rows) {
      const masterProductId = row.listingOption?.listing.masterProductId;
      const paidAt = row.order.paidAt;
      if (!masterProductId || !paidAt) continue;
      const orders = byMaster.get(masterProductId) ?? new Map<string, Date>();
      orders.set(row.orderId, paidAt);
      byMaster.set(masterProductId, orders);
    }
    return new Map([...byMaster.entries()].map(([masterProductId, orders]) => [
      masterProductId,
      [...orders.values()].sort((left, right) => left.getTime() - right.getTime()),
    ]));
  }
}

function sellpiaStatusOf(
  evidence: { mappingStatus: 'MAPPED' | 'UNMAPPED'; monthlyFacts: readonly { coverageStartDate: Date; coverageEndDate: Date }[] } | undefined,
  expectedRange: { from: Date; to: Date },
): MasterProductSellpiaStatus {
  if (!evidence) return 'STALE';
  if (evidence.mappingStatus === 'UNMAPPED') return 'UNMAPPED';
  if (evidence.monthlyFacts.length === 0) return 'MISSING';
  return hasGapFreeCoverage(evidence.monthlyFacts, expectedRange) ? 'READY' : 'STALE';
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
    : null;
  const costBreakdown = buildCostBreakdown({
    revenue: fact.revenue,
    sellpiaInAmount: fact.sellpiaInAmount,
    adSpend,
    adStatus,
  });
  const contributionProfit = adSpend === null
    ? null
    : fact.revenue - fact.sellpiaInAmount - adSpend;
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
    negativeCoveredDays: contributionProfit === null ? null : contributionProfit < 0 ? fact.coveredDays : 0,
    lossGranularity: 'MONTH_INFERRED',
    sourceProductCodes: fact.sourceProductCodes,
    sourceOptionCodes: fact.sourceOptionCodes,
  };
}

function buildCostBreakdown(input: {
  revenue: number;
  sellpiaInAmount: number;
  adSpend: number | null;
  adStatus: MasterProductAdvertisingStatus;
}): ProductAbcCostBreakdown {
  return {
    recognizedRevenue: observedComponent(input.revenue, 'OBSERVED'),
    orderTimeCogs: observedComponent(input.sellpiaInAmount, 'OBSERVED'),
    advertisingSpend: input.adSpend === null
      ? unavailableAdComponent(input.adStatus)
      : observedComponent(input.adSpend, input.adStatus === 'CONFIRMED_ZERO' ? 'CONFIRMED_ZERO' : 'OBSERVED'),
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
  return { amount: null, status: status === 'STALE' ? 'STALE' : 'MISSING' } as const;
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

function kstEpochDay(date: Date): number {
  const shifted = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return Math.floor(Date.UTC(
    shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate(),
  ) / 86_400_000);
}
