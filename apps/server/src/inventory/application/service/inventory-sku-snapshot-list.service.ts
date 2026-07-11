import { Inject, Injectable } from '@nestjs/common';
import {
  InventorySkuSnapshotListResponseSchema,
  SellpiaImportRunListResponseSchema,
  type InventorySkuSnapshotListResponse,
  type SellpiaImportRunListResponse,
} from '@kiditem/shared/inventory';
import {
  type InventorySkuSnapshotListPort,
  type InventorySkuSnapshotListQuery,
  type SellpiaImportRunListQuery,
} from '../port/in/stock/inventory-sku-snapshot-list.port';
import {
  INVENTORY_SKU_SNAPSHOT_LIST_REPOSITORY_PORT,
  type InventorySkuSnapshotListRepositoryPort,
  type SellpiaImportRunRepositoryRow,
} from '../port/out/repository/inventory-sku-snapshot-list.repository.port';

@Injectable()
export class InventorySkuSnapshotListService implements InventorySkuSnapshotListPort {
  constructor(
    @Inject(INVENTORY_SKU_SNAPSHOT_LIST_REPOSITORY_PORT)
    private readonly repository: InventorySkuSnapshotListRepositoryPort,
  ) {}

  async listSnapshot(
    organizationId: string,
    query: InventorySkuSnapshotListQuery,
  ): Promise<InventorySkuSnapshotListResponse> {
    const { page, limit } = normalizePage(query.page, query.limit);
    const result = await this.repository.listSnapshot(organizationId, {
      skip: (page - 1) * limit,
      take: limit,
      query: query.query?.trim() || undefined,
      stockStatus: query.stockStatus ?? 'all',
    });

    return InventorySkuSnapshotListResponseSchema.parse({
      items: result.rows.map((row) => ({
        id: row.id,
        sellpiaProductCode: row.sellpiaProductCode,
        name: row.name,
        optionName: row.optionName,
        barcode: row.barcode,
        currentStock: row.currentStock,
        purchasePrice: row.purchasePrice,
        salePrice: row.salePrice,
        stockValue: row.purchasePrice === null
          ? null
          : row.currentStock * row.purchasePrice,
        lastImportRunId: row.lastImportRunId,
        lastImportedAt: row.lastImportedAt?.toISOString() ?? null,
      })),
      total: result.total,
      page,
      limit,
      summary: result.summary,
      latestImport: result.latestImport ? mapImportRun(result.latestImport) : null,
    } satisfies InventorySkuSnapshotListResponse);
  }

  async listImportRuns(
    organizationId: string,
    query: SellpiaImportRunListQuery,
  ): Promise<SellpiaImportRunListResponse> {
    const { page, limit } = normalizePage(query.page, query.limit);
    const result = await this.repository.listImportRuns(organizationId, {
      skip: (page - 1) * limit,
      take: limit,
    });

    return SellpiaImportRunListResponseSchema.parse({
      items: result.rows.map(mapImportRun),
      total: result.total,
      page,
      limit,
    } satisfies SellpiaImportRunListResponse);
  }
}

function normalizePage(
  rawPage: number | undefined,
  rawLimit: number | undefined,
): { page: number; limit: number } {
  const page = Number.isFinite(rawPage)
    ? Math.max(1, Math.trunc(rawPage!))
    : 1;
  const limit = Number.isFinite(rawLimit)
    ? Math.min(200, Math.max(1, Math.trunc(rawLimit!)))
    : 50;
  return { page, limit };
}

function mapImportRun(row: SellpiaImportRunRepositoryRow) {
  return {
    id: row.id,
    fileName: row.fileName,
    status: row.status,
    rowCount: row.rowCount,
    importedAt: row.importedAt?.toISOString() ?? null,
  };
}
