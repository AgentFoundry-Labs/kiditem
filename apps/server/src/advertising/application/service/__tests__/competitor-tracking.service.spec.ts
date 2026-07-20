import { beforeEach, describe, expect, it, vi } from "vitest";
import type { KeywordRankRepositoryPort } from "../../port/out/repository/keyword-rank.repository.port";
import type { KiditemStorefrontPort } from "../../port/out/provider/kiditem-storefront.port";
import {
  buildMockKeywordRankRepo,
  type MockKeywordRankRepo,
} from "../../../__tests__/test-helpers/build-mock-ports";
import { CompetitorTrackingService } from "../competitor-tracking.service";

describe("CompetitorTrackingService", () => {
  let repo: MockKeywordRankRepo;
  let service: CompetitorTrackingService;
  let storefront: {
    listNewProducts: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    repo = buildMockKeywordRankRepo();
    storefront = { listNewProducts: vi.fn().mockResolvedValue([]) };
    service = new CompetitorTrackingService(
      repo as unknown as KeywordRankRepositoryPort,
      storefront as unknown as KiditemStorefrontPort,
    );
    repo.listOwnVendorItems.mockResolvedValue([
      {
        vendorItemId: "own-1",
        skuId: "SKU-1",
        productName: "초등 캐릭터 연필 문구세트",
        category: "문구/연필",
      },
    ]);
    repo.listTrackers.mockResolvedValue([]);
    repo.findRecentSerpSnapshots.mockResolvedValue([]);
  });

  it("queries every data source with the authenticated organization scope", async () => {
    const result = await service.getOverview("organization-1", 14, 10);

    expect(repo.listOwnVendorItems).toHaveBeenCalledWith("organization-1");
    expect(repo.listTrackers).toHaveBeenCalledWith("organization-1");
    expect(repo.findRecentSerpSnapshots).toHaveBeenCalledWith(
      "organization-1",
      14,
    );
    expect(result.collection.status).toBe("not_configured");
    expect(result.collection.suggestedKeywords[0]).toBe(
      "노루잡화점 크런치 슬랑이",
    );
    expect(result.collection.suggestedKeywords).toContain("문구");
  });

  it("auto-configures tenant-scoped trackers from own stationery/toy products", async () => {
    repo.upsertTrackerByKeyword.mockImplementation(async (input) => ({
      id: `tracker-${input.keyword}`,
      organizationId: "organization-1",
      keyword: input.keyword,
      vendorItemIds: [],
      maxPages: input.maxPages ?? 2,
      enabled: true,
      lastCapturedAt: null,
      createdAt: new Date("2026-07-14T00:00:00.000Z"),
      updatedAt: new Date("2026-07-14T00:00:00.000Z"),
    }));

    const result = await service.autoConfigureTrackers("organization-1", 3);

    expect(result.configuredCount).toBeGreaterThan(0);
    expect(repo.upsertTrackerByKeyword).toHaveBeenCalledWith(
      expect.objectContaining({ maxPages: 2 }),
      "organization-1",
    );
  });

  it("prioritizes overlap searches derived from the live KidItem storefront", async () => {
    storefront.listNewProducts.mockResolvedValue([
      {
        externalId: "2232725",
        name: "4000만두쫀뜩말랑이",
        link: "http://www.kiditem.com/product/2232725",
      },
      {
        externalId: "2232700",
        name: "10000(집중력up)스마트폰감옥",
        link: "http://www.kiditem.com/product/2232700",
      },
    ]);
    repo.upsertTrackerByKeyword.mockImplementation(async (input) => ({
      id: `tracker-${input.keyword}`,
      organizationId: "organization-1",
      keyword: input.keyword,
      vendorItemIds: [],
      maxPages: input.maxPages ?? 2,
      enabled: true,
      lastCapturedAt: null,
      createdAt: new Date("2026-07-14T00:00:00.000Z"),
      updatedAt: new Date("2026-07-14T00:00:00.000Z"),
    }));

    const result = await service.autoConfigureTrackers("organization-1", 4);

    expect(result.keywords).toEqual([
      "노루잡화점 크런치 슬랑이",
      "리틀아이 팬시 완구",
      "페이버 슬랑이",
      "토이즈데이 말랑이",
    ]);
    expect(result.storefrontProductCount).toBe(2);
  });

  it("matches Coupang sellers against storefront products even without a Wing duplicate", async () => {
    repo.listOwnVendorItems.mockResolvedValue([]);
    storefront.listNewProducts.mockResolvedValue([
      {
        externalId: "2232700",
        name: "10000(집중력up)스마트폰감옥",
        link: "http://www.kiditem.com/product/2232700",
      },
    ]);
    repo.findRecentSerpSnapshots.mockResolvedValue([
      {
        keyword: "스마트폰 감옥",
        businessDate: new Date("2026-07-14T00:00:00.000Z"),
        capturedAt: new Date("2026-07-14T03:00:00.000Z"),
        pagesScanned: 1,
        itemCount: 1,
        items: {
          serpItems: [
            {
              rank: 1,
              productId: "7488385264",
              vendorItemId: "86829583122",
              name: "핸드폰 감옥 스마트폰 안하기 열쇠 잠금",
              sellerName: "제이와이 홀딩스",
              sellerId: "seller-jy",
              sellerStoreUrl: "https://shop.coupang.com/vid/seller-jy",
            },
          ],
        },
      },
    ]);

    const result = await service.getOverview("organization-1", 30, 20);

    expect(result.collection.storefrontProductCount).toBe(1);
    const seller = result.sellers.find(
      (candidate) => candidate.sellerName === "제이와이 홀딩스",
    );
    expect(seller).toMatchObject({
      sellerName: "제이와이 홀딩스",
      matchedOwnProductCount: 1,
    });
    expect(seller?.products[0].matchedOwnProducts[0]).toMatchObject({
      vendorItemId: "kiditem-storefront:2232700",
    });
  });

  it("returns only resolved sellers whose products overlap the own catalog", async () => {
    repo.findRecentSerpSnapshots.mockResolvedValue([
      {
        keyword: "연필 문구",
        businessDate: new Date("2026-07-14T00:00:00.000Z"),
        capturedAt: new Date("2026-07-14T03:00:00.000Z"),
        pagesScanned: 1,
        itemCount: 2,
        items: {
          serpItems: [
            {
              rank: 2,
              vendorItemId: "competitor-1",
              name: "초등 캐릭터 연필 문구세트 12자루",
              sellerName: "문구대장",
              sellerId: "seller-1",
              sellerStoreUrl: "https://shop.coupang.com/seller-1",
            },
            {
              rank: 3,
              vendorItemId: "unrelated-1",
              name: "스테인리스 주방 선반",
              sellerName: "리빙몰",
              sellerId: "seller-2",
              sellerStoreUrl: "https://shop.coupang.com/seller-2",
            },
          ],
          sellerCatalogs: [],
        },
      },
    ]);

    const result = await service.getSellerTargets("organization-1", 30, 20);

    expect(repo.findRecentSerpSnapshots).toHaveBeenCalledWith(
      "organization-1",
      30,
    );
    expect(result.targets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sellerId: "A00219251",
          keyword: "노루잡화점 크런치 슬랑이",
        }),
        expect.objectContaining({
          sellerId: "littlei",
          keyword: "리틀아이 팬시 완구",
        }),
        expect.objectContaining({
          sellerId: "seller-1",
          sellerName: "문구대장",
          keyword: "연필 문구",
          overlapProductCount: 1,
        }),
      ]),
    );
  });

  it("marks the Noru brand seller as a watched competitor", async () => {
    repo.listOwnVendorItems.mockResolvedValue([
      {
        vendorItemId: "own-squishy",
        skuId: "SKU-SQUISHY",
        productName: "크런치 슬랑이 말랑이",
        category: "완구/슬라임",
      },
    ]);
    repo.findRecentSerpSnapshots.mockResolvedValue([
      {
        keyword: "노루잡화점 크런치 슬랑이",
        businessDate: new Date("2026-07-14T00:00:00.000Z"),
        capturedAt: new Date("2026-07-14T03:00:00.000Z"),
        pagesScanned: 1,
        itemCount: 1,
        items: {
          serpItems: [
            {
              rank: 1,
              vendorItemId: "95365902585",
              name: "노루잡화점 크런치 슬랑이",
              sellerName: "도그블랑",
              sellerId: "A00219251",
              sellerStoreUrl: "https://shop.coupang.com/A00219251",
            },
          ],
          sellerCatalogs: [],
        },
      },
    ]);

    const result = await service.getOverview("organization-1", 30, 20);

    expect(result.sellers[0]).toMatchObject({
      sellerName: "도그블랑",
      brandName: "노루잡화점",
      watchlisted: true,
      sellerId: "A00219251",
    });
  });

  it("selects only overlapping product-detail URLs before seller resolution", async () => {
    repo.findRecentSerpSnapshots.mockResolvedValue([
      {
        keyword: "연필 문구",
        businessDate: new Date("2026-07-14T00:00:00.000Z"),
        capturedAt: new Date("2026-07-14T03:00:00.000Z"),
        pagesScanned: 1,
        itemCount: 2,
        items: {
          serpItems: [
            {
              rank: 2,
              vendorItemId: "competitor-1",
              name: "초등 캐릭터 연필 문구세트 12자루",
              link: "https://www.coupang.com/vp/products/1",
            },
            {
              rank: 3,
              vendorItemId: "unrelated-1",
              name: "스테인리스 주방 선반",
              link: "https://www.coupang.com/vp/products/2",
            },
          ],
          sellerCatalogs: [],
        },
      },
    ]);

    const result = await service.getProductDetailTargets(
      "organization-1",
      30,
      120,
    );

    expect(result.targets).toEqual([
      expect.objectContaining({
        keyword: "연필 문구",
        productKey: "competitor-1",
        link: "https://www.coupang.com/vp/products/1",
      }),
    ]);
  });

  it("prioritizes unresolved overlaps even after more than 200 sellers were resolved", async () => {
    const resolvedItems = Array.from({ length: 201 }, (_, index) => ({
      rank: index + 1,
      vendorItemId: `resolved-${index}`,
      name: `초등 캐릭터 연필 문구세트 ${index}`,
      link: `https://www.coupang.com/vp/products/${index + 100}`,
      sellerName: `확인된 판매자 ${index}`,
      sellerId: `resolved-seller-${index}`,
      sellerStoreUrl: `https://shop.coupang.com/resolved-seller-${index}`,
    }));
    repo.findRecentSerpSnapshots.mockResolvedValue([
      {
        keyword: "연필 문구",
        businessDate: new Date("2026-07-14T00:00:00.000Z"),
        capturedAt: new Date("2026-07-14T03:00:00.000Z"),
        pagesScanned: 6,
        itemCount: resolvedItems.length + 1,
        items: {
          serpItems: [
            ...resolvedItems,
            {
              rank: 202,
              vendorItemId: "new-overlap",
              name: "초등 캐릭터 연필 문구세트 신상품",
              link: "https://www.coupang.com/vp/products/9999",
            },
          ],
          sellerCatalogs: [],
        },
      },
    ]);

    const result = await service.getProductDetailTargets(
      "organization-1",
      30,
      200,
    );

    expect(result.targets).toEqual([
      expect.objectContaining({
        productKey: "new-overlap",
        link: "https://www.coupang.com/vp/products/9999",
      }),
    ]);
  });
});
