import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  SellpiaInventoryQualityReportSchema,
  SellpiaInventoryRefreshReasonSchema,
} from '@kiditem/shared/sellpia-inventory-freshness';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  InventorySkuSnapshotListRepositoryPort,
  InventorySkuSnapshotRepositoryQuery,
  InventorySkuSnapshotRepositoryRow,
  SellpiaImportRunRepositoryRow,
} from '../../../application/port/out/repository/inventory-sku-snapshot-list.repository.port';

const SOURCE_TYPE = 'sellpia_inventory';

const SNAPSHOT_BASE_SELECT = {
  id: true,
  code: true,
  name: true,
  optionName: true,
  barcode: true,
  currentStock: true,
  purchasePrice: true,
  salePrice: true,
  isActive: true,
  lastImportRunId: true,
} as const;

function snapshotSelect(organizationId: string) {
  return {
    ...SNAPSHOT_BASE_SELECT,
    channelListingOptionInventoryComponents: {
      where: {
        organizationId,
        channelListingOption: {
          organizationId,
          isActive: true,
          listing: {
            organizationId,
            isActive: true,
            masterProductId: { not: null },
          },
        },
      },
      select: {
        channelListingOption: {
          select: {
            id: true,
            externalOptionId: true,
            itemName: true,
            listing: {
              select: {
                id: true,
                masterProduct: { select: { id: true, code: true, name: true } },
                channelAccount: { select: { channel: true } },
              },
            },
          },
        },
      },
    },
  } satisfies Prisma.SellpiaInventorySkuSelect;
}

function snapshotDetailSelect(organizationId: string) {
  return {
    ...snapshotSelect(organizationId),
    lastImportRun: {
      select: {
        id: true,
        sourceType: true,
        channelAccountId: true,
        status: true,
        importedAt: true,
      },
    },
  } satisfies Prisma.SellpiaInventorySkuSelect;
}

const IMPORT_RUN_SELECT = {
  id: true,
  fileName: true,
  fileHash: true,
  status: true,
  rowCount: true,
  importedAt: true,
  lastVerifiedAt: true,
  verificationCount: true,
  lastTrigger: true,
  freshnessGeneration: true,
  manualFreshExportConfirmedAt: true,
  manualFreshExportConfirmedBy: true,
  qualityReport: true,
  errorCode: true,
  errorMessage: true,
  createdAt: true,
  updatedAt: true,
} as const;

type ImportRunRow = Prisma.SourceImportRunGetPayload<{
  select: typeof IMPORT_RUN_SELECT;
}>;

type SummaryRow = {
  totalSkus: bigint;
  linkedSkus: bigint;
  unlinkedSkus: bigint;
  inStockSkus: bigint;
  outOfStockSkus: bigint;
  totalUnits: bigint;
  pricedAssetValue: bigint;
  unpricedSkuCount: bigint;
};

