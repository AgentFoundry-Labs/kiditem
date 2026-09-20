import { describe, it, expect, vi } from "vitest";
import { ProfitCalculationRepositoryAdapter } from "../adapter/out/repository/profit-calculation.repository.adapter";
import type { PrismaService } from "../../../prisma/prisma.service";
import type { InventoryTransactionalReadPort } from "../../../inventory/application/port/in/stock/inventory-transactional-read.port";
import { readOrderLineWindowFacts } from "../../../orders/read/order-facts.reader";
import {
  advertisingApplies,
  readAdWindowFacts,
} from "../../../advertising/read/ad-target-facts";
import { businessDateKey, kstBusinessDate } from "../../../common/kst";
import { businessDatesInWindow } from "../domain/period/dashboard-period";
import { periodOf } from "./test-helpers/period";

vi.mock("../../../orders/read/order-facts.reader", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("../../../orders/read/order-facts.reader")
  >()),
  readOrderLineWindowFacts: vi.fn(),
}));
vi.mock("../../../advertising/read/ad-target-facts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../advertising/read/ad-target-facts")>()),
  advertisingApplies: vi.fn(),
  readAdWindowFacts: vi.fn(),
}));

const mockedReadOrderLineWindowFacts = vi.mocked(readOrderLineWindowFacts);
const mockedAdvertisingApplies = vi.mocked(advertisingApplies);
const mockedReadAdWindowFacts = vi.mocked(readAdWindowFacts);

/**
 * Ad days come from the advertising target-day ledger through
 * `advertising/read/ad-target-facts`, which the adapter reaches as `$queryRaw`. Tests
 * keep the order/lineItem path focused while providing explicit measured days
 * where ad evidence is part of the assertion.
 */
type PrismaMock = {
  $transaction: ReturnType<typeof vi.fn>;
  channelListingOption: { findMany: ReturnType<typeof vi.fn> };
  channelAccount: { findMany: ReturnType<typeof vi.fn> };
  inventoryTransactionalRead: {
    readSkuIdentities: ReturnType<typeof vi.fn>;
  };
};

/**
 * A listing option whose one-component recipe is priced at `purchasePrice`
 * (KID-114: the only cost input an option has).
 */
const pricedOption = (purchasePrice: number | null) => ({
  inventoryComponents: [{ quantity: 1, sellpiaInventorySku: { purchasePrice } }],
});

/** Inside every `calculateForRange` window used below. */
const DEFAULT_ORDERED_AT = new Date("2026-04-15T03:00:00.000Z");

/**
 * `accountChannel` is the channel of the orders' channel account, which decides
 * whether a commission and other per-sale cost apply; Rocket direct purchase
 * applies neither.
 */
