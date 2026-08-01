import { describe, expect, it, vi } from 'vitest';
import { MasterProductProfitabilityReadService } from './master-product-profitability-read.service';

const ORGANIZATION_ID = '00000000-0000-4000-8000-000000000001';
const MASTER_ID = '00000000-0000-4000-8000-000000000002';
const AS_OF = new Date('2026-07-15T00:00:00.000Z');

function sourceFact(overrides: Partial<{
  revenue: number; sellpiaInAmount: number; coverageStartDate: Date; coverageEndDate: Date;
}> = {}) {
  const coverageEndDate = new Date(AS_OF);
  const coverageStartDate = new Date(coverageEndDate.getTime() - 400 * 86_400_000);
  return {
    masterProductId: MASTER_ID,
    yearMonth: '2026-07',
    coverageStartDate,
    coverageEndDate,
    coveredDays: 401,
    revenue: 1_000,
    sellpiaInAmount: 400,
    sourceProductCodes: ['SELLPIA-1'],
    sourceOptionCodes: [''],
    capturedAt: new Date('2026-07-16T00:00:00.000Z'),
    ...overrides,
  };
}

function paidOrder(orderId: string, paidAt: string) {
  return {
    orderId,
    order: { paidAt: new Date(paidAt) },
    listingOption: { listing: { masterProductId: MASTER_ID } },
  };
}

function makeService(input: {
  sellpia?: unknown;
  ad?: unknown;
  orders?: unknown[];
  masters?: unknown[];
} = {}) {
  const sellpiaFacts = {
    readProfitFacts: vi.fn().mockResolvedValue(input.sellpia ?? {
      evidence: [{ masterProductId: MASTER_ID, mappingStatus: 'MAPPED', monthlyFacts: [sourceFact()] }],
      orphanFacts: [],
    }),
  };
  const adSpend = {
    readDailyAdSpend: vi.fn().mockResolvedValue(input.ad ?? [{
      masterProductId: MASTER_ID,
      status: 'OBSERVED',
      coverageStartDate: sourceFact().coverageStartDate,
      coverageEndDate: AS_OF,
      capturedAt: new Date('2026-07-16T00:00:00.000Z'),
      dailyFacts: [{ businessDate: AS_OF, adSpend: 100 }],
    }]),
  };
  const prisma = {
    orderLineItem: { findMany: vi.fn().mockResolvedValue(input.orders ?? []) },
    masterProduct: { findMany: vi.fn().mockResolvedValue(input.masters ?? []) },
  };
  const Service = MasterProductProfitabilityReadService as unknown as new (
    sellpiaFacts: unknown, adSpend: unknown, prisma: unknown,
  ) => MasterProductProfitabilityReadService;
  return { service: new Service(sellpiaFacts, adSpend, prisma), sellpiaFacts, adSpend, prisma };
}

