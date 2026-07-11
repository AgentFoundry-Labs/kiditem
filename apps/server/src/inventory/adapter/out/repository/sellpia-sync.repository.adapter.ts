import { randomUUID } from 'node:crypto';
import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  CreateSellpiaSnapshotInput,
  MarkSellpiaItemAppliedInput,
  MarkSellpiaCandidateResolvedInput,
  SellpiaCandidateResolutionRow,
  SellpiaMatchedOptionRow,
  SellpiaSnapshotItemCreate,
  SellpiaSnapshotItemApprovalRow,
  SellpiaSyncRepositoryPort,
} from '../../../application/port/out/repository/sellpia-sync.repository.port';
import type { RepositoryTransaction } from '../../../application/port/out/transaction/repository-transaction';
import type {
  SellpiaBlockingReason,
  SellpiaNewProductCandidate,
  SellpiaNewProductCandidateStatus,
  SellpiaReceiptUploadBatch,
  SellpiaSnapshotImportResponse,
  SellpiaSnapshotItemStatus,
  SellpiaStockSnapshotItem,
  SellpiaWarningReason,
} from '@kiditem/shared/inventory';

const SELLPIA_SNAPSHOT_WRITE_BATCH_SIZE = 500;

type PreparedSellpiaCandidate = {
  create: Prisma.SellpiaNewProductCandidateCreateManyInput;
  response: SellpiaNewProductCandidate;
};

type PreparedSellpiaSnapshotItem = {
  create: Prisma.SellpiaStockSnapshotItemCreateManyInput;
  response: SellpiaStockSnapshotItem;
  candidate: PreparedSellpiaCandidate | null;
};

