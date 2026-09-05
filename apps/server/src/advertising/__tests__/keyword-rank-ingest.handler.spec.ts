import { describe, it, expect, beforeEach } from "vitest";
import { KeywordRankIngestHandler } from "../application/service/keyword-rank-ingest.handler";
import {
  buildMockKeywordRankRepo,
  type MockKeywordRankRepo,
} from "./test-helpers/build-mock-ports";
import type { KeywordRankRepositoryPort } from "../application/port/out/repository/keyword-rank.repository.port";
import type { ExtensionSyncDto } from "../adapter/in/http/dto";

// `keyword_rank` ingest 매칭 규칙 unit 계약:
//   - 같은 vendorItemId 가 광고+오가닉 이중 노출이면 하나의 fact 로 fold
//     (overallRank=min, organicRank=오가닉만 센 순위, adRank=광고만 센 순위)
//   - 트래커 명시 타깃 미노출 → 순위 null miss 행(자사 이름 보충)
//   - 자사 카탈로그 자동매칭 상품은 노출됐을 때만 행 생성(null 스팸 없음)
// 순수 파서/fold 결과를 고정한다. 트래커 생성, upsert, 세대별 읽기 및
// 카탈로그 보존은 실제 owner HTTP/PostgreSQL 테스트에서 검증한다.

function serpItem(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    rank: 1,
    page: 1,
    positionInPage: 1,
    isAd: false,
    productId: "P1",
    itemId: "I1",
    vendorItemId: null,
    name: "상품",
    priceKrw: 10000,
    reviewCount: 10,
    ratingScore: 4.5,
    sellerName: "기본 판매자",
    sellerId: "seller-default",
    sellerStoreUrl: "https://shop.coupang.com/seller-default",
    imageUrl: "https://thumbnail.example/serp.jpg",
    link: "https://www.coupang.com/vp/products/1",
    ...overrides,
  };
}