@Injectable()
export class InventorySkuSnapshotListRepositoryAdapter
implements InventorySkuSnapshotListRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async listSnapshot(
    organizationId: string,
    query: InventorySkuSnapshotRepositoryQuery,
  ) {
    return this.prisma.$transaction(async (transaction) => {
      const state = await transaction.sellpiaInventoryState.findUnique({
        where: { organizationId },
        select: { lastCompletedImportRunId: true },
      });
      const latestImport = state?.lastCompletedImportRunId
        ? await transaction.sourceImportRun.findFirst({
            where: {
              id: state.lastCompletedImportRunId,
              organizationId,
              sourceType: SOURCE_TYPE,
              channelAccountId: null,
              status: 'completed',
            },
            select: IMPORT_RUN_SELECT,
          })
        : null;
      if (!latestImport) {
        return {
          rows: [],
          total: 0,
          summary: {
            totalSkus: 0,
            linkedSkus: 0,
            unlinkedSkus: 0,
            inStockSkus: 0,
            outOfStockSkus: 0,
            totalUnits: 0,
            pricedAssetValue: 0,
            unpricedSkuCount: 0,
          },
          latestImport: null,
        };
      }
      const where = snapshotWhere(organizationId, query, latestImport.id);
      const [rows, total, summaryRows] = await Promise.all([
        transaction.sellpiaInventorySku.findMany({
          where,
          select: snapshotSelect(organizationId),
          orderBy: [{ code: 'asc' }, { id: 'asc' }],
          skip: query.skip,
          ...(query.take === undefined ? {} : { take: query.take }),
        }),
        transaction.sellpiaInventorySku.count({ where }),
        transaction.$queryRaw<SummaryRow[]>`
          SELECT
            COUNT(*)::bigint AS "totalSkus",
            COUNT(*) FILTER (WHERE current_stock > 0)::bigint AS "inStockSkus",
            COUNT(*) FILTER (WHERE current_stock = 0)::bigint AS "outOfStockSkus",
            COALESCE(SUM(current_stock), 0)::bigint AS "totalUnits",
            COALESCE(
              SUM(current_stock::bigint * purchase_price::bigint)
                FILTER (WHERE purchase_price IS NOT NULL),
              0
            )::bigint AS "pricedAssetValue",
            COUNT(*) FILTER (WHERE purchase_price IS NULL)::bigint AS "unpricedSkuCount",
            COUNT(*) FILTER (WHERE EXISTS (
              SELECT 1
              FROM channel_listing_option_inventory_components component
              INNER JOIN channel_listing_options option
                ON option.id = component.channel_listing_option_id
                AND option.organization_id = ${organizationId}::uuid
                AND option.is_active = TRUE
              INNER JOIN channel_listings listing
                ON listing.id = option.listing_id
                AND listing.organization_id = ${organizationId}::uuid
                AND listing.is_active = TRUE
                AND listing.master_product_id IS NOT NULL
              WHERE component.organization_id = ${organizationId}::uuid
                AND component.sellpia_inventory_sku_id = sku.id
            ))::bigint AS "linkedSkus",
            COUNT(*) FILTER (WHERE NOT EXISTS (
              SELECT 1
              FROM channel_listing_option_inventory_components component
              INNER JOIN channel_listing_options option
                ON option.id = component.channel_listing_option_id
                AND option.organization_id = ${organizationId}::uuid
                AND option.is_active = TRUE
              INNER JOIN channel_listings listing
                ON listing.id = option.listing_id
                AND listing.organization_id = ${organizationId}::uuid
                AND listing.is_active = TRUE
                AND listing.master_product_id IS NOT NULL
              WHERE component.organization_id = ${organizationId}::uuid
                AND component.sellpia_inventory_sku_id = sku.id
            ))::bigint AS "unlinkedSkus"
          FROM sellpia_inventory_skus sku
          WHERE sku.organization_id = ${organizationId}::uuid
            ${activeStatusSql(query.activeStatus, latestImport.id)}
          `,
      ]);
      const summary = summaryRows[0] ?? emptySummaryRow();

      return {
        rows: rows.map((row): InventorySkuSnapshotRepositoryRow => {
          const { linkedProducts, linkedChannelOptions } = linkedDestinations(
            row.channelListingOptionInventoryComponents,
          );
          return {
            sellpiaInventorySkuId: row.id,
            code: row.code,
            name: row.name,
            optionName: row.optionName,
            barcode: row.barcode,
            currentStock: row.currentStock,
            purchasePrice: row.purchasePrice,
            salePrice: row.salePrice,
            isActive: row.isActive,
            lastImportRunId: latestImport.id,
            lastImportedAt: latestImport.importedAt,
            linkedChannelOptionCount: linkedChannelOptions.length,
            linkedProductCount: linkedProducts.length,
            linkedProducts,
            linkedChannelOptions,
          };
        }),
        total,
        summary: {
          totalSkus: safeInteger(summary.totalSkus, 'totalSkus'),
          linkedSkus: safeInteger(summary.linkedSkus, 'linkedSkus'),
          unlinkedSkus: safeInteger(summary.unlinkedSkus, 'unlinkedSkus'),
          inStockSkus: safeInteger(summary.inStockSkus, 'inStockSkus'),
          outOfStockSkus: safeInteger(summary.outOfStockSkus, 'outOfStockSkus'),
          totalUnits: safeInteger(summary.totalUnits, 'totalUnits'),
          pricedAssetValue: safeInteger(summary.pricedAssetValue, 'pricedAssetValue'),
          unpricedSkuCount: safeInteger(summary.unpricedSkuCount, 'unpricedSkuCount'),
        },
        latestImport: latestImport ? mapImportRun(latestImport) : null,
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }

  async getSnapshot(organizationId: string, sellpiaInventorySkuId: string) {
    return this.prisma.$transaction(async (transaction) => {
      const state = await transaction.sellpiaInventoryState.findUnique({
        where: { organizationId },
        select: { lastCompletedImportRunId: true },
      });
      const publishedRunId = state?.lastCompletedImportRunId
        ? await transaction.sourceImportRun.findFirst({
            where: {
              id: state.lastCompletedImportRunId,
              organizationId,
              sourceType: SOURCE_TYPE,
              channelAccountId: null,
              status: 'completed',
            },
            select: { id: true },
          })
        : null;
      if (!publishedRunId) return null;

      const row = await transaction.sellpiaInventorySku.findFirst({
        where: {
          id: sellpiaInventorySkuId,
          organizationId,
          lastImportRunId: publishedRunId.id,
        },
        select: snapshotDetailSelect(organizationId),
      });
      if (!row) return null;
      const { linkedProducts, linkedChannelOptions } = linkedDestinations(
        row.channelListingOptionInventoryComponents,
      );
      return {
        sellpiaInventorySkuId: row.id,
        code: row.code,
        name: row.name,
        optionName: row.optionName,
        barcode: row.barcode,
        currentStock: row.currentStock,
        purchasePrice: row.purchasePrice,
        salePrice: row.salePrice,
        isActive: row.isActive,
        lastImportRunId: row.lastImportRun?.id ?? null,
        lastImportedAt: row.lastImportRun?.importedAt ?? null,
        linkedChannelOptionCount: linkedChannelOptions.length,
        linkedProductCount: linkedProducts.length,
        linkedProducts,
        linkedChannelOptions,
      } satisfies InventorySkuSnapshotRepositoryRow;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }

  async listImportRuns(
    organizationId: string,
    query: { skip: number; take: number },
  ) {
    const where: Prisma.SourceImportRunWhereInput = {
      organizationId,
      sourceType: SOURCE_TYPE,
      channelAccountId: null,
    };
    const [rows, total] = await Promise.all([
      this.prisma.sourceImportRun.findMany({
        where,
        select: IMPORT_RUN_SELECT,
        orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
        skip: query.skip,
        take: query.take,
      }),
      this.prisma.sourceImportRun.count({ where }),
    ]);
    return { rows: rows.map(mapImportRun), total };
  }
}

type ChannelOptionComponentDestination = {
  channelListingOption: {
    id: string;
    externalOptionId: string;
    itemName: string | null;
    listing: {
      id: string;
      masterProduct: { id: string; code: string; name: string } | null;
      channelAccount: { channel: string };
    };
  };
};

function linkedDestinations(components: ChannelOptionComponentDestination[]) {
  const linkedChannelOptionById = new Map(
    components.flatMap(({ channelListingOption }) => {
      const masterProduct = channelListingOption.listing.masterProduct;
      if (!masterProduct) return [];
      return [[
      channelListingOption.id,
      {
        id: channelListingOption.id,
        masterProductId: masterProduct.id,
        channelListingId: channelListingOption.listing.id,
        channel: channelListingOption.listing.channelAccount.channel,
        externalOptionId: channelListingOption.externalOptionId,
        itemName: channelListingOption.itemName,
      },
    ] as const];
    }),
  );
  const linkedProductById = new Map(
    components.flatMap(({ channelListingOption }) => {
      const masterProduct = channelListingOption.listing.masterProduct;
      return masterProduct ? [[masterProduct.id, masterProduct] as const] : [];
    }),
  );
  const byCodeThenId = <T extends { code: string; id: string }>(left: T, right: T) =>
    left.code.localeCompare(right.code) || left.id.localeCompare(right.id);

  return {
    linkedProducts: [...linkedProductById.values()].sort(byCodeThenId),
    linkedChannelOptions: [...linkedChannelOptionById.values()].sort((left, right) =>
      left.channel.localeCompare(right.channel)
      || left.externalOptionId.localeCompare(right.externalOptionId)
      || left.id.localeCompare(right.id)),
  };
}

function snapshotWhere(
  organizationId: string,
  query: InventorySkuSnapshotRepositoryQuery,
  publishedRunId: string,
): Prisma.SellpiaInventorySkuWhereInput {
  const search = query.query?.trim();
  return {
    organizationId,
    lastImportRunId: publishedRunId,
    ...(query.activeStatus === 'active'
      ? { isActive: true }
      : query.activeStatus === 'inactive'
        ? { isActive: false }
        : {}),
    ...(query.stockStatus === 'in_stock'
      ? { currentStock: { gt: 0 } }
      : query.stockStatus === 'out_of_stock'
        ? { currentStock: 0 }
        : {}),
    ...(query.linkStatus
      ? {
          channelListingOptionInventoryComponents: query.linkStatus === 'linked'
            ? { some: activeComponentWhere(organizationId) }
            : { none: activeComponentWhere(organizationId) },
        }
      : {}),
    ...(search
      ? {
          OR: [
            { code: { contains: search, mode: 'insensitive' } },
            { name: { contains: search, mode: 'insensitive' } },
            { optionName: { contains: search, mode: 'insensitive' } },
            { barcode: { contains: search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };
}

function activeComponentWhere(organizationId: string) {
  return {
    organizationId,
    channelListingOption: {
      organizationId,
      isActive: true,
      listing: {
        organizationId,
        isActive: true,
        masterProductId: { not: null },
      },
    },
  } satisfies Prisma.ChannelListingOptionInventoryComponentWhereInput;
}

function activeStatusSql(
  status: InventorySkuSnapshotRepositoryQuery['activeStatus'],
  publishedRunId: string,
): Prisma.Sql {
  const activeSql = status === 'active'
    ? Prisma.sql`AND sku.is_active = TRUE`
    : status === 'inactive'
      ? Prisma.sql`AND sku.is_active = FALSE`
      : Prisma.empty;
  return Prisma.sql`AND sku.last_import_run_id = ${publishedRunId}::uuid ${activeSql}`;
}

function mapImportRun(row: ImportRunRow): SellpiaImportRunRepositoryRow {
  if (row.status !== 'running' && row.status !== 'completed' && row.status !== 'failed') {
    throw new InternalServerErrorException(`Unknown source import status: ${row.status}`);
  }
  return {
    ...row,
    status: row.status,
    lastTrigger: row.lastTrigger === null
      ? null
      : SellpiaInventoryRefreshReasonSchema.parse(row.lastTrigger),
    freshnessGeneration: row.freshnessGeneration,
    qualityReport: SellpiaInventoryQualityReportSchema.nullable().parse(
      row.qualityReport,
    ),
  };
}

function safeInteger(value: bigint, field: string): number {
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < 0) {
    throw new InternalServerErrorException(`Inventory snapshot ${field} exceeds safe range`);
  }
  return result;
}

function emptySummaryRow(): SummaryRow {
  return {
    totalSkus: 0n,
    linkedSkus: 0n,
    unlinkedSkus: 0n,
    inStockSkus: 0n,
    outOfStockSkus: 0n,
    totalUnits: 0n,
    pricedAssetValue: 0n,
    unpricedSkuCount: 0n,
  };
}
