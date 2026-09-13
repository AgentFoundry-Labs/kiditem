import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildPerListingProfit, readAdEvidenceFromLedger } from '../../../common/per-listing-profit';
import {
  readListingOptionOrderFacts,
  readObservedOrderBounds,
  readOrderWindowFacts,
  readRepurchaseOrderFacts,
} from '../../../orders/read/order-facts.reader';
import { StatisticsService } from '../statistics.service';

vi.mock('../../../common/per-listing-profit', () => ({
  buildPerListingProfit: vi.fn(),
  readAdEvidenceFromLedger: vi.fn(),
}));
vi.mock('../../../orders/read/order-facts.reader', () => ({
  ORDER_FACT_EXCLUDED_STATUSES: ['cancelled', 'returned', 'refunded'],
  readListingOptionOrderFacts: vi.fn(),
  readObservedOrderBounds: vi.fn(),
  readOrderWindowFacts: vi.fn(),
  readRepurchaseOrderFacts: vi.fn(),
}));

describe('StatisticsService', () => {
  const tx = { channelListingOption: { findMany: vi.fn() } };
  const prisma = {
    $transaction: vi.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
    channelListing: { count: vi.fn() },
  };
  let service: StatisticsService;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.$transaction.mockImplementation((callback) => callback(tx));
    prisma.channelListing.count.mockResolvedValue(2);
    vi.mocked(readAdEvidenceFromLedger).mockResolvedValue({
      hasAdAccount: false,
      publishedDates: 0,
      accountSpend: 0,
      coversWindow: false,
    });
    vi.mocked(buildPerListingProfit).mockResolvedValue([]);
    service = new StatisticsService(prisma as never);
  });

  it('uses canonical order facts for the overview order count', async () => {
    vi.mocked(readOrderWindowFacts).mockResolvedValue({
      revenue: 45_000,
      orderCount: 3,
      quantity: 4,
      observedAt: new Date(),
      observedTotals: { revenue: 45_000, orderCount: 3, quantity: 4 },
      requestedDates: ['2026-04-01'],
      includedDates: ['2026-04-01'],
      missingDates: [],
      sourceCoverage: [],
    });

    const result = await service.overview('organization-1', '2026-04');

    expect(result.totalOrders).toBe(3);
    expect(readOrderWindowFacts).toHaveBeenCalledOnce();
  });

  it('gets an omitted-period window from the order owner reader', async () => {
    const window = {
      from: new Date('2026-04-10T03:00:00.000Z'),
      to: new Date('2026-04-15T03:00:00.001Z'),
    };
    vi.mocked(readObservedOrderBounds).mockResolvedValue(window);
    vi.mocked(readOrderWindowFacts).mockResolvedValue({
      revenue: 1,
      orderCount: 1,
      quantity: 1,
      observedAt: new Date(),
      observedTotals: { revenue: 1, orderCount: 1, quantity: 1 },
      requestedDates: ['2026-04-10'],
      includedDates: ['2026-04-10'],
      missingDates: [],
      sourceCoverage: [],
    });

    await service.overview('organization-1');

    expect(readObservedOrderBounds).toHaveBeenCalledWith(tx, 'organization-1');
    expect(readAdEvidenceFromLedger).toHaveBeenCalledWith(
      tx,
      'organization-1',
      window.from,
      window.to,
    );
  });

  it('totals repeat-customer amount from line facts', async () => {
    vi.mocked(readRepurchaseOrderFacts).mockResolvedValue([
      {
        orderId: 'order-1',
        receiverName: 'A',
        orderedAt: new Date('2026-04-10T03:00:00.000Z'),
        revenue: 20_000,
      },
      {
        orderId: 'order-2',
        receiverName: 'A',
        orderedAt: new Date('2026-04-12T03:00:00.000Z'),
        revenue: 7_000,
      },
    ]);
    vi.mocked(readListingOptionOrderFacts).mockResolvedValue([]);
    tx.channelListingOption.findMany.mockResolvedValue([]);

    const result = await service.repurchase('organization-1', '2026-04');

    expect(result.repeatCustomers[0]?.totalAmount).toBe(27_000);
  });
});
