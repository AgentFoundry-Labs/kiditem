import { ownerTransaction } from '../../../../prisma/owner-transaction';
import { CHANNEL_LISTING_QUERY_PORT, type ChannelListingQueryPort } from '../../../../channels/application/port/in/listing/channel-listing-query.port';
import { CHANNEL_OPTION_RECIPE_PORT, type ChannelOptionRecipePort } from '../../../../channels/application/port/in/channel-option-recipe.port';
// Coupang keyword rank tracking persistence adapter.
//
// Tracker mutations use `updateMany`/`deleteMany` with `(id, organizationId)`
// predicate + tenant-scoped re-read so a cross-tenant id never leaks into the
// response (repository adapter pattern). Rank facts are idempotent on
// `(organizationId, keyword, vendorItemId, businessDate)`; the SERP capture is
// idempotent on `(organizationId, keyword, businessDate)` with
// latest-capture-wins overwrite semantics.

import { Inject, Injectable, NotFoundException, Optional } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { SOURCE_IMPORT_RUN_COMPLETED_STATUS } from "@kiditem/shared/source-import";
import { PrismaService } from "../../../../prisma/prisma.service";
import { businessDateKey } from '../../../../common/kst';
import {
  readKeywordRankHistory,
  readKeywordRankOverviewSnapshots,
  readLatestSerpSnapshot,
  readRecentSerpSnapshots,
  readWingSalesRankSnapshots,
} from '../../../read/keyword-rank-facts';
import { readPublishedProductAbcGrades } from "../../../../products/adapter/out/persistence/read/product-abc-publication.reader";
import {
  PRODUCT_TRANSACTIONAL_READ_PORT,
  type ProductTransactionalReadPort,
} from "../../../../products/application/port/in/product-transactional-read.port";
import {
  adIngestRepositoryClient,
  withAdIngestRepositoryTransaction,
} from "./ad-ingest-transaction-context";
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

const sourceProvenanceSelect = {
  organizationId: true,
  rankKeyword: true,
  sourceType: true,
  parserVersion: true,
  status: true,
} as const;

@Injectable()
export class KeywordRankRepositoryAdapter implements KeywordRankRepositoryPort {
  constructor(
    @Inject(CHANNEL_LISTING_QUERY_PORT) private readonly channelListings: ChannelListingQueryPort,
    @Inject(CHANNEL_OPTION_RECIPE_PORT) private readonly channelRecipes: ChannelOptionRecipePort,
    private readonly prisma: PrismaService,
    @Optional()
    @Inject(PRODUCT_TRANSACTIONAL_READ_PORT)
    private readonly products?: ProductTransactionalReadPort,
  ) {}

  listTrackers(organizationId: string): Promise<KeywordTrackerRow[]> {
    return adIngestRepositoryClient(this.prisma).coupangKeywordTracker.findMany(
      {
        where: { organizationId },
        orderBy: { createdAt: "desc" },
      },
    );
  }

