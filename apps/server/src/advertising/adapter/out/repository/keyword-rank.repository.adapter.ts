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
  MutateLatestSerpSnapshotInput,
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
      where: {
        id,
        organizationId,
        OR: [
          { lastCapturedAt: null },
          { lastCapturedAt: { lte: capturedAt } },
        ],
      },
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
            channelName: true,
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
          // 내 상품 표시명은 리스팅의 상품명(등록/노출상품명)을 우선한다.
          // itemName 은 옵션값("1개","단품")이라 상품명으로 쓰면 안 된다.
          productName:
            row.listing.channelName ??
            row.listing.displayName ??
            row.listing.externalId,
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
    if (rows.length === 0) return 0;
    const orderedRows = [...rows].sort((a, b) =>
      [
        a.organizationId,
        a.keyword,
        a.vendorItemId,
        a.businessDate.toISOString(),
      ]
        .join(':')
        .localeCompare(
          [
            b.organizationId,
            b.keyword,
            b.vendorItemId,
            b.businessDate.toISOString(),
          ].join(':'),
        ),
    );
    return this.prisma.$transaction(async (tx) => {
      let count = 0;
      for (const row of orderedRows) {
        await this.acquireSnapshotLock(
          tx,
          row.organizationId,
          `keyword-rank:${row.organizationId}:${row.keyword}:${row.vendorItemId}:${row.businessDate.toISOString().slice(0, 10)}`,
        );
        const where = {
          organizationId_keyword_vendorItemId_businessDate: {
            organizationId: row.organizationId,
            keyword: row.keyword,
            vendorItemId: row.vendorItemId,
            businessDate: row.businessDate,
          },
        };
        const existing = await tx.coupangKeywordRankDailySnapshot.findUnique({
          where,
          select: { id: true, capturedAt: true },
        });
        if (existing && existing.capturedAt > row.capturedAt) continue;

        const data = {
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
        };
        if (existing) {
          await tx.coupangKeywordRankDailySnapshot.update({
            where: { id: existing.id },
            data,
            select: { id: true },
          });
        } else {
          await tx.coupangKeywordRankDailySnapshot.create({
            data: {
              organizationId: row.organizationId,
              keyword: row.keyword,
              vendorItemId: row.vendorItemId,
              businessDate: row.businessDate,
              ...data,
            },
            select: { id: true },
          });
        }
        count += 1;
      }
      return count;
    });
  }

  async upsertSerpSnapshot(
    input: UpsertSerpSnapshotInput,
    mergeItems?: (existing: SerpSnapshotRow | null) => unknown,
  ): Promise<{ id: string }> {
    return this.prisma.$transaction(async (tx) => {
      await this.acquireSnapshotLock(
        tx,
        input.organizationId,
        `keyword-serp:${input.organizationId}:${input.keyword}`,
      );
      const where = {
        organizationId_keyword_businessDate: {
          organizationId: input.organizationId,
          keyword: input.keyword,
          businessDate: input.businessDate,
        },
      };
      const existing = await tx.coupangKeywordSerpDailySnapshot.findUnique({
        where,
        select: {
          id: true,
          keyword: true,
          businessDate: true,
          capturedAt: true,
          pagesScanned: true,
          itemCount: true,
          items: true,
        },
      });
      if (existing && existing.capturedAt > input.capturedAt) {
        return { id: existing.id };
      }

      const existingSnapshot = existing
        ? {
            keyword: existing.keyword,
            businessDate: existing.businessDate,
            capturedAt: existing.capturedAt,
            pagesScanned: existing.pagesScanned,
            itemCount: existing.itemCount,
            items: existing.items,
          }
        : null;
      const items = (mergeItems
        ? mergeItems(existingSnapshot)
        : input.items) as Prisma.InputJsonValue;
      const data = {
        items,
        itemCount: input.itemCount,
        pagesScanned: input.pagesScanned,
        capturedAt: input.capturedAt,
      };
      if (existing) {
        return tx.coupangKeywordSerpDailySnapshot.update({
          where: { id: existing.id },
          data,
          select: { id: true },
        });
      }
      return tx.coupangKeywordSerpDailySnapshot.create({
        data: {
          organizationId: input.organizationId,
          keyword: input.keyword,
          businessDate: input.businessDate,
          ...data,
        },
        select: { id: true },
      });
    });
  }

  async mutateLatestSerpSnapshot(
    input: MutateLatestSerpSnapshotInput,
  ): Promise<{ id: string } | null> {
    return this.prisma.$transaction(async (tx) => {
      await this.acquireSnapshotLock(
        tx,
        input.organizationId,
        `keyword-serp:${input.organizationId}:${input.keyword}`,
      );
      const snapshot = await tx.coupangKeywordSerpDailySnapshot.findFirst({
        where: { organizationId: input.organizationId, keyword: input.keyword },
        orderBy: [{ businessDate: "desc" }, { capturedAt: "desc" }],
        select: {
          id: true,
          keyword: true,
          businessDate: true,
          capturedAt: true,
          pagesScanned: true,
          itemCount: true,
          items: true,
        },
      });
      if (!snapshot) return null;
      const items = input.mutateItems({
        keyword: snapshot.keyword,
        businessDate: snapshot.businessDate,
        capturedAt: snapshot.capturedAt,
        pagesScanned: snapshot.pagesScanned,
        itemCount: snapshot.itemCount,
        items: snapshot.items,
      });
      if (items === null) return null;
      return tx.coupangKeywordSerpDailySnapshot.update({
        where: { id: snapshot.id },
        data: { items: items as Prisma.InputJsonValue },
        select: { id: true },
      });
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

    return this.prisma.$transaction(async (tx) => {
      await this.acquireSnapshotLock(
        tx,
        organizationId,
        `wing-sales-rank:${organizationId}:${keyword}:${businessDate.toISOString().slice(0, 10)}`,
      );
      const latest = await tx.coupangWingSalesRankDailySnapshot.findFirst({
        where: { organizationId, keyword, businessDate },
        orderBy: { capturedAt: "desc" },
        select: { capturedAt: true },
      });
      const incomingCapturedAt = rows.reduce(
        (latestCapturedAt, row) =>
          row.capturedAt > latestCapturedAt ? row.capturedAt : latestCapturedAt,
        rows[0].capturedAt,
      );
      if (latest && latest.capturedAt > incomingCapturedAt) return 0;
      await tx.coupangWingSalesRankDailySnapshot.deleteMany({
        where: {
          organizationId,
          keyword,
          businessDate,
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
      orderBy: [{ businessDate: "desc" }, { capturedAt: "desc" }],
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

  private async acquireSnapshotLock(
    tx: Prisma.TransactionClient,
    organizationId: string,
    lockKey: string,
  ): Promise<void> {
    await tx.$queryRaw`
      SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))::text AS "lock"
      FROM (SELECT ${organizationId}::uuid AS organization_id) AS tenant
      WHERE organization_id = ${organizationId}::uuid
    `;
  }
}