function makePrisma(
  orders: unknown[],
  options: { coveredDates?: string[]; accountChannel?: string } = {},
): PrismaMock {
  const optionRows: Array<Record<string, unknown>> = [];
  const identityRows: Array<Record<string, unknown>> = [];
  const factOrders = orders.map((rawOrder, orderIndex) => {
    const order = {
      orderedAt: DEFAULT_ORDERED_AT,
      ...(rawOrder as Record<string, unknown>),
    } as Record<string, unknown> & { orderedAt: Date };
    const orderId = `order-${orderIndex}`;
    const lines = (
      (order.lineItems ?? []) as Array<Record<string, unknown>>
    ).map((line, lineIndex) => {
      const option = line.listingOption as
        Record<string, unknown> | null | undefined;
      const optionId = option ? `option-${orderIndex}-${lineIndex}` : null;
      if (option && optionId) {
        const components = (
          (option.inventoryComponents ?? []) as Array<Record<string, unknown>>
        ).map((component, componentIndex) => {
          const skuId = `sku-${orderIndex}-${lineIndex}-${componentIndex}`;
          const sku = component.sellpiaInventorySku as
            Record<string, unknown> | undefined;
          identityRows.push({
            sellpiaInventorySkuId: skuId,
            code: skuId,
            name: skuId,
            optionName: null,
            barcode: null,
            purchasePrice: sku?.purchasePrice ?? null,
            salePrice: null,
            isActive: true,
            masterProductId: null,
          });
          return { quantity: component.quantity, sellpiaInventorySkuId: skuId };
        });
        optionRows.push({ id: optionId, inventoryComponents: components });
      }
      return {
        orderId,
        channelAccountId: ACCOUNT_ID,
        orderedAt: order.orderedAt,
        businessDate: businessDateKey(kstBusinessDate(order.orderedAt)),
        shippingPrice: Number(order.shippingPrice ?? 0),
        lineItemId: `line-${orderIndex}-${lineIndex}`,
        listingOptionId: optionId,
        sku: null,
        productName: "상품",
        revenue: Number(line.totalPrice ?? 0),
        quantity: Number(line.quantity ?? 0),
      };
    });
    return {
      orderId,
      channelAccountId: ACCOUNT_ID,
      orderedAt: order.orderedAt,
      businessDate: businessDateKey(kstBusinessDate(order.orderedAt)),
      shippingPrice: Number(order.shippingPrice ?? 0),
      lines,
    };
  });

  mockedReadOrderLineWindowFacts.mockImplementation(async (_tx, input) => {
    const requestedDates = businessDatesInWindow(input.from, input.to);
    const includedDates = options.coveredDates ?? requestedDates;
    const missingDates = requestedDates.filter(
      (date) => !includedDates.includes(date),
    );
    const revenue = factOrders
      .flatMap((order) => order.lines)
      .reduce((sum, line) => sum + line.revenue, 0);
    const quantity = factOrders
      .flatMap((order) => order.lines)
      .reduce((sum, line) => sum + line.quantity, 0);
    return {
      window: {
        revenue: missingDates.length === 0 ? revenue : null,
        orderCount: missingDates.length === 0 ? factOrders.length : null,
        quantity: missingDates.length === 0 ? quantity : null,
        observedAt: factOrders.length > 0 ? DEFAULT_ORDERED_AT : null,
        observedTotals:
          factOrders.length > 0
            ? { revenue, orderCount: factOrders.length, quantity }
            : null,
        requestedDates,
        includedDates,
        missingDates,
        sourceCoverage: [],
      },
      orders: factOrders,
    };
  });
  const inventoryTransactionalRead = {
    readSkuIdentities: vi.fn().mockResolvedValue(identityRows as never),
  };

  const prisma = {
    $transaction: vi.fn(),
    channelListingOption: { findMany: vi.fn().mockResolvedValue(optionRows) },
    channelAccount: {
      findMany: vi.fn().mockResolvedValue([
        { id: ACCOUNT_ID, channel: options.accountChannel ?? "rocket" },
      ]),
    },
    inventoryTransactionalRead,
  };
  prisma.$transaction.mockImplementation(async (callback) => callback(prisma));
  return prisma;
}

const ACCOUNT_ID = "00000000-0000-4000-8000-000000000001";

/**
 * Wires the measured ad days and whether a Coupang channel account exists.
 * Passing `channelAccountId: null` models an organization that does not
 * advertise, so advertising is not an input to its profit.
 */
function makeAdapter(
  prisma: PrismaMock,
  rows: unknown[] = [],
  channelAccountId: string | null = ACCOUNT_ID,
): ProfitCalculationRepositoryAdapter {
  mockedAdvertisingApplies.mockResolvedValue(channelAccountId !== null);
  mockedReadAdWindowFacts.mockResolvedValue({
    days: rows.map((row) => {
      const raw = row as Record<string, unknown>;
      return {
        businessDate: businessDateKey(raw.business_date as Date),
        spend: Number(raw.spend ?? 0),
        revenue: Number(raw.revenue ?? 0),
        impressions: Number(raw.impressions ?? 0),
        clicks: Number(raw.clicks ?? 0),
        conversions: Number(raw.conversions ?? 0),
        orders: Number(raw.orders ?? 0),
        conversionsObserved: true,
      };
    }),
    observedAt: null,
  });
  return new ProfitCalculationRepositoryAdapter(
    prisma as unknown as PrismaService,
    prisma.inventoryTransactionalRead as unknown as InventoryTransactionalReadPort,
  );
}

