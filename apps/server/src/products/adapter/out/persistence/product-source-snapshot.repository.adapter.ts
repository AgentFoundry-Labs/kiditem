import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  SellpiaInventoryQualityReportSchema,
  SellpiaInventoryStoredCollectionTriggerSchema,
} from '@kiditem/shared/sellpia-inventory-freshness';
import { isSourceImportStatus } from '@kiditem/shared/source-import';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  ProductSourceSnapshotRepositoryPort,
  ProductSourceSnapshotQuery,
  ProductSourceImportRunRow,
} from '../../../application/port/out/persistence/product-source-snapshot.repository.port';
import {
  readProductSourceSnapshot,
  readProductSourceSnapshotList,
} from './read/product-source-availability';

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
export class ProductSourceSnapshotRepositoryAdapter implements ProductSourceSnapshotRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  listSnapshot(
    organizationId: string,
    query: ProductSourceSnapshotQuery,
  ) {
    return this.prisma.$transaction(
      (tx) => readProductSourceSnapshotList(tx, organizationId, query),
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  getSnapshot(organizationId: string, masterProductId: string) {
    return this.prisma.$transaction(
      (tx) =>
        readProductSourceSnapshot(tx, organizationId, masterProductId),
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

function mapImportRun(row: ImportRunRow): ProductSourceImportRunRow {
  if (!isSourceImportStatus(row.status)) {
    throw new Error(
      `Unknown source import status: ${row.status}`,
    );
  }
  return {
    ...row,
    status: row.status,
    lastTrigger:
      row.lastTrigger === null
        ? null
        : SellpiaInventoryStoredCollectionTriggerSchema.parse(row.lastTrigger),
    freshnessGeneration: row.freshnessGeneration,
    qualityReport: SellpiaInventoryQualityReportSchema.nullable().parse(
      row.qualityReport,
    ),
  };
}