  upsertTrackerByKeyword(
    input: UpsertKeywordTrackerInput,
    organizationId: string,
  ): Promise<KeywordTrackerRow> {
    return adIngestRepositoryClient(this.prisma).coupangKeywordTracker.upsert({
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
    return adIngestRepositoryClient(
      this.prisma,
    ).coupangKeywordTracker.findUnique({
      where: { organizationId_keyword: { organizationId, keyword } },
    });
  }

  async touchTrackerCaptured(
    id: string,
    organizationId: string,
    capturedAt: Date,
  ): Promise<void> {
    await adIngestRepositoryClient(
      this.prisma,
    ).coupangKeywordTracker.updateMany({
      where: {
        id,
        organizationId,
        OR: [{ lastCapturedAt: null }, { lastCapturedAt: { lte: capturedAt } }],
      },
      data: { lastCapturedAt: capturedAt },
    });
  }

  async listOwnVendorItems(organizationId: string): Promise<OwnVendorItem[]> {
    return this.prisma.$transaction(
      (tx) => this.listOwnVendorItemsSnapshot(tx, organizationId),
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  private async listOwnVendorItemsSnapshot(
    tx: Prisma.TransactionClient,
    organizationId: string,
  ): Promise<OwnVendorItem[]> {
    const optionRows = await this.channelListings.readCatalogFacts(ownerTransaction(tx), { organizationId, channels: ['coupang'], activeOnly: true }).then(rows => rows.flatMap(listing => listing.options.map(option => ({ ...option, listing }))).sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()));
    const summaries = await this.channelRecipes.readListingProductSummaries(ownerTransaction(tx), { organizationId, listingIds: [...new Set(optionRows.map((row) => row.listing.id))] });
    const rows = optionRows.map((row) => ({ ...row, listing: { ...row.listing, masterProductId: summaries.get(row.listing.id) ?? null } }));
    const masterProductIds = [...new Set(rows.flatMap((row) =>
      row.listing.masterProductId ? [row.listing.masterProductId] : []))];
    const identities = this.products
      ? await this.products.readSourceIdentities(
        { client: tx },
        { organizationId, selector: { kind: 'ids', values: masterProductIds } },
      )
      : [];
    const identityById = new Map(identities.map((identity) => [
      identity.masterProductId,
      identity,
    ]));
    const gradeByProductId = await readPublishedProductAbcGrades(tx, {
      organizationId,
      masterProductIds,
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
          abcGrade: row.listing.masterProductId && identityById.has(row.listing.masterProductId)
            ? gradeByProductId.get(row.listing.masterProductId) ?? null
            : null,
        });
      } else if (!previous.category && row.listing.category) {
        previous.category = row.listing.category;
      }
    }
    return [...byVendorItemId.values()];
  }

  listRepresentativeKeywordOverrides(organizationId: string) {
    return adIngestRepositoryClient(
      this.prisma,
    ).coupangRepresentativeKeywordOverride.findMany({
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
    const row = await this.channelListings.readCatalogFacts(ownerTransaction(this.prisma), { organizationId, channels: ['coupang'], activeOnly: true }).then(rows => rows.some(listing => listing.options.some(option => option.externalOptionId === vendorItemId)));
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
        .join(":")
        .localeCompare(
          [
            b.organizationId,
            b.keyword,
            b.vendorItemId,
            b.businessDate.toISOString(),
          ].join(":"),
        ),
    );
    return withAdIngestRepositoryTransaction(this.prisma, async (tx) => {
      let count = 0;
      for (const row of orderedRows) {
        await this.acquireSnapshotLock(
          tx,
          row.organizationId,
          `keyword-rank:${row.organizationId}:${row.keyword}:${row.vendorItemId}:${businessDateKey(row.businessDate)}`,
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
          select: {
            id: true,
            capturedAt: true,
            sourceImportRun: { select: sourceProvenanceSelect },
          },
        });
        if (
          existing &&
          matchingCompleteSource(
            existing.sourceImportRun,
            row.organizationId,
            row.keyword,
          ) &&
          existing.capturedAt > row.capturedAt
        )
          continue;

        const data = {
          sourceImportRunId: row.sourceImportRunId,
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
    return withAdIngestRepositoryTransaction(this.prisma, async (tx) => {
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
          sourceImportRun: { select: sourceProvenanceSelect },
        },
      });
      const certified =
        existing &&
        matchingCompleteSource(
          existing.sourceImportRun,
          input.organizationId,
          input.keyword,
        );
      if (certified && existing.capturedAt > input.capturedAt) {
        return { id: existing.id };
      }

      const existingSnapshot = certified
        ? {
            keyword: existing.keyword,
            businessDate: existing.businessDate,
            capturedAt: existing.capturedAt,
            pagesScanned: existing.pagesScanned,
            itemCount: existing.itemCount,
            items: existing.items,
          }
        : null;
      const items = (
        mergeItems ? mergeItems(existingSnapshot) : input.items
      ) as Prisma.InputJsonValue;
      const data = {
        sourceImportRunId: input.sourceImportRunId,
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
    return withAdIngestRepositoryTransaction(this.prisma, async (tx) => {
      await this.acquireSnapshotLock(
        tx,
        input.organizationId,
        `keyword-serp:${input.organizationId}:${input.keyword}`,
      );
      const snapshot = await tx.coupangKeywordSerpDailySnapshot.findFirst({
        where: {
          organizationId: input.organizationId,
          keyword: input.keyword,
          sourceImportRun: completeSerpSource(input.organizationId),
        },
        orderBy: [
          { businessDate: "desc" },
          { capturedAt: "desc" },
          { updatedAt: "desc" },
          { id: "desc" },
        ],
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
    return this.prisma.$transaction(
      (tx) => readKeywordRankHistory(tx, { organizationId, keyword, days }),
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  findRankOverviewSnapshots(
    organizationId: string,
    days: number,
  ): Promise<RankOverviewSnapshotRow[]> {
    return this.prisma.$transaction(
      (tx) => readKeywordRankOverviewSnapshots(tx, { organizationId, days }),
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  async replaceWingSalesRankSnapshots(
    rows: ReplaceWingSalesRankSnapshotInput[],
  ): Promise<number> {
    if (rows.length === 0) return 0;
    const { organizationId, keyword, businessDate } = rows[0];

    return withAdIngestRepositoryTransaction(this.prisma, async (tx) => {
      await this.acquireSnapshotLock(
        tx,
        organizationId,
        `wing-sales-rank:${organizationId}:${keyword}:${businessDateKey(businessDate)}`,
      );
      const latest = await tx.coupangWingSalesRankDailySnapshot.findFirst({
        where: {
          organizationId,
          keyword,
          businessDate,
          sourceImportRun: {
            ...completeWingRankSource(organizationId),
            rankKeyword: keyword,
          },
        },
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
          sourceImportRunId: row.sourceImportRunId,
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
    return this.prisma.$transaction(
      (tx) => readWingSalesRankSnapshots(tx, { organizationId, days }),
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  findLatestSerp(
    organizationId: string,
    keyword: string,
  ): Promise<SerpSnapshotRow | null> {
    return this.prisma.$transaction(
      (tx) => readLatestSerpSnapshot(tx, { organizationId, keyword }),
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  findRecentSerpSnapshots(
    organizationId: string,
    days: number,
  ): Promise<SerpSnapshotRow[]> {
    return this.prisma.$transaction(
      (tx) => readRecentSerpSnapshots(tx, { organizationId, days }),
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
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

function toAbcGrade(value: string | null): "A" | "B" | "C" | null {
  return value === "A" || value === "B" || value === "C" ? value : null;
}

function completeSerpSource(organizationId: string) {
  return {
    organizationId,
    sourceType: "coupang_keyword_serp",
    parserVersion: "keyword-serp-v1",
    status: SOURCE_IMPORT_RUN_COMPLETED_STATUS,
  };
}

function matchingCompleteSource(
  source: Prisma.SourceImportRunGetPayload<{
    select: typeof sourceProvenanceSelect;
  }> | null,
  organizationId: string,
  keyword: string,
) {
  return (
    source?.organizationId === organizationId &&
    source.rankKeyword === keyword &&
    source.sourceType === "coupang_keyword_serp" &&
    source.parserVersion === "keyword-serp-v1" &&
    source.status === SOURCE_IMPORT_RUN_COMPLETED_STATUS
  );
}

function completeWingRankSource(organizationId: string) {
  return {
    organizationId,
    sourceType: "coupang_wing_rank",
    parserVersion: "wing-rank-v1",
    status: SOURCE_IMPORT_RUN_COMPLETED_STATUS,
  };
}