function ownerRow(
  businessDate: string,
  values: Partial<{
    adSpend: number;
    adRevenue: number;
    impressions: number;
    clicks: number;
    conversions: number;
  }> = {},
) {
  return {
    business_date: new Date(`${businessDate}T00:00:00.000Z`),
    spend: values.adSpend ?? 0,
    revenue: values.adRevenue ?? 0,
    impressions: values.impressions ?? 0,
    clicks: values.clicks ?? 0,
    conversions: values.conversions ?? 0,
    orders: 0,
    observed_at: new Date(`${businessDate}T23:00:00.000Z`),
  };
}

describe("ProfitCalculationRepositoryAdapter.calculateForRange — R-1 shipping per-order", () => {
  it("order 1개에 lineItem 3개여도 shipping = order.shippingPrice × 1", async () => {
    const prisma = makePrisma([
      {
        shippingPrice: 3000,
        lineItems: [
          {
            quantity: 1,
            totalPrice: 10000,
            listingOption: pricedOption(5000),
          },
          {
            quantity: 2,
            totalPrice: 20000,
            listingOption: pricedOption(5000),
          },
          {
            quantity: 1,
            totalPrice: 5000,
            listingOption: pricedOption(5000),
          },
        ],
      },
    ]);
    const from = new Date("2026-04-01T00:00:00Z");
    const to = new Date("2026-05-01T00:00:00Z");
    const result = await makeAdapter(prisma).calculateForRange(
      "organization-1",
      periodOf(from, to),
    );
    expect(result.shippingCost).toBe(3000); // NOT 999 × 3
  });

  it("order 2개 — shipping = 합산 per-order", async () => {
    const prisma = makePrisma([
      {
        shippingPrice: 3000,
        lineItems: [
          {
            quantity: 1,
            totalPrice: 10000,
            listingOption: pricedOption(5000),
          },
        ],
      },
      {
        shippingPrice: 2500,
        lineItems: [
          {
            quantity: 1,
            totalPrice: 8000,
            listingOption: pricedOption(4000),
          },
        ],
      },
    ]);
    const from = new Date("2026-04-01T00:00:00Z");
    const to = new Date("2026-05-01T00:00:00Z");
    const result = await makeAdapter(prisma).calculateForRange(
      "organization-1",
      periodOf(from, to),
    );
    expect(result.shippingCost).toBe(5500);
  });

  it("order with zero lineItems still accumulates shipping (Order.shippingPrice source of truth)", async () => {
    const prisma = makePrisma([{ shippingPrice: 3000, lineItems: [] }]);
    const from = new Date("2026-04-01T00:00:00Z");
    const to = new Date("2026-05-01T00:00:00Z");
    const result = await makeAdapter(prisma).calculateForRange(
      "organization-1",
      periodOf(from, to),
    );
    expect(result.shippingCost).toBe(3000);
    expect(result.revenue).toBe(0);
  });

  it("takes shipping from the order's shipping price with no per-option fallback", async () => {
    const prisma = makePrisma([
      {
        shippingPrice: 0,
        lineItems: [{ quantity: 2, totalPrice: 20000, listingOption: pricedOption(5000) }],
      },
    ]);

    const result = await makeAdapter(prisma).calculateForRange(
      "organization-1",
      periodOf(
        new Date("2026-04-01T00:00:00Z"),
        new Date("2026-05-01T00:00:00Z"),
      ),
    );

    // KID-114: option `shippingCost` is not an input; the order's 0 stands.
    expect(result.shippingCost).toBe(0);
    expect(result.costOfGoods).toBe(10000);
  });

  it("asks the canonical reader to exclude cancelled/returned/refunded orders", async () => {
    const prisma = makePrisma([{ shippingPrice: 3000, lineItems: [] }]);
    const from = new Date("2026-04-01T00:00:00Z");
    const to = new Date("2026-05-01T00:00:00Z");
    await makeAdapter(prisma).calculateForRange(
      "organization-1",
      periodOf(from, to),
    );
    expect(mockedReadOrderLineWindowFacts).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        organizationId: "organization-1",
        excludedStatuses: expect.arrayContaining([
          "cancelled",
          "returned",
          "refunded",
        ]),
      }),
    );
  });
});

