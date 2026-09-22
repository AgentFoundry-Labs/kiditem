import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  PRODUCT_ABC_ABSOLUTE_CURRENT_PAYLOAD,
  type ProductAbcEvaluation,
} from "@kiditem/shared/product-abc";
import { DashboardSalesRepositoryAdapter } from "../dashboard-sales.repository.adapter";
import { readProductAbcPublication } from "../../../../../../products/adapter/out/persistence/read/product-abc-publication.reader";
import { readOrderLineWindowFacts } from "../../../../../../orders/read/order-facts.reader";
import { readCurrentSellpiaProductMonthlyFacts } from "../../../../../sellpia-product-sales/read/sellpia-product-monthly-facts";
import { businessDatesInWindow } from "../../../../domain/period/dashboard-period";

vi.mock(
  "../../../../../../products/adapter/out/persistence/read/product-abc-publication.reader",
  () => ({
    readProductAbcPublication: vi.fn(),
    readPublishedProductAbcGrades: vi.fn().mockResolvedValue(new Map()),
  }),
);
vi.mock(
  "../../../../../../orders/read/order-facts.reader",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("../../../../../../orders/read/order-facts.reader")
    >()),
    readOrderLineWindowFacts: vi.fn(),
  }),
);
vi.mock(
  "../../../../../sellpia-product-sales/read/sellpia-product-monthly-facts",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("../../../../../sellpia-product-sales/read/sellpia-product-monthly-facts")
    >()),
    readCurrentSellpiaProductMonthlyFacts: vi.fn(),
  }),
);
vi.mock(
  "../../../../../../common/per-listing-profit",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("../../../../../../common/per-listing-profit")
    >()),
    buildPerListingProfit: vi.fn().mockResolvedValue([]),
  }),
);

const mockedReadProductAbcPublication = vi.mocked(readProductAbcPublication);
const mockedReadOrderLineWindowFacts = vi.mocked(readOrderLineWindowFacts);
const mockedReadSellpiaFacts = vi.mocked(readCurrentSellpiaProductMonthlyFacts);

function inventoryTransactionalRead() {
  return { readSourceIdentities: vi.fn().mockResolvedValue([]) } as never;
}

function productAbcRead() {
  return {
    readAbc: vi.fn().mockImplementation(async (input: {
      organizationId: string;
      masterProductIds: readonly string[];
    }) => {
      const publication = await mockedReadProductAbcPublication({} as never, input);
      return {
        products: publication.products.map((product) => ({
          masterProductId: product.masterProductId,
          contributionEligible: product.contributionEligible,
          abc: {
            abcGrade: product.evaluation?.abcGrade ?? null,
            evaluation: product.evaluation,
          },
        })),
      };
    }),
  } as never;
}

/**
 * The ranking settles profit through `buildPerListingProfit`, whose own
 * behavior is proved against PostgreSQL in its spec and in the dashboard sales
 * PG spec. These cases assert the ranking's own mapping, so the helper answers
 * nothing, the fake answers the ranking query with the rows and every other
 * read with nothing; no Coupang account exists, so advertising is not an input
 * and the cases stay about the grade and the ranking.
 */