@Injectable()
export class SellpiaSyncRepositoryAdapter implements SellpiaSyncRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async findOptionsBySellpiaCodes(
    organizationId: string,
    sellpiaProductCodes: string[],
  ): Promise<Map<string, SellpiaMatchedOptionRow | null>> {
    const result = new Map<string, SellpiaMatchedOptionRow | null>(
      sellpiaProductCodes.map((code) => [code, null]),
    );
    if (sellpiaProductCodes.length === 0) return result;

    const options = await this.prisma.productOption.findMany({
      where: {
        organizationId,
        legacyCode: { in: sellpiaProductCodes },
        isDeleted: false,
      },
      select: {
        id: true,
        legacyCode: true,
        inventory: {
          select: { id: true, currentStock: true },
        },
      },
    });

    for (const option of options) {
      if (!option.legacyCode) continue;
      result.set(option.legacyCode, {
        productOptionId: option.id,
        inventoryId: option.inventory?.id ?? null,
        currentStock: option.inventory?.currentStock ?? 0,
      });
    }
    return result;
  }

  async sumRocketStockDeltas(
    organizationId: string,
    optionIds: string[],
    until: Date,
  ): Promise<Map<string, number>> {
    const result = new Map<string, number>(optionIds.map((optionId) => [optionId, 0]));
    if (optionIds.length === 0) return result;

    const grouped = await this.prisma.rocketInventoryLedger.groupBy({
      by: ['optionId'],
      where: {
        organizationId,
        optionId: { in: optionIds },
        occurredAt: { lte: until },
      },
      _sum: { stockDelta: true },
    });
    for (const row of grouped) {
      result.set(row.optionId, row._sum.stockDelta ?? 0);
    }
    return result;
  }

  async listLatestStockEventTimes(
    organizationId: string,
    optionIds: string[],
  ): Promise<Map<string, Date>> {
    const result = new Map<string, Date>();
    if (optionIds.length === 0) return result;

    const grouped = await this.prisma.stockTransaction.groupBy({
      by: ['optionId'],
      where: { organizationId, optionId: { in: optionIds } },
      _max: { createdAt: true },
    });
    for (const row of grouped) {
      if (row._max.createdAt) result.set(row.optionId, row._max.createdAt);
    }
    return result;
  }

  async createSnapshotWithItems(
    input: CreateSellpiaSnapshotInput,
  ): Promise<SellpiaSnapshotImportResponse> {
    // Precomputed IDs make every bulk write independent, so the array transaction
    // stays atomic without the 5-second lifetime of an interactive transaction.
    const snapshotId = randomUUID();
    const preparedItems = input.items.map((item) =>
      prepareSellpiaSnapshotItem(input.organizationId, snapshotId, item));
    const preparedCandidates = preparedItems.flatMap((item) =>
      item.candidate ? [item.candidate] : []);

    const operations: Prisma.PrismaPromise<unknown>[] = [
      this.prisma.sellpiaStockSnapshot.create({
        data: {
          id: snapshotId,
          organizationId: input.organizationId,
          fileName: input.fileName,
          fileHash: input.fileHash,
          rowCount: input.items.length,
          effectiveExportedAt: input.effectiveExportedAt,
          status: 'previewed',
          createdBy: input.userId,
          metaJson: {
            ignoredColumns: input.ignoredColumns,
            headers: input.headers,
          },
        },
      }),
    ];

    for (const batch of chunks(preparedItems, SELLPIA_SNAPSHOT_WRITE_BATCH_SIZE)) {
      operations.push(this.prisma.sellpiaStockSnapshotItem.createMany({
        data: batch.map((item) => item.create),
      }));
    }
    for (const batch of chunks(preparedCandidates, SELLPIA_SNAPSHOT_WRITE_BATCH_SIZE)) {
      operations.push(this.prisma.sellpiaNewProductCandidate.createMany({
        data: batch.map((candidate) => candidate.create),
      }));
    }

    await this.prisma.$transaction(operations);

    const items = preparedItems.map((item) => item.response);
    const newProductCandidates = preparedCandidates.map((candidate) => candidate.response);
    return {
      snapshot: {
        id: snapshotId,
        fileName: input.fileName,
        rowCount: input.items.length,
        effectiveExportedAt: input.effectiveExportedAt,
        status: 'previewed',
      },
      summary: {
        matchedCount: items.filter((item) => item.status === 'matched').length,
        reviewCount: items.filter((item) => item.status === 'needs_review').length,
        rejectedCount: items.filter((item) => item.status === 'rejected').length,
        newProductCandidateCount: newProductCandidates.length,
      },
      items,
      newProductCandidates,
    };
  }

  findSnapshotItemForApproval(
    organizationId: string,
    itemId: string,
  ): Promise<SellpiaSnapshotItemApprovalRow | null> {
    return this.prisma.sellpiaStockSnapshotItem.findFirst({
      where: { id: itemId, organizationId },
      select: approvalSelect,
    }).then((row) => row ? toApprovalRow(row) : null);
  }

  async lockSnapshotItemForApproval(
    tx: RepositoryTransaction,
    organizationId: string,
    itemId: string,
  ): Promise<SellpiaSnapshotItemApprovalRow | null> {
    const prismaTx = tx as Prisma.TransactionClient;
    await prismaTx.$queryRaw`
      SELECT id FROM sellpia_stock_snapshot_items
      WHERE id = ${itemId}::uuid
        AND organization_id = ${organizationId}::uuid
      FOR UPDATE
    `;
    const row = await prismaTx.sellpiaStockSnapshotItem.findFirst({
      where: { id: itemId, organizationId },
      select: approvalSelect,
    });
    return row ? toApprovalRow(row) : null;
  }

  async markItemApplied(
    tx: RepositoryTransaction,
    input: MarkSellpiaItemAppliedInput,
  ): Promise<void> {
    const prismaTx = tx as Prisma.TransactionClient;
    await prismaTx.sellpiaStockSnapshotItem.updateMany({
      where: { id: input.itemId, organizationId: input.organizationId },
      data: {
        status: input.status,
        operatorTargetStock: input.operatorTargetStock,
        kiditemStockAtApply: input.kiditemStockAtApply,
        appliedTransactionId: input.transactionId,
        reviewedBy: input.userId,
        reviewedAt: new Date(),
        reviewDecision: input.status,
        reviewNote: input.reason,
      },
    });
  }

  async markItemIgnored(input: {
    organizationId: string;
    itemId: string;
    userId: string;
    reason: string | null;
  }): Promise<void> {
    const updated = await this.prisma.sellpiaStockSnapshotItem.updateMany({
      where: { id: input.itemId, organizationId: input.organizationId },
      data: {
        status: 'ignored',
        reviewedBy: input.userId,
        reviewedAt: new Date(),
        reviewDecision: 'ignored',
        reviewNote: input.reason,
      },
    });
    if (updated.count === 0) throw new NotFoundException('Sellpia snapshot item not found');
  }

  async lockCandidateForResolution(
    tx: RepositoryTransaction,
    organizationId: string,
    candidateId: string,
  ): Promise<SellpiaCandidateResolutionRow | null> {
    const prismaTx = tx as Prisma.TransactionClient;
    await prismaTx.$queryRaw`
      SELECT id FROM sellpia_new_product_candidates
      WHERE id = ${candidateId}::uuid
        AND organization_id = ${organizationId}::uuid
      FOR UPDATE
    `;
    const row = await prismaTx.sellpiaNewProductCandidate.findFirst({
      where: { id: candidateId, organizationId },
      select: {
        id: true,
        snapshotItemId: true,
        sellpiaProductCode: true,
        sellpiaProductName: true,
        sellpiaStock: true,
        safetyStock: true,
        barcode: true,
        status: true,
      },
    });
    if (!row) return null;
    return {
      ...row,
      status: row.status as SellpiaNewProductCandidateStatus,
    };
  }

  async markCandidateResolved(
    tx: RepositoryTransaction,
    input: MarkSellpiaCandidateResolvedInput,
  ): Promise<SellpiaNewProductCandidate> {
    const prismaTx = tx as Prisma.TransactionClient;
    const resolvedAt = new Date();
    const updated = await prismaTx.sellpiaNewProductCandidate.updateMany({
      where: { id: input.candidateId, organizationId: input.organizationId },
      data: {
        status: input.status,
        resolvedMasterProductId: input.resolvedMasterProductId,
        resolvedProductOptionId: input.resolvedProductOptionId,
        createdInventoryId: input.createdInventoryId,
        initialReceiveTransactionId: input.initialReceiveTransactionId,
        operatorInitialStock: input.operatorInitialStock,
        resolutionDecision: input.resolutionDecision,
        resolvedBy: input.userId,
        resolvedAt,
        note: input.note,
      },
    });
    if (updated.count === 0) throw new NotFoundException('Sellpia new product candidate not found');

    await prismaTx.sellpiaStockSnapshotItem.updateMany({
      where: { id: input.snapshotItemId, organizationId: input.organizationId },
      data: {
        status: input.status === 'ignored' ? 'ignored' : 'manual_adjusted',
        productOptionId: input.resolvedProductOptionId,
        inventoryId: input.createdInventoryId,
        operatorTargetStock: input.operatorInitialStock,
        kiditemStockAtApply: input.operatorInitialStock,
        appliedTransactionId: input.initialReceiveTransactionId,
        reviewedBy: input.userId,
        reviewedAt: resolvedAt,
        reviewDecision: input.resolutionDecision,
        reviewNote: input.note,
      },
    });

    const candidate = await prismaTx.sellpiaNewProductCandidate.findFirst({
      where: { id: input.candidateId, organizationId: input.organizationId },
      select: {
        id: true,
        snapshotItemId: true,
        sellpiaProductCode: true,
        sellpiaProductName: true,
        sellpiaStock: true,
        safetyStock: true,
        barcode: true,
        status: true,
        operatorInitialStock: true,
      },
    });
    if (!candidate) throw new NotFoundException('Sellpia new product candidate not found');
    return toNewProductCandidate(candidate);
  }

  async createReceiptBatch(input: {
    organizationId: string;
    userId: string;
    sourceType: string;
    sourceRef: string;
    note: string | null;
  }): Promise<SellpiaReceiptUploadBatch> {
    const row = await this.prisma.sellpiaReceiptUploadBatch.create({
      data: {
        organizationId: input.organizationId,
        sourceType: input.sourceType,
        sourceRef: input.sourceRef,
        note: input.note,
        createdBy: input.userId,
      },
    });
    return toReceiptBatch(row);
  }

  async listReceiptBatches(organizationId: string): Promise<SellpiaReceiptUploadBatch[]> {
    const rows = await this.prisma.sellpiaReceiptUploadBatch.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return rows.map(toReceiptBatch);
  }

  async markReceiptBatchUploaded(input: {
    organizationId: string;
    userId: string;
    batchId: string;
    note: string | null;
  }): Promise<SellpiaReceiptUploadBatch> {
    const existing = await this.prisma.sellpiaReceiptUploadBatch.findFirst({
      where: { id: input.batchId, organizationId: input.organizationId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Sellpia receipt batch not found');

    const row = await this.prisma.sellpiaReceiptUploadBatch.update({
      where: { id: input.batchId },
      data: {
        status: 'uploaded',
        uploadedBy: input.userId,
        uploadedAt: new Date(),
        note: input.note,
      },
    });
    return toReceiptBatch(row);
  }
}

const approvalSelect = {
  id: true,
  inventoryId: true,
  productOptionId: true,
  targetCurrentStock: true,
  kiditemStockBefore: true,
  warningReasons: true,
  blockingReasons: true,
  status: true,
} satisfies Prisma.SellpiaStockSnapshotItemSelect;

function toApprovalRow(row: {
  id: string;
  inventoryId: string | null;
  productOptionId: string | null;
  targetCurrentStock: number;
  kiditemStockBefore: number;
  warningReasons: Prisma.JsonValue;
  blockingReasons: Prisma.JsonValue;
  status: string;
}): SellpiaSnapshotItemApprovalRow {
  return {
    id: row.id,
    inventoryId: row.inventoryId,
    productOptionId: row.productOptionId,
    targetCurrentStock: row.targetCurrentStock,
    kiditemStockBefore: row.kiditemStockBefore,
    warningReasons: jsonStringArray(row.warningReasons) as SellpiaWarningReason[],
    blockingReasons: jsonStringArray(row.blockingReasons) as SellpiaBlockingReason[],
    status: row.status as SellpiaSnapshotItemStatus,
  };
}

function prepareSellpiaSnapshotItem(
  organizationId: string,
  snapshotId: string,
  item: SellpiaSnapshotItemCreate,
): PreparedSellpiaSnapshotItem {
  const itemId = randomUUID();
  const diffRate = Number(new Prisma.Decimal(item.diffRate).toDecimalPlaces(4));
  const create: Prisma.SellpiaStockSnapshotItemCreateManyInput = {
    id: itemId,
    organizationId,
    snapshotId,
    rowNumber: item.rowNumber,
    sellpiaProductCode: item.sellpiaProductCode,
    sellpiaProductName: item.sellpiaProductName,
    sellpiaStock: item.sellpiaStock,
    safetyStock: item.safetyStock,
    ownProductCode: item.ownProductCode,
    barcode: item.barcode,
    modelName: item.modelName,
    productOptionId: item.productOptionId,
    inventoryId: item.inventoryId,
    rocketLedgerNet: item.rocketLedgerNet,
    targetCurrentStock: item.targetCurrentStock,
    kiditemStockBefore: item.kiditemStockBefore,
    diff: item.diff,
    diffRate,
    status: item.status,
    blockingReasons: item.blockingReasons as Prisma.InputJsonValue,
    warningReasons: item.warningReasons as Prisma.InputJsonValue,
    rawJson: item.rawJson as Prisma.InputJsonValue,
  };
  const response: SellpiaStockSnapshotItem = {
    id: itemId,
    rowNumber: item.rowNumber,
    sellpiaProductCode: item.sellpiaProductCode,
    sellpiaProductName: item.sellpiaProductName,
    sellpiaStock: item.sellpiaStock,
    safetyStock: item.safetyStock,
    barcode: item.barcode,
    productOptionId: item.productOptionId,
    inventoryId: item.inventoryId,
    rocketLedgerNet: item.rocketLedgerNet,
    targetCurrentStock: item.targetCurrentStock,
    kiditemStockBefore: item.kiditemStockBefore,
    diff: item.diff,
    diffRate,
    status: item.status,
    blockingReasons: item.blockingReasons,
    warningReasons: item.warningReasons,
    operatorTargetStock: null,
    reviewNote: null,
  };

  if (!item.createCandidate) return { create, response, candidate: null };

  const candidateId = randomUUID();
  return {
    create,
    response,
    candidate: {
      create: {
        id: candidateId,
        organizationId,
        snapshotItemId: itemId,
        sellpiaProductCode: item.sellpiaProductCode,
        sellpiaProductName: item.sellpiaProductName,
        sellpiaStock: item.sellpiaStock,
        safetyStock: item.safetyStock,
        ownProductCode: item.ownProductCode,
        barcode: item.barcode,
        modelName: item.modelName,
        status: 'pending',
        operatorInitialStock: item.sellpiaStock,
      },
      response: {
        id: candidateId,
        snapshotItemId: itemId,
        sellpiaProductCode: item.sellpiaProductCode,
        sellpiaProductName: item.sellpiaProductName,
        sellpiaStock: item.sellpiaStock,
        safetyStock: item.safetyStock,
        barcode: item.barcode,
        status: 'pending',
        operatorInitialStock: item.sellpiaStock,
      },
    },
  };
}

function chunks<T>(values: readonly T[], size: number): T[][] {
  const result: T[][] = [];
  for (let start = 0; start < values.length; start += size) {
    result.push(values.slice(start, start + size));
  }
  return result;
}

function toReceiptBatch(row: {
  id: string;
  status: string;
  sourceType: string;
  sourceRef: string;
  templateVersion: string | null;
  uploadedAt: Date | null;
  note: string | null;
  createdAt: Date;
}): SellpiaReceiptUploadBatch {
  return {
    id: row.id,
    status: row.status as never,
    sourceType: row.sourceType,
    sourceRef: row.sourceRef,
    templateVersion: row.templateVersion,
    uploadedAt: row.uploadedAt,
    note: row.note,
    createdAt: row.createdAt,
  };
}

function toNewProductCandidate(row: {
  id: string;
  snapshotItemId: string;
  sellpiaProductCode: string;
  sellpiaProductName: string | null;
  sellpiaStock: number;
  safetyStock: number;
  barcode: string | null;
  status: string;
  operatorInitialStock: number | null;
}): SellpiaNewProductCandidate {
  return {
    id: row.id,
    snapshotItemId: row.snapshotItemId,
    sellpiaProductCode: row.sellpiaProductCode,
    sellpiaProductName: row.sellpiaProductName,
    sellpiaStock: row.sellpiaStock,
    safetyStock: row.safetyStock,
    barcode: row.barcode,
    status: row.status as SellpiaNewProductCandidateStatus,
    operatorInitialStock: row.operatorInitialStock,
  };
}

function jsonStringArray(value: Prisma.JsonValue): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}
