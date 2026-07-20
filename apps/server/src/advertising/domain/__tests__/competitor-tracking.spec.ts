import { describe, expect, it } from "vitest";
import {
  buildCompetitorTrackingOverview,
  deriveCompetitorKeywords,
  type CompetitorOwnProduct,
  type CompetitorSerpSnapshotInput,
} from "../competitor-tracking";

const ownProducts: CompetitorOwnProduct[] = [
  {
    vendorItemId: "own-pencil",
    skuId: "SKU-PENCIL",
    productName: "초등 캐릭터 연필 문구세트",
    category: "문구/학용품/연필",
  },
  {
    vendorItemId: "own-squishy",
    skuId: "SKU-SQUISHY",
    productName: "동물 말랑이 스퀴시 6종",
    category: "완구/피젯완구",
  },
];

function snapshot(date: string, items: unknown): CompetitorSerpSnapshotInput {
  return {
    keyword: "연필 문구",
    businessDate: new Date(`${date}T00:00:00.000Z`),
    capturedAt: new Date(`${date}T03:00:00.000Z`),
    pagesScanned: 1,
    items,
  };
}

describe("competitor tracking", () => {
  it("restores a verified watched seller identity in legacy snapshots", () => {
    const overview = buildCompetitorTrackingOverview(
      [
        {
          vendorItemId: "own-squishy",
          skuId: "SKU-SQUISHY",
          productName: "크런치 슬랑이 말랑이",
          category: "완구/슬라임",
        },
      ],
      [
        {
          keyword: "말랑이",
          businessDate: new Date("2026-07-14T00:00:00.000Z"),
          capturedAt: new Date("2026-07-14T03:00:00.000Z"),
          pagesScanned: 1,
          items: [
            {
              rank: 5,
              productId: "9528872416",
              vendorItemId: "95365902585",
              name: "노루잡화점 크런치 슬랑이 말랑이",
              link: "https://www.coupang.com/vp/products/9528872416",
            },
          ],
        },
      ],
      20,
    );

    expect(overview.sellers[0]).toMatchObject({
      sellerName: "도그블랑",
      brandName: "노루잡화점",
      sellerId: "A00219251",
      sellerResolved: true,
      watchlisted: true,
    });
  });

  it("derives stationery and toy keywords from the own catalog", () => {
    const keywords = deriveCompetitorKeywords(ownProducts, 6);

    expect(keywords).toContain("문구");
    expect(keywords).toContain("연필");
    expect(keywords).toContain("말랑이");
  });

  it("groups overlapping products by resolved seller and calculates changes", () => {
    const overview = buildCompetitorTrackingOverview(
      ownProducts,
      [
        snapshot("2026-07-13", [
          {
            rank: 8,
            vendorItemId: "competitor-pencil",
            name: "캐릭터 연필 학용품 12자루",
            priceKrw: 8900,
            reviewCount: 120,
            sellerName: "문구대장",
            sellerId: "seller-1",
            sellerStoreUrl: "https://shop.coupang.com/seller-1",
          },
        ]),
        snapshot("2026-07-14", [
          {
            rank: 3,
            vendorItemId: "competitor-pencil",
            name: "캐릭터 연필 학용품 12자루",
            priceKrw: 7900,
            reviewCount: 132,
            imageUrl: "https://thumbnail.example/pencil.jpg",
            sellerName: "문구대장",
            sellerId: "seller-1",
            sellerStoreUrl: "https://shop.coupang.com/seller-1",
          },
          {
            rank: 1,
            vendorItemId: "own-pencil",
            name: "초등 캐릭터 연필 문구세트",
          },
          {
            rank: 4,
            vendorItemId: "unrelated",
            name: "스테인리스 주방 선반",
            sellerName: "리빙몰",
          },
        ]),
      ],
      20,
    );

    expect(overview.summary.trackedSellerCount).toBe(1);
    expect(overview.summary.overlappingProductCount).toBe(1);
    expect(overview.sellers[0].sellerName).toBe("문구대장");
    expect(overview.sellers[0].products[0]).toMatchObject({
      rank: 3,
      rankChange: 5,
      priceChange: -1000,
      reviewChange: 12,
      imageUrl: "https://thumbnail.example/pencil.jpg",
    });
    expect(overview.sellers[0].products[0].matchedOwnProducts[0]).toMatchObject(
      {
        vendorItemId: "own-pencil",
      },
    );
  });

  it("keeps unresolved seller products explicit instead of inventing a company", () => {
    const overview = buildCompetitorTrackingOverview(
      ownProducts,
      [
        snapshot("2026-07-14", [
          {
            rank: 7,
            productId: "product-7",
            name: "초등 문구 캐릭터 연필 세트",
            priceKrw: 0,
          },
        ]),
      ],
      20,
    );

    expect(overview.summary.trackedSellerCount).toBe(0);
    expect(overview.summary.unresolvedSellerProductCount).toBe(1);
    expect(overview.sellers[0]).toMatchObject({
      sellerName: "판매자 확인 대기",
      sellerResolved: false,
    });
    expect(overview.sellers[0].products[0].priceKrw).toBeNull();
  });

  it("attaches the seller's newest-first catalog and detects products added after the baseline", () => {
    const sellerItem = {
      rank: 2,
      vendorItemId: "competitor-pencil",
      name: "캐릭터 연필 학용품 12자루",
      sellerName: "문구대장",
      sellerId: "seller-1",
      sellerStoreUrl: "https://shop.coupang.com/seller-1",
    };
    const overview = buildCompetitorTrackingOverview(
      ownProducts,
      [
        snapshot("2026-07-13", {
          serpItems: [sellerItem],
          sellerCatalogs: [
            {
              sellerId: "seller-1",
              sellerStoreUrl: "https://shop.coupang.com/seller-1",
              capturedAt: "2026-07-13T03:00:00.000Z",
              totalProductCount: 1,
              products: [
                {
                  sourceRank: 1,
                  vendorItemId: "old-product",
                  name: "기존 연필 세트",
                },
              ],
            },
          ],
        }),
        snapshot("2026-07-14", {
          serpItems: [sellerItem],
          sellerCatalogs: [
            {
              sellerId: "seller-1",
              sellerStoreUrl: "https://shop.coupang.com/seller-1",
              capturedAt: "2026-07-14T03:00:00.000Z",
              totalProductCount: 2,
              products: [
                {
                  sourceRank: 1,
                  vendorItemId: "new-product",
                  name: "오늘 등록된 신상품 연필",
                  imageUrl: "https://thumbnail.example/new.jpg",
                },
                {
                  sourceRank: 2,
                  vendorItemId: "old-product",
                  name: "기존 연필 세트",
                },
              ],
            },
          ],
        }),
      ],
      20,
    );

    expect(overview.sellers[0].catalog).toMatchObject({
      sellerStoreUrl: "https://shop.coupang.com/seller-1",
      sort: "newest",
      totalProductCount: 2,
      newProductCount: 1,
    });
    expect(
      overview.sellers[0].catalog?.products.map((product) => ({
        name: product.name,
        isNew: product.isNew,
      })),
    ).toEqual([
      { name: "오늘 등록된 신상품 연필", isNew: true },
      { name: "기존 연필 세트", isNew: false },
    ]);
    expect(overview.sellers[0].catalog?.products[0].imageUrl).toBe(
      "https://thumbnail.example/new.jpg",
    );
  });
});
