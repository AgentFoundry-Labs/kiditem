import { channelFactTestPorts } from '../../../../../test-helpers/channel-fact-ports';
import { describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../../../../../prisma/prisma.service";
import type { OrderFactsPort } from "../../../../../orders/application/port/in/facts/order-facts.port";
import { ProfitCalculationRepositoryAdapter } from "./profit-calculation.repository";
import { periodOf } from "../../../../__tests__/dashboard/test-helpers/period";
import { ProductTransactionalReadRepositoryAdapter } from "../../../../../products/adapter/out/persistence/product-transactional-read.repository";

const mockedReadOrderLineWindowFacts = vi.fn<OrderFactsPort["readOrderLineWindowFacts"]>();

const JULY_START_KST = new Date("2026-06-30T15:00:00.000Z");
const AUGUST_START_KST = new Date("2026-07-31T15:00:00.000Z");

describe("dashboard business-date boundaries", () => {
  it("keeps KST timestamp bounds for orders but normalizes daily ad facts", async () => {
    const queryRaw = vi.fn().mockResolvedValue([]);
    const adLedger = {
      advertisingApplies: vi.fn().mockResolvedValue(true),
      readAdWindowFacts: vi.fn().mockResolvedValue({ days: [], observedAt: null }),
    };
    const prisma = {
      $transaction: vi.fn(),
      channelListingOption: { findMany: vi.fn().mockResolvedValue([]) },
      channelAccount: {
        findFirst: vi.fn().mockResolvedValue({ id: "account" }),
        findMany: vi.fn().mockResolvedValue([]),
      },
      $queryRaw: queryRaw,
    };
    prisma.$transaction.mockImplementation(async (callback) =>
      callback(prisma),
    );
    mockedReadOrderLineWindowFacts.mockResolvedValue({
      window: {
        revenue: 0,
        orderCount: 0,
        quantity: 0,
        observedAt: null,
        observedTotals: null,
        requestedDates: [],
        includedDates: [],
        missingDates: [],
        sourceCoverage: [],
      },
      orders: [],
    });

    await new ProfitCalculationRepositoryAdapter(channelFactTestPorts(prisma as unknown as PrismaService).accounts, channelFactTestPorts(prisma as unknown as PrismaService).recipes,
      prisma as unknown as PrismaService,
      new ProductTransactionalReadRepositoryAdapter(), adLedger as never,
      { readOrderLineWindowFacts: mockedReadOrderLineWindowFacts } as unknown as OrderFactsPort,
    ).calculateForRange(
      "organization-id",
      periodOf(JULY_START_KST, AUGUST_START_KST),
    );

    expect(mockedReadOrderLineWindowFacts).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ from: JULY_START_KST, to: AUGUST_START_KST }),
    );
    // The ad ledger is read over the window's KST business dates, half-open.
    expect(adLedger.readAdWindowFacts).toHaveBeenCalledWith(
      expect.anything(),
      { organizationId: "organization-id", from: "2026-07-01", to: "2026-08-01" },
    );
  });
});
