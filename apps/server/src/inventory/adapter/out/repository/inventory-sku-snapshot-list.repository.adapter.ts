import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  InventorySkuSnapshotListRepositoryPort,
  InventorySkuSnapshotRepositoryQuery,
  InventorySkuSnapshotRepositoryRow,
  SellpiaImportRunRepositoryRow,
} from '../../../application/port/out/repository/inventory-sku-snapshot-list.repository.port';

const SOURCE_TYPE = 'sellpia_inventory';

const SNAPSHOT_SELECT = {
  id: true,
  sellpiaProductCode: true,
  name: true,
  optionName: true,
  barcode: true,
  currentStock: true,
  purchasePrice: true,
  salePrice: true,
  lastImportRunId: true,
} as const;

const IMPORT_RUN_SELECT = {
  id: true,
  fileName: true,
  status: true,
  rowCount: true,
  importedAt: true,
} as const;

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
      const [rows, total, summaryRows, latestImport] = await Promise.all([
        transaction.inventorySku.findMany({
          where,
          select: SNAPSHOT_SELECT,
          orderBy: [{ sellpiaProductCode: 'asc' }, { id: 'asc' }],
          skip: query.skip,
          take: query.take,
        }),
        transaction.inventorySku.count({ where }),
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
          FROM inventory_skus
          WHERE organization_id = ${organizationId}::uuid
        `,
        transaction.sourceImportRun.findFirst({
          where: {
            organizationId,
            sourceType: SOURCE_TYPE,
            channelAccountId: null,
            status: 'completed',
          },
          select: IMPORT_RUN_SELECT,
          orderBy: [{ importedAt: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }],
        }),
      ]);
      const summary = summaryRows[0] ?? emptySummaryRow();
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
          return {
            id: row.id,
            sellpiaProductCode: row.sellpiaProductCode,
            name: row.name,
            optionName: row.optionName,
            barcode: row.barcode,
            currentStock: row.currentStock,
            purchasePrice: row.purchasePrice,
            salePrice: row.salePrice,
            lastImportRunId: verifiedImportRunId,
            lastImportedAt: verifiedImportRunId
              ? importedAtByRunId.get(verifiedImportRunId) ?? null
              : null,
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
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: query.skip,
        take: query.take,
      }),
      this.prisma.sourceImportRun.count({ where }),
    ]);
    return { rows: rows.map(mapImportRun), total };
  }
}

function snapshotWhere(
  organizationId: string,
  query: InventorySkuSnapshotRepositoryQuery,
): Prisma.InventorySkuWhereInput {
  const search = query.query?.trim();
  return {
    organizationId,
    ...(query.stockStatus === 'in_stock'
      ? { currentStock: { gt: 0 } }
      : query.stockStatus === 'out_of_stock'
        ? { currentStock: 0 }
        : {}),
    ...(search
      ? {
          OR: [
            { sellpiaProductCode: { contains: search, mode: 'insensitive' } },
            { name: { contains: search, mode: 'insensitive' } },
            { optionName: { contains: search, mode: 'insensitive' } },
            { barcode: { contains: search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };
}

function mapImportRun(row: {
  id: string;
  fileName: string;
  status: string;
  rowCount: number;
  importedAt: Date | null;
}): SellpiaImportRunRepositoryRow {
  if (row.status !== 'running' && row.status !== 'completed' && row.status !== 'failed') {
    throw new InternalServerErrorException(`Unknown source import status: ${row.status}`);
  }
  return { ...row, status: row.status };
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
