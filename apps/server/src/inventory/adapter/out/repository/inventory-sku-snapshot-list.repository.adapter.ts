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
    variantComponents: {
      where: {
        organizationId,
        productVariant: {
          organizationId,
          isActive: true,
          masterProduct: { organizationId },
        },
      },
      select: {
        productVariantId: true,
        productVariant: {
          select: {
            id: true,
            code: true,
            name: true,
            optionLabel: true,
            masterProduct: {
              select: {
                id: true,
                code: true,
                name: true,
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
      const where = snapshotWhere(organizationId, query);
      const [rows, total, summaryRows, state] = await Promise.all([
        transaction.sellpiaInventorySku.findMany({
          where,
          select: snapshotSelect(organizationId),
          orderBy: [{ code: 'asc' }, { id: 'asc' }],
          skip: query.skip,
          take: query.take,
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
            COUNT(*) FILTER (WHERE purchase_price IS NULL)::bigint AS "unpricedSkuCount"
          FROM sellpia_inventory_skus
          WHERE organization_id = ${organizationId}::uuid
            ${activeStatusSql(query.activeStatus)}
        `,
        transaction.sellpiaInventoryState.findUnique({
          where: { organizationId },
          select: { lastCompletedImportRunId: true },
        }),
      ]);
      const summary = summaryRows[0] ?? emptySummaryRow();
      // Publication can make an older hash run current again, so chronology is
      // not an authoritative snapshot basis.
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
      const importRunIds = [...new Set(rows
        .map(({ lastImportRunId }) => lastImportRunId)
        .filter((id): id is string => id !== null))];
      const rowImportRuns = importRunIds.length > 0
        ? await transaction.sourceImportRun.findMany({
            where: {
              id: { in: importRunIds },
              organizationId,
              sourceType: SOURCE_TYPE,
              channelAccountId: null,
              status: 'completed',
            },
            select: { id: true, importedAt: true },
          })
        : [];
      const importedAtByRunId = new Map(
        rowImportRuns.map((run) => [run.id, run.importedAt]),
      );

      return {
        rows: rows.map((row): InventorySkuSnapshotRepositoryRow => {
          const verifiedImportRunId = row.lastImportRunId !== null
            && importedAtByRunId.has(row.lastImportRunId)
            ? row.lastImportRunId
            : null;
          const { linkedProducts, linkedVariants } = linkedDestinations(
            row.variantComponents,
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
            lastImportRunId: verifiedImportRunId,
            lastImportedAt: verifiedImportRunId
              ? importedAtByRunId.get(verifiedImportRunId) ?? null
              : null,
            linkedVariantCount: linkedVariants.length,
            linkedProductCount: linkedProducts.length,
            linkedProducts,
            linkedVariants,
          };
        }),
        total,
        summary: {
          totalSkus: safeInteger(summary.totalSkus, 'totalSkus'),
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
    const row = await this.prisma.sellpiaInventorySku.findFirst({
      where: { id: sellpiaInventorySkuId, organizationId },
      select: snapshotDetailSelect(organizationId),
    });
    if (!row) return null;
    const verifiedImport = row.lastImportRun?.sourceType === SOURCE_TYPE
      && row.lastImportRun.channelAccountId === null
      && row.lastImportRun.status === 'completed'
      ? row.lastImportRun
      : null;
    const { linkedProducts, linkedVariants } = linkedDestinations(
      row.variantComponents,
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
      lastImportRunId: verifiedImport?.id ?? null,
      lastImportedAt: verifiedImport?.importedAt ?? null,
      linkedVariantCount: linkedVariants.length,
      linkedProductCount: linkedProducts.length,
      linkedProducts,
      linkedVariants,
    } satisfies InventorySkuSnapshotRepositoryRow;
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

type VariantComponentDestination = {
  productVariantId: string;
  productVariant: {
    id: string;
    code: string;
    name: string;
    optionLabel: string | null;
    masterProduct: {
      id: string;
      code: string;
      name: string;
    };
  };
};

function linkedDestinations(components: VariantComponentDestination[]) {
  const linkedVariantById = new Map(
    components.map(({ productVariant }) => [
      productVariant.id,
      {
        id: productVariant.id,
        masterProductId: productVariant.masterProduct.id,
        code: productVariant.code,
        name: productVariant.name,
        optionLabel: productVariant.optionLabel,
      },
    ]),
  );
  const linkedProductById = new Map(
    components.map(({ productVariant }) => [
      productVariant.masterProduct.id,
      productVariant.masterProduct,
    ]),
  );
  const byCodeThenId = <T extends { code: string; id: string }>(left: T, right: T) =>
    left.code.localeCompare(right.code) || left.id.localeCompare(right.id);

  return {
    linkedProducts: [...linkedProductById.values()].sort(byCodeThenId),
    linkedVariants: [...linkedVariantById.values()].sort(byCodeThenId),
  };
}

function snapshotWhere(
  organizationId: string,
  query: InventorySkuSnapshotRepositoryQuery,
): Prisma.SellpiaInventorySkuWhereInput {
  const search = query.query?.trim();
  return {
    organizationId,
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
          variantComponents: query.linkStatus === 'linked'
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
    productVariant: {
      organizationId,
      isActive: true,
      masterProduct: { organizationId },
    },
  } satisfies Prisma.ProductVariantComponentWhereInput;
}

function activeStatusSql(
  status: InventorySkuSnapshotRepositoryQuery['activeStatus'],
): Prisma.Sql {
  if (status === 'active') return Prisma.sql`AND is_active = TRUE`;
  if (status === 'inactive') return Prisma.sql`AND is_active = FALSE`;
  return Prisma.empty;
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
    inStockSkus: 0n,
    outOfStockSkus: 0n,
    totalUnits: 0n,
    pricedAssetValue: 0n,
    unpricedSkuCount: 0n,
  };
}
