import { Inject, Injectable } from '@nestjs/common';
import {
  isSourceImportStatus,
} from '@kiditem/shared/source-import';
import {
  SellpiaInventoryQualityReportSchema,
  SellpiaInventoryStoredCollectionTriggerSchema,
} from '@kiditem/shared/sellpia-inventory-freshness';
import type {
  SellpiaImportRunSummary,
} from '@kiditem/shared/inventory';
import { ProductSourceNotFoundError } from '../exception/product-source.error';
import type {
  ProductSourceImportRunListResponse,
  ProductSourceSnapshotFilters,
  ProductSourceSnapshotItem,
  ProductSourceSnapshotListResponse,
  ProductSourceSnapshotListQuery,
  ProductSourceSnapshotPort,
  ProductSourceImportRunListQuery,
} from '../port/in/product-source-snapshot.port';
import {
  PRODUCT_SOURCE_SNAPSHOT_REPOSITORY_PORT,
  type ProductSourceImportRunRow,
  type ProductSourceSnapshotRepositoryPort,
  type ProductSourceSnapshotRow,
} from '../port/out/persistence/product-source-snapshot.repository.port';

@Injectable()
export class ProductSourceSnapshotUseCase implements ProductSourceSnapshotPort {
  constructor(
    @Inject(PRODUCT_SOURCE_SNAPSHOT_REPOSITORY_PORT)
    private readonly repository: ProductSourceSnapshotRepositoryPort,
  ) {}

  async listSnapshot(
    organizationId: string,
    query: ProductSourceSnapshotListQuery,
  ): Promise<ProductSourceSnapshotListResponse> {
    const { page, limit } = normalizePage(query.page, query.limit);
    const result = await this.repository.listSnapshot(organizationId, {
      skip: (page - 1) * limit,
      take: limit,
      ...normalizeFilters(query),
    });
    return mapSnapshotList(result, page, limit);
  }

  async listSnapshotForExport(
    organizationId: string,
    query: ProductSourceSnapshotFilters,
  ): Promise<ProductSourceSnapshotListResponse> {
    const result = await this.repository.listSnapshot(organizationId, {
      skip: 0,
      ...normalizeFilters(query),
    });
    return mapSnapshotList(result, 1, Math.max(result.total, 1));
  }

  async getSnapshot(
    organizationId: string,
    masterProductId: string,
  ): Promise<ProductSourceSnapshotItem> {
    const row = await this.repository.getSnapshot(organizationId, masterProductId);
    if (!row) throw new ProductSourceNotFoundError('Master product source not found');
    return mapSnapshotRow(row);
  }

  async listImportRuns(
    organizationId: string,
    query: ProductSourceImportRunListQuery,
  ): Promise<ProductSourceImportRunListResponse> {
    const { page, limit } = normalizePage(query.page, query.limit);
    const result = await this.repository.listImportRuns(organizationId, {
      skip: (page - 1) * limit,
      take: limit,
    });
    return {
      items: result.rows.map(mapImportRun),
      total: result.total,
      page,
      limit,
    };
  }
}

function mapSnapshotList(
  result: Awaited<ReturnType<ProductSourceSnapshotRepositoryPort['listSnapshot']>>,
  page: number,
  limit: number,
): ProductSourceSnapshotListResponse {
  return {
    items: result.rows.map(mapSnapshotRow),
    total: result.total,
    page,
    limit,
    summary: result.summary,
    latestImport: result.latestImport ? mapImportRun(result.latestImport) : null,
  };
}

function mapSnapshotRow(row: ProductSourceSnapshotRow): ProductSourceSnapshotItem {
  return {
    masterProductId: row.masterProductId,
    code: row.code,
    name: row.name,
    optionName: row.optionName,
    barcode: row.barcode,
    currentStock: row.currentStock,
    purchasePrice: row.purchasePrice,
    stockValue: row.purchasePrice === null
      ? null
      : row.currentStock * row.purchasePrice,
    lastImportRunId: row.lastImportRunId,
    lastImportedAt: row.lastImportedAt?.toISOString() ?? null,
    linkedChannelOptionCount: row.linkedChannelOptionCount,
    linkedProductCount: row.linkedProductCount,
    linkedProducts: row.linkedProducts,
    linkedChannelOptions: row.linkedChannelOptions,
  };
}

function normalizePage(
  rawPage: number | undefined,
  rawLimit: number | undefined,
): { page: number; limit: number } {
  const page = Number.isFinite(rawPage) ? Math.max(1, Math.trunc(rawPage!)) : 1;
  const limit = Number.isFinite(rawLimit)
    ? Math.min(200, Math.max(1, Math.trunc(rawLimit!)))
    : 50;
  return { page, limit };
}

function normalizeFilters(query: ProductSourceSnapshotFilters): {
  query?: string;
  stockStatus: NonNullable<ProductSourceSnapshotFilters['stockStatus']>;
  linkStatus?: ProductSourceSnapshotFilters['linkStatus'];
} {
  return {
    query: query.query?.trim() || undefined,
    stockStatus: query.stockStatus ?? 'all',
    linkStatus: query.linkStatus,
  };
}

function mapImportRun(row: ProductSourceImportRunRow): SellpiaImportRunSummary {
  if (!isSourceImportStatus(row.status)) {
    throw new Error(`Unknown source import status: ${row.status}`);
  }
  return {
    id: row.id,
    fileName: row.fileName,
    fileHash: row.fileHash,
    status: row.status as SellpiaImportRunSummary['status'],
    rowCount: row.rowCount,
    importedAt: row.importedAt?.toISOString() ?? null,
    lastVerifiedAt: row.lastVerifiedAt?.toISOString() ?? null,
    verificationCount: row.verificationCount,
    lastTrigger: row.lastTrigger === null
      ? null
      : SellpiaInventoryStoredCollectionTriggerSchema.parse(row.lastTrigger),
    freshnessGeneration: row.freshnessGeneration?.toString() ?? null,
    manualFreshExportConfirmedAt: row.manualFreshExportConfirmedAt?.toISOString() ?? null,
    manualFreshExportConfirmedBy: row.manualFreshExportConfirmedBy,
    qualityReport: SellpiaInventoryQualityReportSchema.nullable().parse(row.qualityReport),
    errorCode: row.errorCode,
    errorMessage: row.errorMessage,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  } satisfies SellpiaImportRunSummary;
}
