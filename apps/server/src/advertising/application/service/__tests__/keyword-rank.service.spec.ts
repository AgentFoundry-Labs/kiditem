import { beforeEach, describe, expect, it, vi } from "vitest";
import type { KeywordRankRepositoryPort } from "../../port/out/repository/keyword-rank.repository.port";
import {
  buildMockKeywordRankRepo,
  type MockKeywordRankRepo,
} from "../../../__tests__/test-helpers/build-mock-ports";
import { KeywordRankService } from "../keyword-rank.service";
import { currentBusinessDate } from "../../../domain/business-date";

const snapshot = (
  keyword: string,
  businessDate: string,
  salesRank: number | null,
  overrides: Record<string, unknown> = {},
) => ({
  keyword,
  vendorItemId: "V-1",
  businessDate: new Date(`${businessDate}T00:00:00.000Z`),
  productName: "Wing 상품명",
  categoryHierarchy: "완구 > 촉감완구 > 슬라임",
  salesRank,
  salesLast28d: 120,
  viewsLast28d: 1000,
  revenueLast28d: 1_200_000,
  conversionRate28d: 0.12,
  salePrice: 10_000,
  reviewCount: 45,
  keywordSalesLast28d: 500,
  keywordViewsLast28d: 5_000,
  keywordConversionRate28d: 0.1,
  collectedCount: 100,
  totalResults: 340,
  capturedAt: new Date(`${businessDate}T03:00:00.000Z`),
  ...overrides,
});