describe('MasterProductProfitabilityReadService', () => {
  it('uses distinct paid orders for eligibility and emits all seven contribution-cost components', async () => {
    const { service, prisma } = makeService({
      orders: [
        paidOrder('order-1', '2026-06-16T00:00:00.000Z'),
        paidOrder('order-1', '2026-06-16T00:00:00.000Z'),
      ],
    });

    const [evidence] = await service.readMany({
      organizationId: ORGANIZATION_ID,
      masterProductIds: [MASTER_ID],
      asOfDate: AS_OF,
      scope: 'ACTIVE_EVALUATION',
    });

    expect(evidence).toMatchObject({
      masterProductId: MASTER_ID,
      sellpiaStatus: 'READY',
      adStatus: 'READY',
      paidOrderCount: 1,
      observationDays: 30,
      eligibilityReached: true,
      monthlyFacts: [expect.objectContaining({
        contributionProfit: 500,
        negativeCoveredDays: 0,
        lossGranularity: 'MONTH_INFERRED',
        costBreakdown: {
          recognizedRevenue: { amount: 1_000, status: 'OBSERVED' },
          orderTimeCogs: { amount: 400, status: 'OBSERVED' },
          advertisingSpend: { amount: 100, status: 'OBSERVED' },
          marketplaceCommission: { amount: 0, status: 'NOT_APPLIED' },
          outboundFulfillment: { amount: 0, status: 'NOT_APPLIED' },
          returnLoss: { amount: 0, status: 'NOT_APPLIED' },
          otherVariableCost: { amount: 0, status: 'NOT_APPLIED' },
        },
      })],
    });
    expect(prisma.orderLineItem.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        organizationId: ORGANIZATION_ID,
        order: { is: expect.objectContaining({ status: { notIn: ['cancelled', 'returned', 'refunded'] } }) },
      }),
    }));
  });

  it('reaches eligibility at 20 distinct orders even before 30 observation days', async () => {
    const { service } = makeService({
      orders: Array.from({ length: 20 }, (_, index) => paidOrder(
        `order-${index}`, '2026-07-14T00:00:00.000Z',
      )),
    });

    const [evidence] = await service.readMany({
      organizationId: ORGANIZATION_ID,
      masterProductIds: [MASTER_ID],
      asOfDate: AS_OF,
      scope: 'ACTIVE_EVALUATION',
    });

    expect(evidence).toMatchObject({ paidOrderCount: 20, observationDays: 2, eligibilityReached: true });
  });

  it('keeps unavailable advertising evidence non-numeric instead of treating it as zero spend', async () => {
    const { service } = makeService({
      ad: [{
        masterProductId: MASTER_ID,
        status: 'STALE',
        coverageStartDate: sourceFact().coverageStartDate,
        coverageEndDate: AS_OF,
        capturedAt: new Date('2026-07-16T00:00:00.000Z'),
        dailyFacts: [],
      }],
    });

    const [evidence] = await service.readMany({
      organizationId: ORGANIZATION_ID,
      masterProductIds: [MASTER_ID],
      asOfDate: AS_OF,
      scope: 'ACTIVE_EVALUATION',
    });

    expect(evidence.adStatus).toBe('STALE');
    expect(evidence.monthlyFacts[0]).toMatchObject({
      adSpend: null,
      contributionProfit: null,
      costBreakdown: { advertisingSpend: { amount: null, status: 'STALE' } },
    });
  });

  it('marks a failed Sellpia source stale instead of publishing a missing source as zero evidence', async () => {
    const sellpiaFacts = { readProfitFacts: vi.fn().mockRejectedValue(new Error('source unavailable')) };
    const adSpend = { readDailyAdSpend: vi.fn().mockResolvedValue([]) };
    const prisma = {
      orderLineItem: { findMany: vi.fn().mockResolvedValue([]) },
      masterProduct: { findMany: vi.fn().mockResolvedValue([]) },
    };
    const Service = MasterProductProfitabilityReadService as unknown as new (
      sellpiaFacts: unknown, adSpend: unknown, prisma: unknown,
    ) => MasterProductProfitabilityReadService;
    const [evidence] = await new Service(sellpiaFacts, adSpend, prisma).readMany({
      organizationId: ORGANIZATION_ID,
      masterProductIds: [MASTER_ID],
      asOfDate: AS_OF,
      scope: 'ACTIVE_EVALUATION',
    });
    expect(evidence).toMatchObject({ sellpiaStatus: 'STALE', monthlyFacts: [] });
  });

  it('uses every product for historical calibration but requires explicit active IDs', async () => {
    const { service, prisma } = makeService({ masters: [{ id: MASTER_ID }] });

    await expect(service.readMany({
      organizationId: ORGANIZATION_ID,
      asOfDate: AS_OF,
      scope: 'ACTIVE_EVALUATION',
    })).rejects.toThrow('requires explicit');
    await expect(service.readMany({
      organizationId: ORGANIZATION_ID,
      asOfDate: AS_OF,
      scope: 'HISTORICAL_CALIBRATION',
    })).resolves.toHaveLength(1);
    expect(prisma.masterProduct.findMany).toHaveBeenCalledWith({
      where: { organizationId: ORGANIZATION_ID }, select: { id: true },
    });
  });
});
