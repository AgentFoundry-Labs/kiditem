import { describe, it, expect, vi, beforeEach } from "vitest";
import { NotFoundException } from "@nestjs/common";
import { AdSyncService, type ListingMap } from "../ad-sync.service";
import type { AdListingRepositoryPort } from "../../port/out/repository/ad-listing.repository.port";
import type { ScrapeTargetRepositoryPort } from "../../port/out/repository/scrape-target.repository.port";
import type { ChannelScrapeRepositoryPort } from "../../port/out/repository/channel-scrape.repository.port";
import type { AdCampaignIngestHandler } from "../ad-campaign-ingest.handler";
import type { RawScrapeIngestHandler } from "../raw-scrape-ingest.handler";
import type { TrafficIngestHandler } from "../traffic-ingest.handler";
import type { CoupangAdsDailyIngestHandler } from "../coupang-ads-daily-ingest.handler";
import type { KeywordRankIngestHandler } from "../keyword-rank-ingest.handler";
import type { WingSalesRankIngestHandler } from "../wing-sales-rank-ingest.handler";
import type { AdIngestTransactionPort } from "../../port/out/transaction/ad-ingest-transaction.port";
import {
  buildMockAdListingRepo,
  buildMockScrapeTargetRepo,
  buildMockChannelScrapeRepo,
  type MockAdListingRepo,
  type MockScrapeTargetRepo,
  type MockChannelScrapeRepo,
} from "../../../__tests__/test-helpers/build-mock-ports";

// H2 daily-fact ingestion behavior (per-source handlers, scrape-run
// finalization, KST business-date semantics, metaJson namespacing) is
// covered against real Postgres in
// `apps/server/src/advertising/__tests__/channel-scrape-dual-write.pg.integration.spec.ts`
// and `apps/server/src/advertising/__tests__/ad-sync-flow.pg.integration.spec.ts`.
// The unit suite keeps only the contracts the integration tier cannot
// observe at low cost: matching priority, scrape-target IDOR, and the
// status-read response shape.