describe("ProfitCalculationRepositoryAdapter.calculateForRange — owner-published ad evidence", () => {
  it("aggregates additive ad metrics from Advertising owner rows", async () => {
    const prisma = makePrisma([]);
    const from = new Date("2026-04-01T00:00:00Z");
    const to = new Date("2026-05-01T00:00:00Z");
    const completeOwnerRows = businessDatesInWindow(from, to).map(
      (date, index) =>
        ownerRow(
          date,
          index === 0
            ? {
                adSpend: 12345,
                adRevenue: 67890,
                impressions: 1000,
                clicks: 50,
                conversions: 5,
              }
            : {},
        ),
    );
    const result = await makeAdapter(
      prisma,
      completeOwnerRows,
    ).calculateForRange("organization-1", periodOf(from, to));

    expect(result.adCost).toBe(12345);
    expect(result.adRevenue).toBe(67890);
    expect(result.adImpressions).toBe(1000);
    expect(result.adClicks).toBe(50);
    expect(result.adConversions).toBe(5);
  });

  it("empty owner publication keeps ad metrics unknown and incomplete", async () => {
    const prisma = makePrisma([], { coveredDates: [] });
    const from = new Date("2026-04-01T00:00:00Z");
    const to = new Date("2026-05-01T00:00:00Z");
    const result = await makeAdapter(prisma).calculateForRange(
      "organization-1",
      periodOf(from, to),
    );
    expect(result.adCost).toBeNull();
    expect(result.adRevenue).toBeNull();
    expect(result.adImpressions).toBeNull();
    expect(result.adClicks).toBeNull();
    expect(result.adConversions).toBeNull();
    expect(result.adEvidenceComplete).toBe(false);
  });
});

describe("ProfitCalculationRepositoryAdapter.calculateForRange — business-date coverage", () => {
  it("reports no dates at all for an empty window", async () => {
    const instant = new Date("2026-04-01T00:00:00Z");
    const result = await makeAdapter(makePrisma([])).calculateForRange(
      "organization-1",
      periodOf(instant, instant),
    );
    expect(result.sourceCoverage).toEqual({
      requestedDates: [],
      orderDates: [],
      adDates: [],
      // The owner is never asked for a window with no dates, so nothing was
      // published for it: absent evidence, never a claim of zero ad cost.
      hasAdAccount: true,
    });
    expect(result.adEvidenceComplete).toBe(false);
  });

  it("attributes an admitted order to its KST business date", async () => {
    // 2026-04-30T15:00Z is KST 2026-05-01 00:00 — the next business date.
    const result = await makeAdapter(
      makePrisma([
        {
          orderedAt: new Date("2026-04-30T15:30:00.000Z"),
          shippingPrice: 0,
          lineItems: [],
        },
      ]),
      [ownerRow("2026-05-01")],
    ).calculateForRange(
      "organization-1",
      periodOf(
        new Date("2026-04-30T15:00:00.000Z"),
        new Date("2026-05-01T15:00:00.000Z"),
      ),
    );
    expect(result.sourceCoverage).toEqual({
      requestedDates: ["2026-05-01"],
      orderDates: ["2026-05-01"],
      adDates: ["2026-05-01"],
      hasAdAccount: true,
    });
    expect(result.adEvidenceComplete).toBe(true);
  });
});