describe("KeywordRankService Wing sales rank overview", () => {
  let repo: MockKeywordRankRepo;
  let service: KeywordRankService;
  const findAbcGradesByProductVariantIds = vi.fn();

  beforeEach(() => {
    repo = buildMockKeywordRankRepo();
    service = new KeywordRankService(
      repo as unknown as KeywordRankRepositoryPort,
      { findAbcGradesByProductVariantIds } as never,
    );
    findAbcGradesByProductVariantIds.mockReset();
    findAbcGradesByProductVariantIds.mockResolvedValue(new Map());
    repo.listTrackers.mockResolvedValue([]);
    repo.listRepresentativeKeywordOverrides.mockResolvedValue([]);
    repo.listOwnVendorItems.mockResolvedValue([]);
    repo.findWingSalesRankSnapshots.mockResolvedValue([]);
  });

  it("chooses the strongest Wing candidate and calculates rank movement", async () => {
    repo.listOwnVendorItems.mockResolvedValue([
      {
        vendorItemId: "V-1",
        skuId: "wing:V-1",
        productName: "12000 2in1라켓볼세트",
        category: "완구 > 스포츠완구 > 라켓놀이",
        productVariantId: "variant-1",
      },
      {
        vendorItemId: "V-2",
        skuId: "wing:V-2",
        productName: "캐릭터 연필세트 12자루",
        category: "문구 > 필기구 > 연필",
        productVariantId: "variant-2",
      },
    ]);
    repo.findWingSalesRankSnapshots.mockResolvedValue([
      snapshot("라켓볼", "2026-07-12", 35, {
        keywordSalesLast28d: 900,
        keywordViewsLast28d: 7_000,
        keywordConversionRate28d: 0.13,
      }),
      snapshot("라켓볼", "2026-07-13", 31, {
        keywordSalesLast28d: 1_000,
        keywordViewsLast28d: 8_000,
        keywordConversionRate28d: 0.125,
      }),
      snapshot("라켓놀이", "2026-07-13", 8, {
        keywordSalesLast28d: 100,
        keywordViewsLast28d: 2_000,
        keywordConversionRate28d: 0.05,
      }),
    ]);

    const result = await service.getProductRankOverview(30, "organization-1");

    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toMatchObject({
      vendorItemId: "V-1",
      keyword: "라켓볼",
      keywordSource: "wing_performance",
      currentSalesRank: 31,
      previousSalesRank: 35,
      rankChange: 4,
      status: "rising",
      category: "완구 > 스포츠완구 > 라켓놀이",
    });
    expect(result.rows[1]).toMatchObject({
      vendorItemId: "V-2",
      keyword: "연필",
      currentSalesRank: null,
      status: "not_collected",
    });
    expect(result.summary).toMatchObject({
      productCount: 2,
      representativeKeywordCount: 2,
      rankedCount: 1,
      risingCount: 1,
      notCollectedCount: 1,
    });
  });

  it("uses a direct override and searches all automatic candidates otherwise", async () => {
    repo.listRepresentativeKeywordOverrides.mockResolvedValue([
      {
        id: "override-1",
        organizationId: "organization-1",
        vendorItemId: "V-2",
        keyword: "클리어 슬라임",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    repo.listOwnVendorItems.mockResolvedValue([
      {
        vendorItemId: "V-1",
        skuId: "wing:V-1",
        productName: "투명 슬라임",
        category: "완구 > 촉감완구 > 슬라임",
        productVariantId: "variant-1",
      },
      {
        vendorItemId: "V-2",
        skuId: "wing:V-2",
        productName: "투명 슬라임 6개",
        category: "완구 > 촉감완구 > 슬라임",
        productVariantId: "variant-2",
      },
    ]);

    const result = await service.getWingSalesRankTargets("organization-1");

    expect(result.productCount).toBe(2);
    expect(result.candidateCount).toBeGreaterThanOrEqual(2);
    expect(result.targets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ keyword: "슬라임", vendorItemIds: ["V-1"] }),
        expect.objectContaining({
          keyword: "클리어 슬라임",
          vendorItemIds: ["V-2"],
        }),
      ]),
    );
  });

  it("collapses identical catalog product names and keeps the best ranked option", async () => {
    repo.listOwnVendorItems.mockResolvedValue([
      {
        vendorItemId: "V-1",
        skuId: "wing:V-1",
        productName: "어린이 비눗방울 모음전",
        category: "완구 > 야외완구 > 비눗방울",
        productVariantId: "variant-1",
      },
      {
        vendorItemId: "V-2",
        skuId: "wing:V-2",
        productName: "어린이 비눗방울   모음전",
        category: "완구 > 야외완구 > 비눗방울",
        productVariantId: "variant-2",
      },
    ]);
    repo.findWingSalesRankSnapshots.mockResolvedValue([
      snapshot("비눗방울", "2026-07-13", null),
      snapshot("비눗방울", "2026-07-13", 4, {
        vendorItemId: "V-2",
        productName: "Wing 비눗방울 대표상품",
      }),
    ]);

    const result = await service.getProductRankOverview(
      30,
      "organization-1",
    );

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      vendorItemId: "V-2",
      currentSalesRank: 4,
      groupedOptionCount: 2,
      groupedVendorItemIds: ["V-1", "V-2"],
    });
    expect(result.summary).toMatchObject({
      productCount: 1,
      optionCount: 2,
      duplicateOptionCount: 1,
      rankedCount: 1,
    });
  });

  it("links CP-* channel products to Analytics ABC grades by confirmed variant", async () => {
    repo.listOwnVendorItems.mockResolvedValue([
      {
        vendorItemId: "V-1",
        skuId: "wing:V-1",
        productName: "채널 원본 상품",
        category: null,
        productVariantId: "variant-confirmed",
      },
    ]);
    findAbcGradesByProductVariantIds.mockResolvedValue(
      new Map([["variant-confirmed", ["A"]]]),
    );

    const result = await service.getProductRankOverview(30, "organization-1");

    expect(findAbcGradesByProductVariantIds).toHaveBeenCalledWith({
      organizationId: "organization-1",
      productVariantIds: ["variant-confirmed"],
    });
    expect(result.rows[0].abcGrades).toEqual(["A"]);
  });

  it("preserves the union of deterministic ABC grades when product names collapse", async () => {
    repo.listOwnVendorItems.mockResolvedValue([
      {
        vendorItemId: "V-1",
        skuId: "wing:V-1",
        productName: "동일 상품명",
        category: null,
        productVariantId: "variant-a",
      },
      {
        vendorItemId: "V-2",
        skuId: "wing:V-2",
        productName: "동일 상품명",
        category: null,
        productVariantId: "variant-c",
      },
    ]);
    findAbcGradesByProductVariantIds.mockResolvedValue(
      new Map([
        ["variant-a", ["A"]],
        ["variant-c", ["C"]],
      ]),
    );

    const result = await service.getProductRankOverview(30, "organization-1");

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].abcGrades).toEqual(["A", "C"]);
  });

  it("keeps the catalog product name ahead of Wing option-like snapshot names", async () => {
    repo.listOwnVendorItems.mockResolvedValue([
      {
        vendorItemId: "V-1",
        skuId: "wing:V-1",
        productName: "리스팅 채널 상품명",
        category: null,
        productVariantId: null,
      },
    ]);
    repo.findWingSalesRankSnapshots.mockResolvedValue([
      snapshot("상품", "2026-07-13", 1, { productName: "1개" }),
    ]);

    const result = await service.getProductRankOverview(30, "organization-1");

    expect(result.rows[0].productName).toBe("리스팅 채널 상품명");
    expect(result.rows[0].abcGrades).toEqual([]);
  });

  it("resumes with only uncollected targets and puts primary keywords first", async () => {
    repo.listOwnVendorItems.mockResolvedValue([
      {
        vendorItemId: "V-1",
        skuId: "wing:V-1",
        productName: "투명 슬라임",
        category: "완구 > 촉감완구 > 슬라임",
        productVariantId: "variant-1",
      },
      {
        vendorItemId: "V-2",
        skuId: "wing:V-2",
        productName: "캐릭터 연필세트",
        category: "문구 > 필기구 > 연필",
        productVariantId: "variant-2",
      },
    ]);
    repo.findWingSalesRankSnapshots.mockResolvedValue([
      snapshot("슬라임", currentBusinessDate().toISOString().slice(0, 10), 3),
    ]);

    const result = await service.getWingSalesRankTargets("organization-1");

    expect(result.resumed).toBe(true);
    expect(result.targets.some((target) => target.keyword === "슬라임")).toBe(
      false,
    );
    expect(result.targets[0]).toMatchObject({
      keyword: "연필",
      phase: "primary",
      pendingPrimaryProductCount: 1,
    });
  });

  it("saves and resets an organization-scoped direct override", async () => {
    repo.hasOwnVendorItem.mockResolvedValue(true);
    repo.upsertRepresentativeKeywordOverride.mockResolvedValue({
      id: "override-1",
      organizationId: "organization-1",
      vendorItemId: "V-1",
      keyword: "라켓볼",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    repo.deleteRepresentativeKeywordOverride.mockResolvedValue(1);

    await service.setRepresentativeKeyword("V-1", " 라켓볼 ", "organization-1");
    await service.resetRepresentativeKeyword("V-1", "organization-1");

    expect(repo.upsertRepresentativeKeywordOverride).toHaveBeenCalledWith(
      "organization-1",
      "V-1",
      "라켓볼",
    );
    expect(repo.deleteRepresentativeKeywordOverride).toHaveBeenCalledWith(
      "organization-1",
      "V-1",
    );
  });
});