describe("KeywordRankIngestHandler", () => {
  let repo: MockKeywordRankRepo;
  let handler: KeywordRankIngestHandler;

  beforeEach(() => {
    repo = buildMockKeywordRankRepo();
    handler = new KeywordRankIngestHandler(
      repo as unknown as KeywordRankRepositoryPort,
    );
    repo.mutateLatestSerpSnapshot.mockImplementation(async (input) => {
      const snapshot = await repo.findLatestSerp(
        input.organizationId,
        input.keyword,
      );
      if (!snapshot) return null;
      return input.mutateItems(snapshot) === null ? null : { id: "serp-1" };
    });
  });

  it("normalizes frozen explicit and own targets with original fold, null misses and no auto-only misses", () => {
    const capture = {
      keyword: "유아 물병",
      capturedAt: "2026-07-13T03:00:00.000Z",
      pagesScanned: 1,
      items: [
        serpItem({ rank: 1, isAd: true, vendorItemId: "V1", priceKrw: 12900 }),
        serpItem({ rank: 2, isAd: true, vendorItemId: "C-AD" }),
        serpItem({ rank: 3, isAd: false, vendorItemId: "OWN" }),
        serpItem({ rank: 4, isAd: false, vendorItemId: "V1" }),
      ],
    };
    const result = handler.normalizeCapture(
      capture,
      {
        explicitVendorItemIds: ["V1", "MISS"],
        ownItems: [
          { vendorItemId: "OWN", productName: "Own" },
          { vendorItemId: "ABSENT", productName: "Absent" },
        ],
      },
      "organization-1",
    );
    expect(result.rankRows).toMatchObject([
      {
        vendorItemId: "V1",
        overallRank: 1,
        adRank: 1,
        organicRank: 2,
        priceKrw: 12900,
      },
      { vendorItemId: "OWN", overallRank: 3, organicRank: 1, adRank: null },
      {
        vendorItemId: "MISS",
        overallRank: null,
        organicRank: null,
        adRank: null,
      },
    ]);
    expect(result).toMatchObject({
      matchedCount: 2,
      targetMissCount: 1,
      businessDate: new Date("2026-07-13T00:00:00.000Z"),
    });
  });

  it("keeps defensive row parsing and own listing name fallback in the pure normalizer", () => {
    const result = handler.normalizeCapture(
      {
        keyword: "문구",
        capturedAt: "2026-07-13T03:00:00.000Z",
        pagesScanned: 1,
        items: [
          null,
          "bad",
          [],
          { vendorItemId: "OWN", page: 1, positionInPage: 1 },
        ],
      },
      {
        explicitVendorItemIds: [],
        ownItems: [{ vendorItemId: "OWN", productName: "Listing name" }],
      },
      "organization-1",
    );
    expect(result.items).toHaveLength(1);
    expect(result.rankRows).toMatchObject([
      { vendorItemId: "OWN", overallRank: 1, productName: "Listing name" },
    ]);
  });

  it("merges a selected overlapping seller catalog into its existing keyword snapshot", async () => {
    const existingSnapshot = {
      keyword: "문구 세트",
      businessDate: new Date("2026-07-14T00:00:00.000Z"),
      capturedAt: new Date("2026-07-14T03:00:00.000Z"),
      pagesScanned: 2,
      itemCount: 1,
      items: {
        serpItems: [
          serpItem({
            sellerId: "seller-1",
            sellerStoreUrl: "https://shop.coupang.com/seller-1",
          }),
        ],
        sellerCatalogs: [],
      },
    };
    repo.findLatestSerp.mockResolvedValue(existingSnapshot);
    const payload = {
      type: "competitor_seller_catalog",
      timestamp: "2026-07-14T04:00:00.000Z",
      data: [
        {
          keyword: "문구 세트",
          sellerId: "seller-1",
          sellerName: "문구대장",
          sellerStoreUrl: "https://shop.coupang.com/seller-1",
          capturedAt: "2026-07-14T04:00:00.000Z",
          totalProductCount: 1,
          products: [
            {
              sourceRank: 1,
              vendorItemId: "catalog-1",
              name: "신상품 연필 세트",
              imageUrl: "https://thumbnail.example/catalog-on-demand.jpg",
            },
          ],
        },
      ],
    } as ExtensionSyncDto;

    const result = await handler.executeSellerCatalogs(
      payload,
      "organization-1",
    );

    expect(repo.findLatestSerp).toHaveBeenCalledWith(
      "organization-1",
      "문구 세트",
    );
    expect(repo.mutateLatestSerpSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "organization-1",
        keyword: "문구 세트",
        capturedAt: new Date("2026-07-14T04:00:00.000Z"),
        mutateItems: expect.any(Function),
      }),
    );
    const mutation = repo.mutateLatestSerpSnapshot.mock.calls[0][0];
    const savedItems = mutation.mutateItems(existingSnapshot) as {
      serpItems: Record<string, unknown>[];
      sellerCatalogs: Array<Record<string, unknown>>;
    };
    expect(savedItems).toEqual(
      expect.objectContaining({
        serpItems: [expect.objectContaining({ sellerId: "seller-1" })],
        sellerCatalogs: [
          expect.objectContaining({
            sellerId: "seller-1",
            products: [
              expect.objectContaining({
                vendorItemId: "catalog-1",
                imageUrl: "https://thumbnail.example/catalog-on-demand.jpg",
              }),
            ],
          }),
        ],
      }),
    );
    expect(result.results).toEqual([
      expect.objectContaining({ sellerId: "seller-1", productCount: 1 }),
    ]);
    expect(result.ignored).toEqual([]);
  });

  it("reports a missing SERP prerequisite separately from seller collection failure", async () => {
    repo.findLatestSerp.mockResolvedValue(null);
    const payload = {
      type: "competitor_seller_catalog",
      data: [
        {
          keyword: "문구 세트",
          sellerId: "seller-1",
          sellerStoreUrl: "https://shop.coupang.com/seller-1",
          capturedAt: "2026-07-14T04:00:00.000Z",
          products: [{ vendorItemId: "catalog-1", name: "신상품" }],
        },
      ],
    } as ExtensionSyncDto;

    const result = await handler.executeSellerCatalogs(
      payload,
      "organization-1",
    );

    expect(result.results).toEqual([]);
    expect(result.ignored).toEqual([
      {
        keyword: "문구 세트",
        sellerId: "seller-1",
        reason: "serp_snapshot_missing",
      },
    ]);
  });

  it("adds seller identity only to server-selected overlapping products", async () => {
    const existingSnapshot = {
      keyword: "문구 세트",
      businessDate: new Date("2026-07-14T00:00:00.000Z"),
      capturedAt: new Date("2026-07-14T03:00:00.000Z"),
      pagesScanned: 2,
      itemCount: 2,
      items: {
        serpItems: [
          serpItem({
            vendorItemId: "overlap-1",
            sellerName: null,
            sellerId: null,
          }),
          serpItem({
            vendorItemId: "not-selected",
            sellerName: null,
            sellerId: null,
          }),
        ],
        sellerCatalogs: [],
      },
    };
    repo.findLatestSerp.mockResolvedValue(existingSnapshot);
    const payload = {
      type: "competitor_seller_identity",
      data: [
        {
          keyword: "문구 세트",
          productKey: "overlap-1",
          sellerName: "문구대장",
          sellerId: "seller-1",
          sellerStoreUrl: "https://shop.coupang.com/seller-1",
          capturedAt: "2026-07-14T03:30:00.000Z",
        },
      ],
    } as ExtensionSyncDto;

    const result = await handler.executeSellerIdentities(
      payload,
      "organization-1",
    );

    const mutation = repo.mutateLatestSerpSnapshot.mock.calls[0][0];
    const saved = mutation.mutateItems(existingSnapshot) as {
      serpItems: Record<string, unknown>[];
    };
    const savedItems = saved.serpItems;
    expect(savedItems[0]).toMatchObject({
      vendorItemId: "overlap-1",
      sellerName: "문구대장",
      sellerId: "seller-1",
      sellerStoreUrl: "https://shop.coupang.com/seller-1",
      sellerIdentityCapturedAt: "2026-07-14T03:30:00.000Z",
    });
    expect(savedItems[1]).toMatchObject({
      vendorItemId: "not-selected",
      sellerName: null,
      sellerId: null,
    });
    expect(result.results).toEqual([
      expect.objectContaining({ resolvedProductCount: 1 }),
    ]);
  });

  it("does not let a stale seller catalog overwrite the latest SERP snapshot", async () => {
    repo.findLatestSerp.mockResolvedValue({
      keyword: "문구 세트",
      businessDate: new Date("2026-07-14T00:00:00.000Z"),
      capturedAt: new Date("2026-07-14T05:00:00.000Z"),
      pagesScanned: 2,
      itemCount: 1,
      items: {
        serpItems: [],
        sellerCatalogs: [
          {
            sellerId: "seller-1",
            sellerName: "최신 판매자",
            sellerStoreUrl: "https://shop.coupang.com/seller-1",
            totalProductCount: 1,
            collectedProductCount: 1,
            isTruncated: false,
            sort: "newest",
            capturedAt: "2026-07-14T05:00:00.000Z",
            products: [
              {
                sourceRank: 1,
                vendorItemId: "latest-1",
                name: "최신 상품",
              },
            ],
          },
        ],
      },
    });
    const payload = {
      type: "competitor_seller_catalog",
      data: [
        {
          keyword: "문구 세트",
          sellerId: "seller-1",
          sellerStoreUrl: "https://shop.coupang.com/seller-1",
          capturedAt: "2026-07-14T04:00:00.000Z",
          products: [{ vendorItemId: "catalog-1", name: "오래된 상품" }],
        },
      ],
    } as ExtensionSyncDto;

    const result = await handler.executeSellerCatalogs(
      payload,
      "organization-1",
    );

    expect(result.results).toEqual([]);
    expect(result.ignored).toEqual([
      {
        keyword: "문구 세트",
        sellerId: "seller-1",
        reason: "newer_catalog_preserved",
      },
    ]);
    expect(repo.mutateLatestSerpSnapshot).toHaveBeenCalledOnce();
  });
});