describe("ProfitCalculationRepositoryAdapter.calculateDailyForRange", () => {
  const from = new Date("2026-09-01T15:00:00.000Z");
  const to = new Date("2026-09-03T15:00:00.000Z");
  const completeOption = pricedOption(20);
  const order = (listingOption: unknown = completeOption) => ({
    orderedAt: new Date("2026-09-01T16:00:00.000Z"),
    shippingPrice: 0,
    lineItems: [{ quantity: 2, totalPrice: 100, listingOption }],
  });

  it("calculates KST-day costs and profit only on the same day as explicit ad evidence", async () => {
    const rows = await makeAdapter(makePrisma([order()]), [
      ownerRow("2026-09-02"),
    ]).calculateDailyForRange("organization-1", periodOf(from, to));
    expect(rows).toHaveLength(2);
    expect(rows.find((row) => row.date === "2026-09-02")).toMatchObject({
      date: "2026-09-02",
      revenue: 100,
      qty: 2,
      costOfGoods: 40,
      // A Rocket direct-purchase order carries no commission or other cost.
      commission: 0,
      otherCost: 0,
      cost: 40,
      adCost: 0,
      netProfit: 60,
      profitRate: 60,
      hasOrderEvidence: true,
      hasAdEvidence: true,
      costComplete: true,
    });
  });

  it.each([
    ["no listing option", null, "rocket", "MISSING_LISTING_OPTION"],
    ["no recipe", { inventoryComponents: [] }, "rocket", "MISSING_COST_PRICE"],
    ["an unpriced component", pricedOption(null), "rocket", "MISSING_PURCHASE_PRICE"],
    ["a commission without a source", completeOption, "naver", "MISSING_COMMISSION"],
    ["an other cost without a source", completeOption, "naver", "MISSING_OTHER_COST"],
  ] as const)(
    "retains revenue but withholds profit for %s",
    async (_label, option, accountChannel, reason) => {
      const rows = await makeAdapter(
        makePrisma([order(option)], { accountChannel }),
        [ownerRow("2026-09-02")],
      ).calculateDailyForRange("organization-1", periodOf(from, to));
      const measured = rows.find((row) => row.date === "2026-09-02");
      expect(measured).toMatchObject({
        revenue: 100,
        adCost: 0,
        costComplete: false,
        netProfit: null,
      });
      expect(measured?.costIncompleteReasons).toContain(reason);
    },
  );

  it("never sums a component nobody measured as 0", async () => {
    const rows = await makeAdapter(
      makePrisma([order(pricedOption(null))], { accountChannel: "naver" }),
      [ownerRow("2026-09-02")],
    ).calculateDailyForRange("organization-1", periodOf(from, to));
    expect(rows.find((row) => row.date === "2026-09-02")).toMatchObject({
      costOfGoods: null,
      commission: null,
      otherCost: null,
      cost: null,
      netProfit: null,
    });

    const range = await makeAdapter(
      makePrisma([order(pricedOption(null))], { accountChannel: "naver" }),
      [ownerRow("2026-09-02"), ownerRow("2026-09-03")],
    ).calculateForRange("organization-1", periodOf(from, to));
    expect(range).toMatchObject({
      costOfGoods: null,
      commission: null,
      otherCost: null,
      netProfit: null,
    });
  });

  it("computes a daily profit when the organization does not advertise", async () => {
    const rows = await makeAdapter(
      makePrisma([order()]),
      [],
      null,
    ).calculateDailyForRange("organization-1", periodOf(from, to));

    // NOT_APPLIED: no advertising account, so the day's ad values are a
    // genuine zero. `hasAdEvidence` stays false because there is still no ad
    // row behind them, but the ad input no longer withholds profit.
    expect(rows).toHaveLength(2);
    expect(rows.find((row) => row.date === "2026-09-02")).toMatchObject({
      date: "2026-09-02",
      revenue: 100,
      adCost: 0,
      adRevenue: 0,
      hasAdEvidence: false,
      hasAdAccount: false,
      netProfit: 60,
    });
  });

  it("withholds a daily profit when an ad account published nothing", async () => {
    const rows = await makeAdapter(
      makePrisma([order()]),
      [],
    ).calculateDailyForRange("organization-1", periodOf(from, to));

    // MISSING is absent evidence, never an advertising cost of zero.
    expect(rows.find((row) => row.date === "2026-09-02")).toMatchObject({
      date: "2026-09-02",
      revenue: 100,
      adCost: null,
      hasAdEvidence: false,
      hasAdAccount: true,
      netProfit: null,
    });
  });

  it("does not convert an ad-only day into order or profit evidence", async () => {
    const rows = await makeAdapter(makePrisma([], { coveredDates: [] }), [
      ownerRow("2026-09-02"),
    ]).calculateDailyForRange("organization-1", periodOf(from, to));
    expect(rows[0]).toMatchObject({
      hasOrderEvidence: false,
      hasAdEvidence: true,
      netProfit: null,
    });
  });

  it("preserves nonoverlapping order/ad dates without a fabricated profit intersection", async () => {
    const rows = await makeAdapter(
      makePrisma([order()], { coveredDates: ["2026-09-02"] }),
      [ownerRow("2026-09-03")],
    ).calculateDailyForRange("organization-1", periodOf(from, to));
    expect(rows.map(({ date, netProfit }) => ({ date, netProfit }))).toEqual([
      { date: "2026-09-02", netProfit: null },
      { date: "2026-09-03", netProfit: null },
    ]);
  });

  it("preserves owner ad read failure even when the range has no orders", async () => {
    const prisma = makePrisma([], { coveredDates: [] });
    const adapter = makeAdapter(prisma);
    mockedReadAdWindowFacts.mockRejectedValue(new Error("ledger unavailable"));

    const rows = await adapter.calculateDailyForRange(
      "organization-1",
      periodOf(
        new Date("2026-09-01T00:00:00.000Z"),
        new Date("2026-09-03T00:00:00.000Z"),
      ),
    );

    expect(rows.map((row) => row.date)).toEqual([
      "2026-09-01",
      "2026-09-02",
      "2026-09-03",
    ]);
    expect(rows.every((row) => row.hasOrderEvidence === false)).toBe(true);
    expect(
      rows.every((row) => row.adEvidenceError === "AD_EVIDENCE_READ_FAILED"),
    ).toBe(true);
  });
});

