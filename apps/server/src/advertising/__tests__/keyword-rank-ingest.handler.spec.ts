import { describe, it, expect, beforeEach } from "vitest";
import { KeywordRankIngestHandler } from "../application/service/keyword-rank-ingest.handler";
import {
  buildMockKeywordRankRepo,
  type MockKeywordRankRepo,
} from "./test-helpers/build-mock-ports";
import type {
  KeywordRankRepositoryPort,
  KeywordTrackerRow,
  UpsertRankSnapshotInput,
} from "../application/port/out/repository/keyword-rank.repository.port";
import type { ExtensionSyncDto } from "../adapter/in/http/dto";

// `keyword_rank` ingest 매칭 규칙 unit 계약:
//   - 같은 vendorItemId 가 광고+오가닉 이중 노출이면 하나의 fact 로 fold
//     (overallRank=min, organicRank=오가닉만 센 순위, adRank=광고만 센 순위)
//   - 트래커 명시 타깃 미노출 → 순위 null miss 행(자사 이름 보충)
//   - 자사 카탈로그 자동매칭 상품은 노출됐을 때만 행 생성(null 스팸 없음)
//   - 미등록 키워드 캡처 → 트래커 즉석 생성(enabled=true, vendorItemIds=[])
// upsert 의 실제 DB 유니크/overwrite 동작은 adapter 계층 책임이므로 여기서는
// port 로 전달되는 행 shape 만 고정한다.

function buildTracker(
  overrides: Partial<KeywordTrackerRow> = {},
): KeywordTrackerRow {
  return {
    id: "tracker-1",
    organizationId: "organization-1",
    keyword: "유아 물병",
    vendorItemIds: [],
    maxPages: 2,
    enabled: true,
    lastCapturedAt: null,
    createdAt: new Date("2026-07-01T00:00:00Z"),
    updatedAt: new Date("2026-07-01T00:00:00Z"),
    ...overrides,
  };
}

