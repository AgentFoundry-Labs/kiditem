import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  InventorySkuSnapshotItemSchema,
  InventorySkuSnapshotListResponseSchema,
  SellpiaImportRunListResponseSchema,
  type InventorySkuSnapshotItem,
  type InventorySkuSnapshotListResponse,
  type SellpiaImportRunListResponse,
  type SellpiaImportRunSummary,
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
  type InventorySkuSnapshotRepositoryRow,
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
      activeStatus: query.activeStatus ?? 'active',
      linkStatus: query.linkStatus,
    });

    return InventorySkuSnapshotListResponseSchema.parse({
      items: result.rows.map(mapSnapshotRow),
      total: result.total,
      page,
      limit,
      summary: result.summary,
      latestImport: result.latestImport ? mapImportRun(result.latestImport) : null,
    } satisfies InventorySkuSnapshotListResponse);
  }

  async getSnapshot(
    organizationId: string,
    sellpiaInventorySkuId: string,
  ): Promise<InventorySkuSnapshotItem> {
    const row = await this.repository.getSnapshot(
      organizationId,
      sellpiaInventorySkuId,
    );
    if (!row) throw new NotFoundException('Sellpia inventory SKU not found');
    return InventorySkuSnapshotItemSchema.parse(mapSnapshotRow(row));
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

function mapSnapshotRow(row: InventorySkuSnapshotRepositoryRow): InventorySkuSnapshotItem {
  return {
    sellpiaInventorySkuId: row.sellpiaInventorySkuId,
    code: row.code,
    name: row.name,
    optionName: row.optionName,
    barcode: row.barcode,
    currentStock: row.currentStock,
    purchasePrice: row.purchasePrice,
    salePrice: row.salePrice,
    isActive: row.isActive,
    stockValue: row.purchasePrice === null
      ? null
      : row.currentStock * row.purchasePrice,
    lastImportRunId: row.lastImportRunId,
    lastImportedAt: row.lastImportedAt?.toISOString() ?? null,
    linkedVariantCount: row.linkedVariantCount,
    linkedProductCount: row.linkedProductCount,
    linkedProducts: row.linkedProducts,
    linkedVariants: row.linkedVariants,
    linkStatus: row.linkedVariantCount > 0 ? 'linked' : 'unlinked',
  } satisfies InventorySkuSnapshotItem;
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

function mapImportRun(row: SellpiaImportRunRepositoryRow): SellpiaImportRunSummary {
  return {
    id: row.id,
    fileName: row.fileName,
    fileHash: row.fileHash,
    status: row.status,
    rowCount: row.rowCount,
    importedAt: row.importedAt?.toISOString() ?? null,
    lastVerifiedAt: row.lastVerifiedAt?.toISOString() ?? null,
    verificationCount: row.verificationCount,
    lastTrigger: row.lastTrigger,
    freshnessGeneration: row.freshnessGeneration?.toString() ?? null,
    manualFreshExportConfirmedAt:
      row.manualFreshExportConfirmedAt?.toISOString() ?? null,
    manualFreshExportConfirmedBy: row.manualFreshExportConfirmedBy,
    qualityReport: row.qualityReport,
    errorCode: row.errorCode,
    errorMessage: row.errorMessage,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  } satisfies SellpiaImportRunSummary;
}