const prismaWith = (topProductRows: unknown[]) => {
  const rows = topProductRows as Array<Record<string, unknown>>;
  const options = rows.flatMap((row, index) =>
    row.listingId
      ? [
          {
            id: `option-${index}`,
            listing: {
              id: row.listingId,
              externalId: row.listingId,
              channelName: row.organization,
              displayName: row.name,
            },
          },
        ]
      : [],
  );
  const accounts = rows.map((row, index) => ({
    id: `account-${index}`,
    name: row.organization,
    channel: row.organization,
  }));
  mockedReadOrderLineWindowFacts.mockImplementation(async (_tx, input) => {
    const requestedDates = businessDatesInWindow(input.from, input.to);
    const orders = rows.map((row, index) => {
      const orderId = `order-${index}`;
      const orderedAt = new Date("2026-07-15T03:00:00.000Z");
      const businessDate = "2026-07-15";
      const line = {
        orderId,
        channelAccountId: `account-${index}`,
        orderedAt,
        businessDate,
        shippingPrice: 0,
        lineItemId: `line-${index}`,
        listingOptionId: row.listingId ? `option-${index}` : null,
        sku:
          typeof row.id === "string" && row.id.startsWith("line-sku:")
            ? row.id.slice("line-sku:".length)
            : null,
        productName: String(row.name ?? "상품"),
        revenue: Number(row.revenue ?? 0),
        quantity: Number(row.quantity ?? 0),
      };
      return {
        orderId,
        channelAccountId: `account-${index}`,
        orderedAt,
        businessDate,
        shippingPrice: 0,
        lines: [line],
      };
    });
    const revenue = rows.reduce(
      (sum, row) => sum + Number(row.revenue ?? 0),
      0,
    );
    const quantity = rows.reduce(
      (sum, row) => sum + Number(row.quantity ?? 0),
      0,
    );
    return {
      window: {
        revenue,
        orderCount: rows.length,
        quantity,
        observedAt: rows.length ? new Date("2026-07-15T03:00:00.000Z") : null,
        observedTotals: rows.length
          ? { revenue, orderCount: rows.length, quantity }
          : null,
        requestedDates,
        includedDates: requestedDates,
        missingDates: [],
        sourceCoverage: [],
      },
      orders,
    };
  });
  const prisma = {
    $transaction: vi.fn(),
    $queryRaw: vi.fn().mockResolvedValue([]),
    order: { findMany: vi.fn().mockResolvedValue([]) },
    channelListing: { findMany: vi.fn().mockResolvedValue(rows.filter((row) => row.listingId).map((row) => ({
      id: row.listingId,
      options: [{ inventoryComponents: row.masterProductId ? [{ masterProductId: row.masterProductId }] : [] }],
    }))) },
    channelListingOption: { findMany: vi.fn().mockResolvedValue(options) },
    channelAccount: {
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue(accounts),
    },
  };
  prisma.$transaction.mockImplementation(async (callback) => callback(prisma));
  return prisma as never;
};