function buildPayload(entry: Record<string, unknown>): ExtensionSyncDto {
  return {
    type: "keyword_rank",
    source: "coupang-search",
    timestamp: "2026-07-13T03:00:00.000Z",
    data: [entry],
  } as ExtensionSyncDto;
}

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
    repo.listOwnVendorItems.mockResolvedValue([]);
    repo.upsertRankSnapshots.mockImplementation(
      async (rows: UpsertRankSnapshotInput[]) => rows.length,
    );
    repo.upsertSerpSnapshot.mockResolvedValue({ id: "serp-1" });
    repo.mutateLatestSerpSnapshot.mockImplementation(async (input) => {
      const snapshot = await repo.findLatestSerp(
        input.organizationId,
        input.keyword,
      );
      if (!snapshot) return null;
      return input.mutateItems(snapshot) === null ? null : { id: "serp-1" };
    });
    repo.touchTrackerCaptured.mockResolvedValue(undefined);
  });

  it("folds ad + organic occurrences of the same vendorItemId into one row (min overall, per-type ranks)", async () => {
    repo.getTrackerByKeyword.mockResolvedValue(
      buildTracker({ vendorItemIds: ["V1"] }),
    );

    const payload = buildPayload({
      keyword: "유아 물병",
      capturedAt: "2026-07-13T03:00:00.000Z",
      pagesScanned: 1,
      listSize: 4,
      items: [
        // DOM 순서: 광고 V1 → 광고 경쟁사 → 오가닉 경쟁사 → 오가닉 V1
        serpItem({ rank: 1, isAd: true, vendorItemId: "V1", priceKrw: 12900 }),
        serpItem({ rank: 2, isAd: true, vendorItemId: "C-AD" }),
        serpItem({ rank: 3, isAd: false, vendorItemId: "C-ORG" }),
        serpItem({
          rank: 4,
          isAd: false,
          vendorItemId: "V1",
          positionInPage: 4,
        }),
      ],
    });

    const result = await handler.execute(payload, "organization-1");

    expect(repo.upsertRankSnapshots).toHaveBeenCalledTimes(1);
    const rows: UpsertRankSnapshotInput[] =
      repo.upsertRankSnapshots.mock.calls[0][0];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      organizationId: "organization-1",
      keyword: "유아 물병",
      vendorItemId: "V1",
      overallRank: 1, // min(1, 4)
      adRank: 1, // 광고만 센 순위에서 1번째
      organicRank: 2, // 오가닉만 센 순위에서 2번째 (C-ORG 다음)
      priceKrw: 12900, // 서술 필드는 best(min overall) 노출 기준
    });
    expect(result.results[0]).toMatchObject({
      keyword: "유아 물병",
      businessDate: "2026-07-13",
      matchedCount: 1,
      targetMissCount: 0,
      serpSaved: true,
    });
  });

  it("upserts a null-rank miss row for explicit tracker targets absent from the capture", async () => {
    repo.getTrackerByKeyword.mockResolvedValue(
      buildTracker({ vendorItemIds: ["V-MISS"] }),
    );
    repo.listOwnVendorItems.mockResolvedValue([
      { vendorItemId: "V-MISS", productName: "자사 미노출 상품" },
    ]);

    const payload = buildPayload({
      keyword: "유아 물병",
      capturedAt: "2026-07-13T03:00:00.000Z",
      pagesScanned: 2,
      listSize: 1,
      items: [serpItem({ rank: 1, vendorItemId: "C-ORG" })],
    });

    const result = await handler.execute(payload, "organization-1");

    const rows: UpsertRankSnapshotInput[] =
      repo.upsertRankSnapshots.mock.calls[0][0];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      vendorItemId: "V-MISS",
      overallRank: null,
      organicRank: null,
      adRank: null,
      page: null,
      productName: "자사 미노출 상품",
    });
    expect(result.results[0]).toMatchObject({
      matchedCount: 0,
      targetMissCount: 1,
    });
  });

  it("creates a hit row for auto-matched own-catalog products, but no miss row when absent", async () => {
    repo.getTrackerByKeyword.mockResolvedValue(buildTracker());
    repo.listOwnVendorItems.mockResolvedValue([
      { vendorItemId: "V-OWN", productName: "자사 물병" },
      { vendorItemId: "V-OWN-ABSENT", productName: "자사 미노출" },
    ]);

    const payload = buildPayload({
      keyword: "유아 물병",
      capturedAt: "2026-07-13T03:00:00.000Z",
      pagesScanned: 1,
      listSize: 2,
      items: [
        serpItem({ rank: 1, vendorItemId: "C-ORG" }),
        serpItem({
          rank: 2,
          vendorItemId: "V-OWN",
          name: null,
          positionInPage: 2,
        }),
      ],
    });

    const result = await handler.execute(payload, "organization-1");

    const rows: UpsertRankSnapshotInput[] =
      repo.upsertRankSnapshots.mock.calls[0][0];
    // 자동매칭 전용은 노출된 V-OWN 만 — V-OWN-ABSENT 의 null 행은 없다.
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      vendorItemId: "V-OWN",
      overallRank: 2,
      organicRank: 2,
      adRank: null,
      productName: "자사 물병", // SERP name 없으면 카탈로그 이름 보충
    });
    expect(result.results[0]).toMatchObject({
      matchedCount: 1,
      targetMissCount: 0,
    });
  });

  it("auto-creates a tracker (vendorItemIds=[]) when a capture arrives for an unknown keyword", async () => {
    repo.getTrackerByKeyword.mockResolvedValue(null);
    repo.upsertTrackerByKeyword.mockResolvedValue(
      buildTracker({ id: "tracker-new", keyword: "신규 키워드" }),
    );

    const payload = buildPayload({
      keyword: "신규 키워드",
      capturedAt: "2026-07-13T03:00:00.000Z",
      pagesScanned: 1,
      listSize: 1,
      items: [serpItem({ rank: 1, vendorItemId: "C-ORG" })],
    });

    await handler.execute(payload, "organization-1");

    expect(repo.upsertTrackerByKeyword).toHaveBeenCalledWith(
      { keyword: "신규 키워드", vendorItemIds: [] },
      "organization-1",
    );
    expect(repo.touchTrackerCaptured).toHaveBeenCalledWith(
      "tracker-new",
      "organization-1",
      new Date("2026-07-13T03:00:00.000Z"),
    );
    // SERP 전체 캡처도 저장된다 (키워드-일자당 최신본).
    expect(repo.upsertSerpSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        keyword: "신규 키워드",
        itemCount: 1,
        pagesScanned: 1,
        items: {
          serpItems: [
            expect.objectContaining({
              sellerName: "기본 판매자",
              sellerId: "seller-default",
              sellerStoreUrl: "https://shop.coupang.com/seller-default",
              imageUrl: "https://thumbnail.example/serp.jpg",
            }),
          ],
          sellerCatalogs: [],
        },
      }),
      expect.any(Function),
    );
  });

  it("persists a validated newest-first seller catalog beside the SERP snapshot", async () => {
    repo.getTrackerByKeyword.mockResolvedValue(
      buildTracker({ vendorItemIds: [] }),
    );
    const payload = buildPayload({
      keyword: "문구 세트",
      capturedAt: "2026-07-14T03:00:00.000Z",
      items: [serpItem({ sellerId: "seller-1" })],
      sellerCatalogs: [
        {
          sellerId: "seller-1",
          sellerName: "문구대장",
          sellerStoreUrl: "https://shop.coupang.com/seller-1",
          capturedAt: "2026-07-14T03:00:00.000Z",
          totalProductCount: 2,
          products: [
            {
              sourceRank: 1,
              vendorItemId: "new-1",
              name: "새 캐릭터 연필",
              priceKrw: 7900,
              imageUrl: "https://thumbnail.example/catalog.jpg",
            },
          ],
        },
      ],
    });

    await handler.execute(payload, "organization-1");

    expect(repo.upsertSerpSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        items: expect.objectContaining({
          sellerCatalogs: [
            expect.objectContaining({
              sellerId: "seller-1",
              sort: "newest",
              collectedProductCount: 1,
              products: [
                expect.objectContaining({
                  vendorItemId: "new-1",
                  imageUrl: "https://thumbnail.example/catalog.jpg",
                }),
              ],
            }),
          ],
        }),
      }),
      expect.any(Function),
    );
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
    expect(repo.mutateLatestSerpSnapshot).toHaveBeenCalledOnce();
  });

  it("skips malformed SERP items defensively without failing the ingest", async () => {
    repo.getTrackerByKeyword.mockResolvedValue(
      buildTracker({ vendorItemIds: ["V1"] }),
    );

    const payload = buildPayload({
      keyword: "유아 물병",
      capturedAt: "2026-07-13T03:00:00.000Z",
      pagesScanned: 1,
      listSize: 3,
      items: [null, "garbage", serpItem({ rank: 3, vendorItemId: "V1" })],
    });

    const result = await handler.execute(payload, "organization-1");

    const rows: UpsertRankSnapshotInput[] =
      repo.upsertRankSnapshots.mock.calls[0][0];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ vendorItemId: "V1", overallRank: 3 });
    // 깨진 항목은 SERP 저장에서도 제외되고 itemCount 는 파싱된 항목 기준.
    expect(repo.upsertSerpSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ itemCount: 1 }),
      expect.any(Function),
    );
    expect(result.results[0].serpSaved).toBe(true);
  });
});
