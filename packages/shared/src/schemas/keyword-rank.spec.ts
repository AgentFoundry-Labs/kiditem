import { describe, expect, it } from "vitest";
import { ProductKeywordRankOverviewResponseSchema } from "./keyword-rank";

const response = {
  periodDays: 7,
  summary: {
    productCount: 1,
    optionCount: 1,
    duplicateOptionCount: 0,
    representativeKeywordCount: 1,
    rankedCount: 1,
    top20Count: 1,
    risingCount: 0,
    fallingCount: 0,
    outOfRangeCount: 0,
    notCollectedCount: 0,
  },
  rows: [
    {
      keyword: "아기 장난감",
      keywordSource: "wing_performance",
      keywordScore: 82,
      recommendationReason: "Wing performance",
      automaticKeyword: "아기 장난감",
      category: "출산/유아",
      candidates: [
        {
          keyword: "아기 장난감",
          origin: "coupang_category",
          score: 82,
          salesRank: 7,
          keywordSalesLast28d: 120,
          keywordViewsLast28d: 1_200,
          keywordConversionRate28d: 0.1,
          observed: true,
        },
      ],
      vendorItemId: "vendor-1",
      groupedVendorItemIds: ["vendor-1"],
      groupedOptionCount: 1,
      skuId: "sku-1",
      productName: "상품",
      abcGrades: ["A"],
      currentSalesRank: 7,
      previousSalesRank: null,
      salesLast28d: 120,
      viewsLast28d: 1_200,
      revenueLast28d: 2_400_000,
      conversionRate28d: 0.1,
      salePrice: 20_000,
      reviewCount: 40,
      collectedCount: 200,
      totalResults: 1_000,
      businessDate: "2026-09-12",
      capturedAt: "2026-09-12T03:00:00.000Z",
      history: [
        {
          businessDate: "2026-09-12",
          salesRank: 7,
          salesLast28d: 120,
        },
      ],
    },
  ],
} as const;

describe("ProductKeywordRankOverviewResponseSchema", () => {
  it("accepts a measured product whose previous-day rank is unavailable", () => {
    expect(ProductKeywordRankOverviewResponseSchema.parse(response)).toEqual(
      response,
    );
  });

  it("rejects a response that omits the nullable previous-day rank contract", () => {
    const { previousSalesRank: _, ...row } = response.rows[0];

    expect(() =>
      ProductKeywordRankOverviewResponseSchema.parse({
        ...response,
        rows: [row],
      }),
    ).toThrow();
  });
});