describe("DashboardSalesRepositoryAdapter", () => {
  beforeEach(() => {
    mockedReadProductAbcPublication.mockReset().mockResolvedValue({
      currentFormulaRevision: 0,
      currentMappingGeneration: "0",
      publication: null,
      products: [],
    });
  });

  it("reads the published absolute evaluation without synthesizing another grade", async () => {
    const published: ProductAbcEvaluation = {
      abcGrade: "B",
      weightedRevenue: 1_000_000,
      weightedOrderTimeSupplyCost: 600_000,
      weightedAdvertisingSpend: 100_000,
      weightedOperatingProfit: 300_000,
      operatingProfitVelocity30: 300_000,
      operatingMargin: 0.3,
      lossPersistence: 0,
      profitScore: 40,
      marginScore: 100,
      consistencyScore: 100,
      economicScore: 70,
      validObservationDays: 30,
      formula: PRODUCT_ABC_ABSOLUTE_CURRENT_PAYLOAD,
      formulaRevision: 1,
      publicationRevision: 2,
      gradeBasisCutoffDate: "2026-06-30",
      saleStartDate: "2026-05-01",
      sellpiaSourceImportRunId: "11111111-1111-4111-8111-111111111111",
      advertisingSourceImportRunId: "22222222-2222-4222-8222-222222222222",
      sellpiaGeneration: "3",
      advertisingGeneration: "4",
      mappingGeneration: "5",
      calculatedAt: "2026-07-01T00:00:00.000Z",
    };
    const repository = new DashboardSalesRepositoryAdapter(
      prismaWith([
        {
          id: "listing-1",
          listingId: "listing-1",
          name: "상품",
          organization: "쿠팡",
          masterProductId: "master-1",
          revenue: 10_000,
          quantity: 1,
        },
      ]),
      inventoryTransactionalRead(),
      productAbcRead(),
    );
    mockedReadProductAbcPublication.mockResolvedValue({
      currentFormulaRevision: 1,
      currentMappingGeneration: "5",
      publication: null,
      products: [
        {
          masterProductId: "master-1",
          evaluation: published,
          contributionEligible: true,
        },
      ],
    });

    const result = await repository.fetchTopProducts(
      "11111111-1111-4111-8111-111111111111",
      new Date("2026-07-01T00:00:00.000Z"),
      new Date("2026-08-01T00:00:00.000Z"),
    );

    expect(result[0]).toMatchObject({
      grade: "B",
      abcEvaluation: published,
      revenue: 10_000,
    });
  });

  it.each([null, { abcGrade: "A", economicScore: 95 }])(
    "does not expose an official grade without a complete stored evaluation: %j",
    async (abcEvaluation) => {
      const repository = new DashboardSalesRepositoryAdapter(
        prismaWith([
          {
            id: "listing-1",
            listingId: "listing-1",
            name: "신상품",
            organization: "쿠팡",
            masterProductId: "master-1",
            abcEvaluation,
            revenue: 10_000,
            quantity: 1,
          },
        ]),
        inventoryTransactionalRead(),
        productAbcRead(),
      );

      const result = await repository.fetchTopProducts(
        "11111111-1111-4111-8111-111111111111",
        new Date("2026-07-01T00:00:00.000Z"),
        new Date("2026-08-01T00:00:00.000Z"),
      );

      expect(result[0]).toMatchObject({
        grade: null,
        abcEvaluation: null,
        revenue: 10_000,
      });
    },
  );

  /**
   * The ranking used to publish `revenue * 0.3`. It read as a settled figure,
   * and once Rocket purchase-order lines joined the ranking — they carry no
   * listing to settle against at all — an assumed margin and a measured one
   * were the same pixels. Revenue stays; profit is withheld until measured.
   */
  describe("profit", () => {
    const ORGANIZATION_ID = "11111111-1111-4111-8111-111111111111";
    const JULY = [
      new Date("2026-07-01T00:00:00.000Z"),
      new Date("2026-08-01T00:00:00.000Z"),
    ] as const;

    it("withholds profit for a line that settles against no listing", async () => {
      const repository = new DashboardSalesRepositoryAdapter(
        prismaWith([
          {
            id: "line-sku:53889600",
            listingId: null,
            name: "로켓 공급 상품",
            organization: "Coupang Rocket",
            abcEvaluation: null,
            revenue: 1_474_200,
            quantity: 12,
          },
        ]),
        inventoryTransactionalRead(),
        productAbcRead(),
      );

      const [row] = await repository.fetchTopProducts(ORGANIZATION_ID, ...JULY);

      expect(row.revenue).toBe(1_474_200);
      expect(row.netProfit).toBeNull();
      expect(row.profitRate).toBeNull();
      expect(row.netProfit).not.toBe(Math.round(1_474_200 * 0.3));
    });

    it("does not read per-listing profit when no ranked row could consume it", async () => {
      const prisma = prismaWith([
        {
          id: "line-sku:1",
          listingId: null,
          name: "로켓 공급 상품",
          organization: "Coupang Rocket",
          abcEvaluation: null,
          revenue: 1_000,
          quantity: 1,
        },
      ]);
      const repository = new DashboardSalesRepositoryAdapter(prisma, inventoryTransactionalRead(), productAbcRead());

      await repository.fetchTopProducts(ORGANIZATION_ID, ...JULY);

      expect(
        (
          prisma as unknown as {
            order: { findMany: { mock: { calls: unknown[] } } };
          }
        ).order.findMany.mock.calls,
      ).toHaveLength(0);
    });

    it("publishes the measured figure when the shared helper settled one", async () => {
      const prisma = prismaWith([
        {
          id: "listing-1",
          listingId: "listing-1",
          name: "상품",
          organization: "쿠팡",
          abcEvaluation: null,
          revenue: 10_000,
          quantity: 1,
        },
      ]);
      const repository = new DashboardSalesRepositoryAdapter(prisma, inventoryTransactionalRead(), productAbcRead());
      const settled = vi
        .spyOn(
          repository as unknown as {
            readProfitByRankedListing: (
              o: string,
              f: Date,
              t: Date,
            ) => Promise<Map<string, unknown>>;
          },
          "readProfitByRankedListing",
        )
        .mockResolvedValue(
          new Map([["listing-1", { netProfit: 1_234, profitRate: 12.3 }]]),
        );

      const [row] = await repository.fetchTopProducts(ORGANIZATION_ID, ...JULY);

      expect(settled).toHaveBeenCalledOnce();
      expect(row.netProfit).toBe(1_234);
      expect(row.profitRate).toBe(12.3);
    });

    it("withholds profit for a ranked listing the helper had no answer for", async () => {
      const repository = new DashboardSalesRepositoryAdapter(
        prismaWith([
          {
            id: "listing-1",
            listingId: "listing-1",
            name: "상품",
            organization: "쿠팡",
            abcEvaluation: null,
            revenue: 10_000,
            quantity: 1,
          },
        ]),
        inventoryTransactionalRead(),
        productAbcRead(),
      );

      const [row] = await repository.fetchTopProducts(ORGANIZATION_ID, ...JULY);

      expect(row.revenue).toBe(10_000);
      expect(row.netProfit).toBeNull();
      expect(row.profitRate).toBeNull();
    });
  });

  /**
   * A whole month ranks from Sellpia's per-product monthly sales: the orders
   * table sees only what the mall collectors brought in, so September read as
   * an empty ranking while Sellpia had sold 1억 across every channel.
   */
  describe("Sellpia month ranking", () => {
    const ORGANIZATION_ID = "11111111-1111-4111-8111-111111111111";
    const SEPTEMBER_START = new Date("2026-09-01T00:00:00.000Z");
    const SEPTEMBER_END = new Date("2026-09-17T00:00:00.000Z");

    const fact = (overrides: Record<string, unknown>) => ({
      productCode: "1",
      optionCode: "1",
      yearMonth: "2026-09",
      productName: "상품",
      orderAmount: 0,
      masterProductId: null,
      capturedAt: new Date("2026-09-17T10:00:00.000Z"),
      coverageStartDate: SEPTEMBER_START,
      coverageEndDate: SEPTEMBER_END,
      ...overrides,
    });
    const answer = (facts: Array<Record<string, unknown>>) =>
      mockedReadSellpiaFacts.mockResolvedValue({
        generation: null,
        facts: facts as never,
      });
    const evaluation = (abcGrade: "A" | "B" | "C"): ProductAbcEvaluation => ({
      abcGrade,
      weightedRevenue: 1_000_000,
      weightedOrderTimeSupplyCost: 600_000,
      weightedAdvertisingSpend: 100_000,
      weightedOperatingProfit: 300_000,
      operatingProfitVelocity30: 300_000,
      operatingMargin: 0.3,
      lossPersistence: 0,
      profitScore: 40,
      marginScore: 100,
      consistencyScore: 100,
      economicScore: 70,
      validObservationDays: 30,
      formula: PRODUCT_ABC_ABSOLUTE_CURRENT_PAYLOAD,
      formulaRevision: 1,
      publicationRevision: 2,
      gradeBasisCutoffDate: "2026-08-31",
      saleStartDate: "2026-05-01",
      sellpiaSourceImportRunId: "11111111-1111-4111-8111-111111111111",
      advertisingSourceImportRunId: "22222222-2222-4222-8222-222222222222",
      sellpiaGeneration: "3",
      advertisingGeneration: "4",
      mappingGeneration: "5",
      calculatedAt: "2026-09-01T00:00:00.000Z",
    });
    const repository = () => new DashboardSalesRepositoryAdapter(
      prismaWith([]),
      inventoryTransactionalRead(),
      productAbcRead(),
    );

    beforeEach(() => mockedReadSellpiaFacts.mockReset());

    it("sums a product's options, ranks by revenue and leaves out what sold nothing", async () => {
      answer([
        fact({ productCode: "9484", optionCode: "1", productName: "캐치볼 세트", orderAmount: 3_000 }),
        fact({ productCode: "9484", optionCode: "2", productName: "캐치볼 세트", orderAmount: 2_000 }),
        fact({ productCode: "3189", productName: "만국기", orderAmount: 4_000 }),
        fact({ productCode: "10252", productName: "연 날리기", orderAmount: 0 }),
      ]);

      const result = await repository().fetchSellpiaTopProducts(ORGANIZATION_ID, "2026-09");

      expect(mockedReadSellpiaFacts).toHaveBeenCalledWith(expect.anything(), {
        organizationId: ORGANIZATION_ID,
        scope: { yearMonths: ["2026-09"] },
      });
      expect(result?.coverage).toEqual({ startDate: "2026-09-01", endDate: "2026-09-17" });
      expect(result?.products.map((row) => [row.id, row.name, row.revenue])).toEqual([
        ["sellpia:9484", "캐치볼 세트", 5_000],
        ["sellpia:3189", "만국기", 4_000],
      ]);
    });

    it("names a product from its first option, not from one colour's option", async () => {
      // Sellpia's own rows for product 9484, read out of order.
      answer([
        fact({ productCode: "9484", optionCode: "3", productName: "11000 찍찍이 가방 캐치볼 (블루)", orderAmount: 2_724_450 }),
        fact({ productCode: "9484", optionCode: "1", productName: "찍찍이 가방 캐치볼 세트 판2개, 볼2개 가방케이스포함", orderAmount: 2_857_649 }),
        fact({ productCode: "9484", optionCode: "2", productName: "11000 찍찍이 가방 캐치볼 (핑크)", orderAmount: 2_005_550 }),
      ]);

      const result = await repository().fetchSellpiaTopProducts(ORGANIZATION_ID, "2026-09");

      expect(result?.products[0]).toMatchObject({
        name: "찍찍이 가방 캐치볼 세트 판2개, 볼2개 가방케이스포함",
        revenue: 7_587_649,
      });
    });

    it("does not borrow a current price to invent monthly Sellpia profit", async () => {
      // #555 deliberately keeps the monthly source fact read to revenue and
      // quantity. Its persisted rows do not carry a sale-time buyPrice, so a
      // stale fixture value must not turn the monthly ranking into P&L.
      answer([fact({ productCode: "1", orderAmount: 10_000, orderQty: 5, buyPrice: 1_200, inAmount: 900_000 })]);

      const [row] = (await repository().fetchSellpiaTopProducts(ORGANIZATION_ID, "2026-09"))!.products;

      expect(row).toMatchObject({ revenue: 10_000, netProfit: null, profitRate: null });
      expect(row.profitKind).toBeUndefined();
    });

    it("keeps monthly profit unavailable across options without source cost", async () => {
      // Per-option buyPrice values are not part of the published monthly fact;
      // they must not become a fallback for this source's missing sale-time cost.
      answer([
        fact({ productCode: "1", optionCode: "1", orderAmount: 490_000, orderQty: 50, buyPrice: 0 }),
        fact({ productCode: "1", optionCode: "2", orderAmount: 10_000, orderQty: 1, buyPrice: 1_000 }),
      ]);

      const [row] = (await repository().fetchSellpiaTopProducts(ORGANIZATION_ID, "2026-09"))!.products;

      expect(row.revenue).toBe(500_000);
      expect(row.netProfit).toBeNull();
      expect(row.profitRate).toBeNull();
    });

    it("grades a product only when every master product its options map to agrees", async () => {
      answer([
        fact({ productCode: "agree", optionCode: "1", orderAmount: 5_000, masterProductId: "master-1" }),
        fact({ productCode: "agree", optionCode: "2", orderAmount: 4_000, masterProductId: "master-2" }),
        fact({ productCode: "split", optionCode: "1", orderAmount: 3_000, masterProductId: "master-3" }),
        fact({ productCode: "split", optionCode: "2", orderAmount: 2_000, masterProductId: "master-4" }),
        fact({ productCode: "unmapped", orderAmount: 1_000 }),
      ]);
      const leading = evaluation("B");
      mockedReadProductAbcPublication.mockResolvedValue({
        currentFormulaRevision: 1,
        currentMappingGeneration: "5",
        publication: null,
        products: [
          { masterProductId: "master-1", evaluation: leading, contributionEligible: true },
          { masterProductId: "master-2", evaluation: evaluation("B"), contributionEligible: true },
          { masterProductId: "master-3", evaluation: evaluation("A"), contributionEligible: true },
          { masterProductId: "master-4", evaluation: evaluation("C"), contributionEligible: true },
        ],
      });

      const result = await repository().fetchSellpiaTopProducts(ORGANIZATION_ID, "2026-09");

      expect(mockedReadProductAbcPublication).toHaveBeenCalledWith(expect.anything(), {
        organizationId: ORGANIZATION_ID,
        masterProductIds: ["master-1", "master-2", "master-3", "master-4"],
      });
      expect(result?.products.map((row) => [row.id, row.grade])).toEqual([
        ["sellpia:agree", "B"],
        ["sellpia:split", null],
        ["sellpia:unmapped", null],
      ]);
      expect(result?.products[0]?.abcEvaluation).toBe(leading);
      expect(result?.products[1]?.abcEvaluation).toBeNull();
    });

    it("answers nothing for a month with no published facts", async () => {
      answer([]);

      await expect(
        repository().fetchSellpiaTopProducts(ORGANIZATION_ID, "2026-09"),
      ).resolves.toBeNull();
    });

    it.each([
      ["facts captured over different windows", { coverageEndDate: new Date("2026-09-10T00:00:00.000Z") }],
      ["a fact with no coverage", { coverageStartDate: null }],
    ])("answers nothing for %s, so the order ranking stands", async (_label, override) => {
      answer([
        fact({ productCode: "1", orderAmount: 1_000 }),
        fact({ productCode: "2", orderAmount: 1_000, ...override }),
      ]);

      await expect(
        repository().fetchSellpiaTopProducts(ORGANIZATION_ID, "2026-09"),
      ).resolves.toBeNull();
    });
  });
});
