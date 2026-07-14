// Coupang keyword rank tracking persistence adapter.
//
// Tracker mutations use `updateMany`/`deleteMany` with `(id, organizationId)`
// predicate + tenant-scoped re-read so a cross-tenant id never leaks into the
// response (scrape-target adapter pattern). Rank facts are idempotent on
// `(organizationId, keyword, vendorItemId, businessDate)`; the SERP capture is
// idempotent on `(organizationId, keyword, businessDate)` with
// latest-capture-wins overwrite semantics.

import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../../../prisma/prisma.service";
import { currentBusinessDate } from "../../../domain/business-date";
import type {
  KeywordRankRepositoryPort,
  KeywordTrackerRow,
  OwnVendorItem,
  RankHistoryRow,
  RankOverviewSnapshotRow,
  ReplaceWingSalesRankSnapshotInput,
  SerpSnapshotRow,
  UpdateKeywordTrackerInput,
  UpsertKeywordTrackerInput,
  UpsertRankSnapshotInput,
  UpsertSerpSnapshotInput,
  WingSalesRankSnapshotRow,
} from "../../../application/port/out/repository/keyword-rank.repository.port";

@Injectable()
export class KeywordRankRepositoryAdapter implements KeywordRankRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  listTrackers(organizationId: string): Promise<KeywordTrackerRow[]> {
    return this.prisma.coupangKeywordTracker.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
    });
  }

  upsertTrackerByKeyword(
    input: UpsertKeywordTrackerInput,
    organizationId: string,
  ): Promise<KeywordTrackerRow> {
    return this.prisma.coupangKeywordTracker.upsert({
      where: {
        organizationId_keyword: { organizationId, keyword: input.keyword },
      },
      create: {
        organizationId,
        keyword: input.keyword,
        vendorItemIds: input.vendorItemIds ?? [],
        ...(input.maxPages !== undefined ? { maxPages: input.maxPages } : {}),
        enabled: true,
      },
      update: {
        enabled: true,
        ...(input.vendorItemIds !== undefined
          ? { vendorItemIds: input.vendorItemIds }
          : {}),
        ...(input.maxPages !== undefined ? { maxPages: input.maxPages } : {}),
      },
    });
  }

  async updateTracker(
    id: string,
    organizationId: string,
    patch: UpdateKeywordTrackerInput,
  ): Promise<KeywordTrackerRow> {
    const updated = await this.prisma.coupangKeywordTracker.updateMany({
      where: { id, organizationId },
      data: {
        ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
        ...(patch.vendorItemIds !== undefined
          ? { vendorItemIds: patch.vendorItemIds }
          : {}),
        ...(patch.maxPages !== undefined ? { maxPages: patch.maxPages } : {}),
      },
    });
    if (updated.count !== 1) {
      throw new NotFoundException("Keyword tracker not found");
    }
    return this.getTrackerOrThrow(id, organizationId);
  }

  async deleteTracker(
    id: string,
    organizationId: string,
  ): Promise<KeywordTrackerRow> {
    const tracker = await this.getTrackerOrThrow(id, organizationId);
    await this.prisma.coupangKeywordTracker.deleteMany({
      where: { id, organizationId },
    });
    return tracker;
  }

  getTrackerByKeyword(
    keyword: string,
    organizationId: string,
  ): Promise<KeywordTrackerRow | null> {
    return this.prisma.coupangKeywordTracker.findUnique({
      where: { organizationId_keyword: { organizationId, keyword } },
    });
  }

  async touchTrackerCaptured(
    id: string,
    organizationId: string,
    capturedAt: Date,
  ): Promise<void> {
    await this.prisma.coupangKeywordTracker.updateMany({
      where: { id, organizationId },
      data: { lastCapturedAt: capturedAt },
    });
  }

  async listOwnVendorItems(organizationId: string): Promise<OwnVendorItem[]> {
    const rows = await this.prisma.channelListingOption.findMany({
      where: {
        organizationId,
        isActive: true,
        listing: {
          isActive: true,
          channelAccount: { channel: "coupang" },
        },
      },
      orderBy: [{ updatedAt: "desc" }],
      select: {
        externalOptionId: true,
        sellerSku: true,
        itemName: true,
        listing: {
          select: {
            externalId: true,
            displayName: true,
            category: true,
          },
        },
      },
    });
    const byVendorItemId = new Map<string, OwnVendorItem>();
    for (const row of rows) {
      const vendorItemId = row.externalOptionId;
      const previous = byVendorItemId.get(vendorItemId);
      if (!previous) {
        byVendorItemId.set(vendorItemId, {
          vendorItemId,
          skuId: row.sellerSku ?? vendorItemId,
          productName:
            row.itemName ?? row.listing.displayName ?? row.listing.externalId,
          category: row.listing.category,
        });
      } else if (!previous.category && row.listing.category) {
        previous.category = row.listing.category;
      }
    }
    return [...byVendorItemId.values()];
  }

  listRepresentativeKeywordOverrides(organizationId: string) {
    return this.prisma.coupangRepresentativeKeywordOverride.findMany({
      where: { organizationId },
      orderBy: { updatedAt: "desc" },
    });
  }

  upsertRepresentativeKeywordOverride(
    organizationId: string,
    vendorItemId: string,
    keyword: string,
  ) {
    return this.prisma.coupangRepresentativeKeywordOverride.upsert({
      where: {
        organizationId_vendorItemId: { organizationId, vendorItemId },
      },
      create: { organizationId, vendorItemId, keyword },
      update: { keyword },
    });
  }

  async deleteRepresentativeKeywordOverride(
    organizationId: string,
    vendorItemId: string,
  ): Promise<number> {
    const deleted =
      await this.prisma.coupangRepresentativeKeywordOverride.deleteMany({
        where: { organizationId, vendorItemId },
      });
    return deleted.count;
  }

  async hasOwnVendorItem(
    organizationId: string,
    vendorItemId: string,
  ): Promise<boolean> {
    const row = await this.prisma.channelListingOption.findFirst({
      where: {
        organizationId,
        externalOptionId: vendorItemId,
        isActive: true,
        listing: {
          isActive: true,
          channelAccount: { channel: "coupang" },
        },
      },
      select: { id: true },
    });
    return Boolean(row);
  }

  async upsertRankSnapshots(rows: UpsertRankSnapshotInput[]): Promise<number> {
    let count = 0;
    for (const row of rows) {
      await this.prisma.coupangKeywordRankDailySnapshot.upsert({
        where: {
          organizationId_keyword_vendorItemId_businessDate: {
            organizationId: row.organizationId,
            keyword: row.keyword,
            vendorItemId: row.vendorItemId,
            businessDate: row.businessDate,
          },
        },
        create: {
          organizationId: row.organizationId,
          keyword: row.keyword,
          vendorItemId: row.vendorItemId,
          businessDate: row.businessDate,
          productId: row.productId,
          itemId: row.itemId,
          productName: row.productName,
          overallRank: row.overallRank,
          organicRank: row.organicRank,
          adRank: row.adRank,
          page: row.page,
          positionInPage: row.positionInPage,
          priceKrw: row.priceKrw,
          reviewCount: row.reviewCount,
          capturedAt: row.capturedAt,
        },
        update: {
          productId: row.productId,
          itemId: row.itemId,
          productName: row.productName,
          overallRank: row.overallRank,
          organicRank: row.organicRank,
          adRank: row.adRank,
          page: row.page,
          positionInPage: row.positionInPage,
          priceKrw: row.priceKrw,
          reviewCount: row.reviewCount,
          capturedAt: row.capturedAt,
        },
        select: { id: true },
      });
      count += 1;
    }
    return count;
  }

  upsertSerpSnapshot(input: UpsertSerpSnapshotInput): Promise<{ id: string }> {
    const items = input.items as Prisma.InputJsonValue;
    return this.prisma.coupangKeywordSerpDailySnapshot.upsert({
      where: {
        organizationId_keyword_businessDate: {
          organizationId: input.organizationId,
          keyword: input.keyword,
          businessDate: input.businessDate,
        },
      },
      create: {
        organizationId: input.organizationId,
        keyword: input.keyword,
        businessDate: input.businessDate,
        items,
        itemCount: input.itemCount,
        pagesScanned: input.pagesScanned,
        capturedAt: input.capturedAt,
      },
      update: {
        items,
        itemCount: input.itemCount,
        pagesScanned: input.pagesScanned,
        capturedAt: input.capturedAt,
      },
      select: { id: true },
    });
  }

  findRankHistory(
    organizationId: string,
    keyword: string,
    days: number,
  ): Promise<RankHistoryRow[]> {
    const since = currentBusinessDate();
    since.setUTCDate(since.getUTCDate() - (days - 1));
    return this.prisma.coupangKeywordRankDailySnapshot.findMany({
      where: { organizationId, keyword, businessDate: { gte: since } },
      orderBy: [{ vendorItemId: "asc" }, { businessDate: "asc" }],
      select: {
        vendorItemId: true,
        businessDate: true,
        productName: true,
        overallRank: true,
        organicRank: true,
        adRank: true,
        page: true,
      },
    });
  }

  findRankOverviewSnapshots(
    organizationId: string,
    days: number,
  ): Promise<RankOverviewSnapshotRow[]> {
    const since = currentBusinessDate();
    since.setUTCDate(since.getUTCDate() - (days - 1));
    return this.prisma.coupangKeywordRankDailySnapshot.findMany({
      where: { organizationId, businessDate: { gte: since } },
      orderBy: [
        { keyword: "asc" },
        { vendorItemId: "asc" },
        { businessDate: "asc" },
        { capturedAt: "asc" },
      ],
      select: {
        keyword: true,
        vendorItemId: true,
        businessDate: true,
        productName: true,
        overallRank: true,
        organicRank: true,
        adRank: true,
        capturedAt: true,
      },
    });
  }

  async replaceWingSalesRankSnapshots(
    rows: ReplaceWingSalesRankSnapshotInput[],
  ): Promise<number> {
    if (rows.length === 0) return 0;
    const { organizationId, keyword, businessDate } = rows[0];
    const vendorItemIds = [...new Set(rows.map((row) => row.vendorItemId))];

    return this.prisma.$transaction(async (tx) => {
      await tx.coupangWingSalesRankDailySnapshot.deleteMany({
        where: {
          organizationId,
          keyword,
          businessDate,
          vendorItemId: { in: vendorItemIds },
        },
      });
      const created = await tx.coupangWingSalesRankDailySnapshot.createMany({
        data: rows.map((row) => ({
          organizationId: row.organizationId,
          keyword: row.keyword,
          vendorItemId: row.vendorItemId,
          businessDate: row.businessDate,
          productId: row.productId,
          itemId: row.itemId,
          productName: row.productName,
          categoryHierarchy: row.categoryHierarchy,
          salesRank: row.salesRank,
          salesLast28d: row.salesLast28d,
          viewsLast28d: row.viewsLast28d,
          revenueLast28d: row.revenueLast28d,
          conversionRate28d: row.conversionRate28d,
          salePrice: row.salePrice,
          reviewCount: row.reviewCount,
          keywordSalesLast28d: row.keywordSalesLast28d,
          keywordViewsLast28d: row.keywordViewsLast28d,
          keywordConversionRate28d: row.keywordConversionRate28d,
          pagesScanned: row.pagesScanned,
          collectedCount: row.collectedCount,
          totalResults: row.totalResults,
          capturedAt: row.capturedAt,
        })),
      });
      return created.count;
    });
  }

  async findWingSalesRankSnapshots(
    organizationId: string,
    days: number,
  ): Promise<WingSalesRankSnapshotRow[]> {
    const since = currentBusinessDate();
    since.setUTCDate(since.getUTCDate() - (days - 1));
    const rows = await this.prisma.coupangWingSalesRankDailySnapshot.findMany({
      where: { organizationId, businessDate: { gte: since } },
      orderBy: [
        { keyword: "asc" },
        { vendorItemId: "asc" },
        { businessDate: "asc" },
        { capturedAt: "asc" },
      ],
      select: {
        keyword: true,
        vendorItemId: true,
        businessDate: true,
        productName: true,
        categoryHierarchy: true,
        salesRank: true,
        salesLast28d: true,
        viewsLast28d: true,
        revenueLast28d: true,
        conversionRate28d: true,
        salePrice: true,
        reviewCount: true,
        keywordSalesLast28d: true,
        keywordViewsLast28d: true,
        keywordConversionRate28d: true,
        collectedCount: true,
        totalResults: true,
        capturedAt: true,
      },
    });
    return rows.map((row) => ({
      ...row,
      conversionRate28d:
        row.conversionRate28d === null ? null : Number(row.conversionRate28d),
      keywordConversionRate28d:
        row.keywordConversionRate28d === null
          ? null
          : Number(row.keywordConversionRate28d),
    }));
  }

  findLatestSerp(
    organizationId: string,
    keyword: string,
  ): Promise<SerpSnapshotRow | null> {
    return this.prisma.coupangKeywordSerpDailySnapshot.findFirst({
      where: { organizationId, keyword },
      orderBy: { businessDate: "desc" },
      select: {
        keyword: true,
        businessDate: true,
        capturedAt: true,
        pagesScanned: true,
        itemCount: true,
        items: true,
      },
    });
  }

  findRecentSerpSnapshots(
    organizationId: string,
    days: number,
  ): Promise<SerpSnapshotRow[]> {
    const since = currentBusinessDate();
    since.setUTCDate(since.getUTCDate() - (days - 1));
    return this.prisma.coupangKeywordSerpDailySnapshot.findMany({
      where: { organizationId, businessDate: { gte: since } },
      orderBy: [
        { keyword: "asc" },
        { businessDate: "asc" },
        { capturedAt: "asc" },
      ],
      select: {
        keyword: true,
        businessDate: true,
        capturedAt: true,
        pagesScanned: true,
        itemCount: true,
        items: true,
      },
    });
  }

  private async getTrackerOrThrow(
    id: string,
    organizationId: string,
  ): Promise<KeywordTrackerRow> {
    const tracker = await this.prisma.coupangKeywordTracker.findFirst({
      where: { id, organizationId },
    });
    if (!tracker) throw new NotFoundException("Keyword tracker not found");
    return tracker;
  }
}
