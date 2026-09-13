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
  SellpiaImportRunRepositoryRow,
} from '../../../application/port/out/repository/inventory-sku-snapshot-list.repository.port';
import {
  readInventorySkuSnapshot,
  readInventorySkuSnapshotList,
} from '../../../read/inventory-availability';

const SOURCE_TYPE = 'sellpia_inventory';
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

@Injectable()
export class InventorySkuSnapshotListRepositoryAdapter implements InventorySkuSnapshotListRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  listSnapshot(
    organizationId: string,
    query: InventorySkuSnapshotRepositoryQuery,
  ) {
    return this.prisma.$transaction(
      (tx) => readInventorySkuSnapshotList(tx, organizationId, query),
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  getSnapshot(organizationId: string, sellpiaInventorySkuId: string) {
    return this.prisma.$transaction(
      (tx) =>
        readInventorySkuSnapshot(tx, organizationId, sellpiaInventorySkuId),
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
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

function mapImportRun(row: ImportRunRow): SellpiaImportRunRepositoryRow {
  if (
    row.status !== 'running' &&
    row.status !== 'completed' &&
    row.status !== 'failed'
  ) {
    throw new InternalServerErrorException(
      `Unknown source import status: ${row.status}`,
    );
  }
  return {
    ...row,
    status: row.status,
    lastTrigger:
      row.lastTrigger === null
        ? null
        : SellpiaInventoryRefreshReasonSchema.parse(row.lastTrigger),
    freshnessGeneration: row.freshnessGeneration,
    qualityReport: SellpiaInventoryQualityReportSchema.nullable().parse(
      row.qualityReport,
    ),
  };
}
