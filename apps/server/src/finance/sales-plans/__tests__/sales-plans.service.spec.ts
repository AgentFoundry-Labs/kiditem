import { BadRequestException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildPerListingMetrics, readAdEvidenceFromLedger } from '../../../common/per-listing-profit';
import { readOrderWindowFacts } from '../../../orders/read/order-facts.reader';
import { SalesPlansService } from '../sales-plans.service';

vi.mock('../../../common/per-listing-profit', () => ({
  buildPerListingMetrics: vi.fn(),
  readAdEvidenceFromLedger: vi.fn(),
}));
vi.mock('../../../orders/read/order-facts.reader', () => ({
  ORDER_FACT_EXCLUDED_STATUSES: ['cancelled', 'returned', 'refunded'],
  readOrderWindowFacts: vi.fn(),
}));

describe('SalesPlansService', () => {
  const tx = {};
  const prisma = {
    $transaction: vi.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
    salesPlan: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  };
  let service: SalesPlansService;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.$transaction.mockImplementation((callback) => callback(tx));
    service = new SalesPlansService(prisma as never);
    vi.mocked(readAdEvidenceFromLedger).mockResolvedValue({
      hasAdAccount: false,
      publishedDates: 0,
      accountSpend: 0,
      coversWindow: false,
    });
    vi.mocked(buildPerListingMetrics).mockResolvedValue([]);
  });

  it('rejects duplicate periods inside one organization', async () => {
    prisma.salesPlan.findFirst.mockResolvedValue({ id: 'existing' });

    await expect(service.create('organization-1', { period: '2026-04' }))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('scopes update and delete lookups to organization', async () => {
    prisma.salesPlan.findFirst.mockResolvedValue(null);

    await expect(service.update('plan-1', 'other-organization', {}))
      .rejects.toBeInstanceOf(NotFoundException);
    await expect(service.delete('plan-1', 'other-organization'))
      .rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.salesPlan.update).not.toHaveBeenCalled();
    expect(prisma.salesPlan.delete).not.toHaveBeenCalled();
  });

  it('writes line-grain reader actuals over a KST month window', async () => {
    prisma.salesPlan.findFirst.mockResolvedValue({
      id: 'plan-1',
      organizationId: 'organization-1',
      period: '2026-04',
    });
    vi.mocked(readOrderWindowFacts).mockResolvedValue({
      revenue: 32_000,
      orderCount: 2,
      quantity: 3,
      observedAt: new Date('2026-05-01T01:00:00.000Z'),
      observedTotals: { revenue: 32_000, orderCount: 2, quantity: 3 },
      requestedDates: ['2026-04-01'],
      includedDates: ['2026-04-01'],
      missingDates: [],
      sourceCoverage: [],
    });
    vi.mocked(buildPerListingMetrics).mockResolvedValue([
      { netProfit: 7_000 } as never,
      { netProfit: -1_000 } as never,
    ]);
    prisma.salesPlan.update.mockResolvedValue({ id: 'plan-1' });

    await service.syncActuals('plan-1', 'organization-1');

    const [, input] = vi.mocked(readOrderWindowFacts).mock.calls[0];
    expect(input.from.toISOString()).toBe('2026-03-31T15:00:00.000Z');
    expect(input.to.toISOString()).toBe('2026-04-30T15:00:00.000Z');
    expect(prisma.salesPlan.update).toHaveBeenCalledWith({
      where: { id: 'plan-1' },
      data: { actualRevenue: 32_000, actualOrders: 2, actualProfit: 6_000 },
    });
  });

  it('preserves the plan when the order window has never been observed', async () => {
    const plan = {
      id: 'plan-1',
      organizationId: 'organization-1',
      period: '2026-04',
      actualRevenue: 91_000,
    };
    prisma.salesPlan.findFirst.mockResolvedValue(plan);
    vi.mocked(readOrderWindowFacts).mockResolvedValue({
      revenue: null,
      orderCount: null,
      quantity: null,
      observedAt: null,
      observedTotals: null,
      requestedDates: ['2026-04-01'],
      includedDates: [],
      missingDates: ['2026-04-01'],
      sourceCoverage: [],
    });

    await expect(service.syncActuals('plan-1', 'organization-1')).resolves.toBe(plan);
    expect(prisma.salesPlan.update).not.toHaveBeenCalled();
    expect(buildPerListingMetrics).not.toHaveBeenCalled();
  });

  it('preserves stored actuals when only part of the month was observed', async () => {
    const plan = {
      id: 'plan-1',
      organizationId: 'organization-1',
      period: '2026-04',
      actualRevenue: 91_000,
      actualOrders: 7,
    };
    prisma.salesPlan.findFirst.mockResolvedValue(plan);
    vi.mocked(readOrderWindowFacts).mockResolvedValue({
      revenue: null,
      orderCount: null,
      quantity: null,
      observedAt: new Date('2026-04-15T01:00:00.000Z'),
      observedTotals: { revenue: 32_000, orderCount: 2, quantity: 3 },
      requestedDates: ['2026-04-01', '2026-04-02'],
      includedDates: ['2026-04-01'],
      missingDates: ['2026-04-02'],
      sourceCoverage: [],
    });

    await expect(service.syncActuals('plan-1', 'organization-1')).resolves.toBe(plan);
    expect(prisma.salesPlan.update).not.toHaveBeenCalled();
    expect(buildPerListingMetrics).not.toHaveBeenCalled();
  });
});