describe("ProfitCalculationRepositoryAdapter — conversion counts a provider grid did not carry", () => {
  it("publishes no conversion count for a window or day whose grid carried no conversion columns", async () => {
    const from = new Date("2026-03-31T15:00:00.000Z");
    const to = new Date("2026-04-02T15:00:00.000Z");
    const dates = businessDatesInWindow(from, to);
    const adapter = makeAdapter(makePrisma([]), dates.map((date) => ownerRow(date)));
    mockedReadAdWindowFacts.mockResolvedValue({
      days: dates.map((businessDate, index) => ({
        businessDate,
        spend: 100,
        revenue: 0,
        impressions: 10,
        clicks: 1,
        conversions: 0,
        orders: 0,
        // The first day came from the campaign dashboard grid, which has no
        // conversion columns: its stored 0 counted nothing.
        conversionsObserved: index !== 0,
      })),
      observedAt: null,
    });

    const range = await adapter.calculateForRange("organization-1", periodOf(from, to));
    expect(range).toMatchObject({
      adCost: 100 * dates.length,
      adClicks: dates.length,
      adConversions: null,
    });

    const daily = await adapter.calculateDailyForRange("organization-1", periodOf(from, to));
    expect(daily.map((row) => [row.date, row.adConversions])).toEqual(
      dates.map((date, index) => [date, index === 0 ? null : 0]),
    );
  });
});
