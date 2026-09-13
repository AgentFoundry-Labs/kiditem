import { describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../../../../../prisma/prisma.service";
import { readOrderLineWindowFacts } from "../../../../../orders/read/order-facts.reader";
import { ProfitCalculationRepositoryAdapter } from "./profit-calculation.repository.adapter";
import { periodOf } from "../../../__tests__/test-helpers/period";

vi.mock(
  "../../../../../orders/read/order-facts.reader",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("../../../../../orders/read/order-facts.reader")
    >()),
    readOrderLineWindowFacts: vi.fn(),
  }),
);

const mockedReadOrderLineWindowFacts = vi.mocked(readOrderLineWindowFacts);

const JULY_START_KST = new Date("2026-06-30T15:00:00.000Z");
const AUGUST_START_KST = new Date("2026-07-31T15:00:00.000Z");

describe("dashboard business-date boundaries", () => {
  it("keeps KST timestamp bounds for orders but normalizes daily ad facts", async () => {
    const queryRaw = vi.fn().mockResolvedValue([]);
    const prisma = {
      $transaction: vi.fn(),
      channelListingOption: { findMany: vi.fn().mockResolvedValue([]) },
      channelAccount: {
        findFirst: vi.fn().mockResolvedValue({ id: "account" }),
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

    await new ProfitCalculationRepositoryAdapter(
      prisma as unknown as PrismaService,
    ).calculateForRange(
      "organization-id",
      periodOf(JULY_START_KST, AUGUST_START_KST),
    );

    expect(mockedReadOrderLineWindowFacts).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ from: JULY_START_KST, to: AUGUST_START_KST }),
    );
    // The ad ledger is read over the window's KST business dates, half-open.
    const sql = queryRaw.mock.calls[0]?.[0] as { values: unknown[] };
    expect(sql.values).toEqual(
      expect.arrayContaining(["organization-id", "2026-07-01", "2026-08-01"]),
    );
  });
});