describe("AdSyncService", () => {
  let service: AdSyncService;
  let listingRepo: MockAdListingRepo;
  let scrapeTargetRepo: MockScrapeTargetRepo;
  let scrapeRepo: MockChannelScrapeRepo;
  let ingestTransaction: { runIdempotent: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    listingRepo = buildMockAdListingRepo();
    scrapeTargetRepo = buildMockScrapeTargetRepo();
    scrapeRepo = buildMockChannelScrapeRepo();
    ingestTransaction = { runIdempotent: vi.fn() };
    service = new AdSyncService(
      listingRepo as unknown as AdListingRepositoryPort,
      scrapeTargetRepo as unknown as ScrapeTargetRepositoryPort,
      scrapeRepo as unknown as ChannelScrapeRepositoryPort,
      {} as AdCampaignIngestHandler,
      {} as RawScrapeIngestHandler,
      {} as TrafficIngestHandler,
      {} as CoupangAdsDailyIngestHandler,
      {} as KeywordRankIngestHandler,
      {} as WingSalesRankIngestHandler,
      ingestTransaction as unknown as AdIngestTransactionPort,
    );
  });

  it("runs an authoritative replay key once and returns the persisted response on retry", async () => {
    const map: ListingMap = {
      channelAccountId: "account-1",
      externalOptionIdMap: new Map(),
      externalIdMap: new Map(),
    };
    listingRepo.buildAdSyncListingMap.mockResolvedValue(map);
    const handler = {
      execute: vi.fn(async () => ({
        success: true,
        scrapeRunId: "run-1",
        scrapeSnapshotCount: 2,
      })),
    };
    let cached: unknown;
    ingestTransaction.runIdempotent.mockImplementation(
      async (_input, operation) => {
        if (cached !== undefined) return { value: cached, replayed: true };
        cached = await operation();
        return { value: cached, replayed: false };
      },
    );
    service = new AdSyncService(
      listingRepo as unknown as AdListingRepositoryPort,
      scrapeTargetRepo as unknown as ScrapeTargetRepositoryPort,
      scrapeRepo as unknown as ChannelScrapeRepositoryPort,
      {} as AdCampaignIngestHandler,
      handler as unknown as RawScrapeIngestHandler,
      {} as TrafficIngestHandler,
      {} as CoupangAdsDailyIngestHandler,
      {} as KeywordRankIngestHandler,
      {} as WingSalesRankIngestHandler,
      ingestTransaction as unknown as AdIngestTransactionPort,
    );
    const payload = {
      type: "raw_scrape",
      source: "wing",
      idempotencyKey:
        "authoritative-rebuild:12345:550e8400-e29b-41d4-a716-446655440000",
    };

    const first = await service.sync(payload, "organization-1");
    const retry = await service.sync(payload, "organization-1");

    expect(first).toMatchObject({ success: true, replayed: false });
    expect(retry).toMatchObject({ success: true, replayed: true });
    expect(handler.execute).toHaveBeenCalledTimes(1);
    expect(ingestTransaction.runIdempotent).toHaveBeenCalledWith(
      {
        organizationId: "organization-1",
        idempotencyKey: payload.idempotencyKey,
      },
      expect.any(Function),
    );
  });

  describe("buildListingMap", () => {
    it("delegates to AdListingRepositoryPort.buildAdSyncListingMap and returns the map verbatim", async () => {
      const map: ListingMap = {
        channelAccountId: "account-1",
        externalOptionIdMap: new Map([
          [
            "V1",
            {
              listingId: "L1",
              listingOptionId: "LO1",
              externalId: "COUPANG-1",
            },
          ],
          [
            "V2",
            {
              listingId: "L2",
              listingOptionId: "LO2",
              externalId: "COUPANG-2",
            },
          ],
        ]),
        externalIdMap: new Map([
          ["COUPANG-1", { listingId: "L1" }],
          ["COUPANG-2", { listingId: "L2" }],
        ]),
      };
      listingRepo.buildAdSyncListingMap.mockResolvedValue(map);

      const result = await service.buildListingMap("organization-1");

      expect(result.externalOptionIdMap.get("V1")).toEqual({
        listingId: "L1",
        listingOptionId: "LO1",
        externalId: "COUPANG-1",
      });
      expect(result.externalOptionIdMap.get("V2")).toEqual({
        listingId: "L2",
        listingOptionId: "LO2",
        externalId: "COUPANG-2",
      });
      expect(result.externalIdMap.get("COUPANG-1")).toEqual({
        listingId: "L1",
      });
      expect(result.externalIdMap.get("COUPANG-2")).toEqual({
        listingId: "L2",
      });

      expect(listingRepo.buildAdSyncListingMap).toHaveBeenCalledWith(
        "organization-1",
      );
    });

    it("preserves externalOptionIdMap entries without a legacy internal option id", async () => {
      const map: ListingMap = {
        channelAccountId: "account-1",
        externalOptionIdMap: new Map([
          [
            "V1",
            {
              listingId: "L1",
              listingOptionId: "LO1",
              externalId: "COUPANG-NULL",
            },
          ],
        ]),
        externalIdMap: new Map(),
      };
      listingRepo.buildAdSyncListingMap.mockResolvedValue(map);

      const result = await service.buildListingMap("organization-1");

      // ChannelListingOption.id alone owns the channel option identity.
      expect(result.externalOptionIdMap.get("V1")).toEqual({
        listingId: "L1",
        listingOptionId: "LO1",
        externalId: "COUPANG-NULL",
      });
    });

    it("cross-tenant isolation — organization B externalOptionId does not leak into organization A map", async () => {
      const empty: ListingMap = {
        channelAccountId: "account-a",
        externalOptionIdMap: new Map(),
        externalIdMap: new Map(),
      };
      listingRepo.buildAdSyncListingMap.mockResolvedValue(empty);

      const result = await service.buildListingMap("organization-A");

      expect(result.externalOptionIdMap.size).toBe(0);
      expect(result.externalIdMap.size).toBe(0);
      expect(listingRepo.buildAdSyncListingMap).toHaveBeenCalledWith(
        "organization-A",
      );
    });

    it("propagates the explicit Coupang channel account to the repository", async () => {
      const map: ListingMap = {
        channelAccountId: "account-2",
        externalOptionIdMap: new Map(),
        externalIdMap: new Map(),
      };
      listingRepo.buildAdSyncListingMap.mockResolvedValue(map);

      await service.buildListingMap("organization-1", "account-2");

      expect(listingRepo.buildAdSyncListingMap).toHaveBeenCalledWith(
        "organization-1",
        "account-2",
      );
    });
  });

  describe("matchListingFromRow", () => {
    const map: ListingMap = {
      channelAccountId: "account-1",
      externalOptionIdMap: new Map<
        string,
        {
          listingId: string;
          listingOptionId: string;
          externalId: string;
        }
      >([
        [
          "V-HIT",
          {
            listingId: "L-V",
            listingOptionId: "LO-V",
            externalId: "E-V",
          },
        ],
      ]),
      externalIdMap: new Map([["E-HIT", { listingId: "L-E" }]]),
    };

    it("returns full match when provider vendorItemId hits externalOptionIdMap", () => {
      const result = service.matchListingFromRow(
        { vendorItemId: "V-HIT" },
        map,
      );
      expect(result).toEqual({
        listingId: "L-V",
        listingOptionId: "LO-V",
        externalId: "E-V",
        externalOptionId: "V-HIT",
      });
    });

    it("falls back to externalId when vendorItemId misses", () => {
      const result = service.matchListingFromRow(
        { vendorItemId: "V-MISS", externalId: "E-HIT" },
        map,
      );
      expect(result).toEqual({
        listingId: "L-E",
        listingOptionId: null,
        externalId: "E-HIT",
        externalOptionId: null,
      });
    });

    it("returns nulls when both vendorItemId and externalId miss", () => {
      const result = service.matchListingFromRow(
        { vendorItemId: "V-MISS", externalId: "E-MISS" },
        map,
      );
      expect(result).toEqual({
        listingId: null,
        listingOptionId: null,
        externalId: null,
        externalOptionId: null,
      });
    });

    it("returns nulls when row has neither vendorItemId nor externalId", () => {
      const result = service.matchListingFromRow(
        { productName: "unmatched" },
        map,
      );
      expect(result).toEqual({
        listingId: null,
        listingOptionId: null,
        externalId: null,
        externalOptionId: null,
      });
    });
  });

  describe("scrapeTarget CRUD (IDOR guards)", () => {
    it("markScraped writes with tenant scope and returns the updated target shape", async () => {
      const target = {
        id: "target-1",
        organizationId: "organization-1",
        url: "https://x.com/a",
        label: "Label",
        category: "advertising",
        isActive: true,
        lastScrapedAt: new Date("2026-04-29T00:00:00Z"),
        createdAt: new Date("2026-04-01T00:00:00Z"),
      };
      scrapeTargetRepo.markScraped.mockResolvedValue(target);

      await expect(
        service.markScraped("target-1", "organization-1"),
      ).resolves.toBe(target);

      expect(scrapeTargetRepo.markScraped).toHaveBeenCalledWith(
        "target-1",
        "organization-1",
      );
    });

    it("markScraped throws NotFoundException when id belongs to different tenant", async () => {
      scrapeTargetRepo.markScraped.mockRejectedValue(
        new NotFoundException("not found"),
      );

      await expect(
        service.markScraped("target-other-tenant", "organization-1"),
      ).rejects.toThrow(NotFoundException);
    });

    it("deleteScrapeTarget writes with tenant scope and returns the updated target shape", async () => {
      const target = {
        id: "target-1",
        organizationId: "organization-1",
        url: "https://x.com/a",
        label: "Label",
        category: "advertising",
        isActive: false,
        lastScrapedAt: null,
        createdAt: new Date("2026-04-01T00:00:00Z"),
      };
      scrapeTargetRepo.softDelete.mockResolvedValue(target);

      await expect(
        service.deleteScrapeTarget("target-1", "organization-1"),
      ).resolves.toBe(target);

      expect(scrapeTargetRepo.softDelete).toHaveBeenCalledWith(
        "target-1",
        "organization-1",
      );
    });

    it("deleteScrapeTarget throws NotFoundException when id belongs to different tenant", async () => {
      scrapeTargetRepo.softDelete.mockRejectedValue(
        new NotFoundException("not found"),
      );

      await expect(
        service.deleteScrapeTarget("target-other-tenant", "organization-1"),
      ).rejects.toThrow(NotFoundException);
    });

    it("createScrapeTarget scopes to organizationId (no default fallback)", async () => {
      scrapeTargetRepo.create.mockResolvedValue({
        id: "t1",
        organizationId: "organization-xyz",
        url: "https://x.com/a",
        label: "Label",
        category: "advertising",
        isActive: true,
        lastScrapedAt: null,
        createdAt: new Date(),
      });

      await service.createScrapeTarget(
        "https://x.com/a",
        "Label",
        undefined,
        "organization-xyz",
      );

      expect(scrapeTargetRepo.create).toHaveBeenCalledWith(
        { url: "https://x.com/a", label: "Label", category: undefined },
        "organization-xyz",
      );
    });
  });

  describe("getExtensionStatus (H3 — current-state semantics)", () => {
    it("aggregates winner/non-winner/unknown counts from latest daily snapshot per listing", async () => {
      scrapeRepo.findExtensionStatusSnapshot.mockResolvedValue({
        listingCount: 7,
        latestPerListing: [
          {
            isOfferWinner: true,
            lastObservedAt: new Date("2026-04-25T00:00:00Z"),
          },
          {
            isOfferWinner: true,
            lastObservedAt: new Date("2026-04-26T00:00:00Z"),
          },
          {
            isOfferWinner: false,
            lastObservedAt: new Date("2026-04-26T00:00:00Z"),
          },
          {
            isOfferWinner: null,
            lastObservedAt: new Date("2026-04-27T00:00:00Z"),
          },
        ],
        rawSnapshotCount: 42,
        latestRun: {
          finishedAt: new Date("2026-04-27T03:00:00Z"),
          startedAt: new Date("2026-04-27T02:00:00Z"),
          pageType: "itemwinner",
        },
        wingKpi: {
          normalizedJson: {
            kpis: { "아이템위너 상품": "2", "노출제한 상품": "0" },
          },
          lastObservedAt: new Date("2026-04-27T03:00:00Z"),
        },
      });

      const result = await service.getExtensionStatus("organization-1");

      expect(result.connected).toBe(true);
      expect(result.listingCount).toBe(7);
      expect(result.currentWinnerCount).toBe(2);
      expect(result.currentNonWinnerCount).toBe(1);
      expect(result.currentUnknownWinnerCount).toBe(1);
      expect(result.currentWinnerObservedListings).toBe(4);
      expect(result.rawSnapshotCount).toBe(42);
      expect(result.latestScrapeAt).toEqual(new Date("2026-04-27T03:00:00Z"));
      expect(result.latestScrapePageType).toBe("itemwinner");
      // latestChannelStateAt = max(lastObservedAt) across rows
      expect(result.latestChannelStateAt).toEqual(
        new Date("2026-04-27T00:00:00Z"),
      );
      expect(result.wing.kpis["아이템위너 상품"]).toBe("2");
    });

    it("empty-state — no daily-fact rows returns explicit zeros + null timestamps (legacy ItemWinner ignored)", async () => {
      scrapeRepo.findExtensionStatusSnapshot.mockResolvedValue({
        listingCount: 3,
        latestPerListing: [],
        rawSnapshotCount: 0,
        latestRun: null,
        wingKpi: null,
      });

      const result = await service.getExtensionStatus("organization-1");

      expect(result.currentWinnerCount).toBe(0);
      expect(result.currentNonWinnerCount).toBe(0);
      expect(result.currentUnknownWinnerCount).toBe(0);
      expect(result.currentWinnerObservedListings).toBe(0);
      expect(result.rawSnapshotCount).toBe(0);
      expect(result.latestScrapeAt).toBeNull();
      expect(result.latestScrapePageType).toBeNull();
      expect(result.latestChannelStateAt).toBeNull();
      expect(result.wing.kpis).toEqual({});
      expect(result.wing.lastSync).toBeNull();
    });

    it("passes organizationId through all reads (no default fallback) — no legacy AdSnapshot/ItemWinner reads", async () => {
      scrapeRepo.findExtensionStatusSnapshot.mockResolvedValue({
        listingCount: 0,
        latestPerListing: [],
        rawSnapshotCount: 0,
        latestRun: null,
        wingKpi: null,
      });

      await service.getExtensionStatus("organization-xyz");

      expect(scrapeRepo.findExtensionStatusSnapshot).toHaveBeenCalledWith(
        "organization-xyz",
      );
    });
  });
});
