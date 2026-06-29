import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  CreateSellpiaSnapshotInput,
  MarkSellpiaItemAppliedInput,
  SellpiaMatchedOptionRow,
  SellpiaSnapshotItemApprovalRow,
  SellpiaSyncRepositoryPort,
} from '../../../application/port/out/repository/sellpia-sync.repository.port';
import type { RepositoryTransaction } from '../../../application/port/out/transaction/repository-transaction';
import type {
  SellpiaBlockingReason,
  SellpiaReceiptUploadBatch,
  SellpiaSnapshotImportResponse,
  SellpiaSnapshotItemStatus,
  SellpiaWarningReason,
} from '@kiditem/shared/inventory';

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
    return this.prisma.$transaction(async (tx) => {
      const snapshot = await tx.sellpiaStockSnapshot.create({
        data: {
          organizationId: input.organizationId,
          fileName: input.fileName,
          fileHash: input.fileHash,
          rowCount: input.items.length,
          effectiveExportedAt: input.effectiveExportedAt,
          createdBy: input.userId,
          metaJson: {
            ignoredColumns: input.ignoredColumns,
            headers: input.headers,
          },
        },
      });

      const items = [];
      const newProductCandidates = [];
      for (const item of input.items) {
        const created = await tx.sellpiaStockSnapshotItem.create({
          data: {
            organizationId: input.organizationId,
            snapshotId: snapshot.id,
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
            diffRate: item.diffRate,
            status: item.status,
            blockingReasons: item.blockingReasons,
            warningReasons: item.warningReasons,
            rawJson: item.rawJson as Prisma.InputJsonValue,
          },
        });
        items.push(toSnapshotItem(created));

        if (item.createCandidate) {
          const candidate = await tx.sellpiaNewProductCandidate.create({
            data: {
              organizationId: input.organizationId,
              snapshotItemId: created.id,
              sellpiaProductCode: item.sellpiaProductCode,
              sellpiaProductName: item.sellpiaProductName,
              sellpiaStock: item.sellpiaStock,
              safetyStock: item.safetyStock,
              ownProductCode: item.ownProductCode,
              barcode: item.barcode,
              modelName: item.modelName,
              operatorInitialStock: item.sellpiaStock,
            },
          });
          newProductCandidates.push({
            id: candidate.id,
            snapshotItemId: candidate.snapshotItemId,
            sellpiaProductCode: candidate.sellpiaProductCode,
            sellpiaProductName: candidate.sellpiaProductName,
            sellpiaStock: candidate.sellpiaStock,
            safetyStock: candidate.safetyStock,
            barcode: candidate.barcode,
            status: candidate.status as never,
            operatorInitialStock: candidate.operatorInitialStock,
          });
        }
      }

      return {
        snapshot: {
          id: snapshot.id,
          fileName: snapshot.fileName,
          rowCount: snapshot.rowCount,
          effectiveExportedAt: snapshot.effectiveExportedAt,
          status: snapshot.status as never,
        },
        summary: {
          matchedCount: items.filter((item) => item.productOptionId).length,
          recommendedCount: items.filter((item) => item.status === 'recommended').length,
          reviewCount: items.filter((item) => item.status === 'needs_review').length,
          rejectedCount: items.filter((item) => item.status === 'rejected').length,
          newProductCandidateCount: newProductCandidates.length,
        },
        items,
        newProductCandidates,
      };
    });
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

function toSnapshotItem(row: {
  id: string;
  rowNumber: number;
  sellpiaProductCode: string;
  sellpiaProductName: string | null;
  sellpiaStock: number;
  safetyStock: number;
  barcode: string | null;
  productOptionId: string | null;
  inventoryId: string | null;
  rocketLedgerNet: number;
  targetCurrentStock: number;
  kiditemStockBefore: number;
  diff: number;
  diffRate: unknown;
  status: string;
  blockingReasons: Prisma.JsonValue;
  warningReasons: Prisma.JsonValue;
  operatorTargetStock: number | null;
  reviewNote: string | null;
}) {
  return {
    id: row.id,
    rowNumber: row.rowNumber,
    sellpiaProductCode: row.sellpiaProductCode,
    sellpiaProductName: row.sellpiaProductName,
    sellpiaStock: row.sellpiaStock,
    safetyStock: row.safetyStock,
    barcode: row.barcode,
    productOptionId: row.productOptionId,
    inventoryId: row.inventoryId,
    rocketLedgerNet: row.rocketLedgerNet,
    targetCurrentStock: row.targetCurrentStock,
    kiditemStockBefore: row.kiditemStockBefore,
    diff: row.diff,
    diffRate: Number(row.diffRate),
    status: row.status as SellpiaSnapshotItemStatus,
    blockingReasons: jsonStringArray(row.blockingReasons) as SellpiaBlockingReason[],
    warningReasons: jsonStringArray(row.warningReasons) as SellpiaWarningReason[],
    operatorTargetStock: row.operatorTargetStock,
    reviewNote: row.reviewNote,
  };
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

function jsonStringArray(value: Prisma.JsonValue): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}
