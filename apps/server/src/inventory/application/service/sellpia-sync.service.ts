import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type {
  SellpiaReceiptUploadBatch,
  SellpiaNewProductCandidate,
  SellpiaSnapshotImportResponse,
  SellpiaSnapshotItemStatus,
} from '@kiditem/shared/inventory';
import {
  SELLPIA_SYNC_PORT,
  type ApproveSellpiaItemInput,
  type CreateSellpiaReceiptBatchInput,
  type IgnoreSellpiaItemInput,
  type ImportSellpiaRowsInput,
  type MarkSellpiaReceiptBatchUploadedInput,
  type ResolveSellpiaCandidateInput,
  type SellpiaSyncPort,
} from '../port/in/stock/sellpia-sync.port';
import {
  INVENTORY_REPOSITORY_PORT,
  type InventoryRepositoryPort,
} from '../port/out/repository/inventory.repository.port';
import {
  SELLPIA_SYNC_REPOSITORY_PORT,
  type SellpiaSyncRepositoryPort,
} from '../port/out/repository/sellpia-sync.repository.port';
import {
  BUNDLE_STOCK_PORT,
  type BundleStockPort,
} from '../port/out/cross-domain/bundle-stock.port';
import {
  INVENTORY_PRODUCT_OPTION_PROVISION_PORT,
  type InventoryProductOptionProvisionPort,
} from '../port/out/cross-domain/product-option-provision.port';
import {
  assertSufficientStock,
  computeStoredQuantity,
  InsufficientStockError,
} from '../../domain/policy/stock-mutation';
import {
  buildSellpiaRecommendation,
  requiresSellpiaApprovalReason,
  type SellpiaRecommendationWarning,
} from '../../domain/policy/sellpia-adjustment-recommendation';

export { SELLPIA_SYNC_PORT } from '../port/in/stock/sellpia-sync.port';

@Injectable()
export class SellpiaSyncService implements SellpiaSyncPort {
  constructor(
    @Inject(SELLPIA_SYNC_REPOSITORY_PORT)
    private readonly sellpiaRepository: SellpiaSyncRepositoryPort,
    @Inject(INVENTORY_REPOSITORY_PORT)
    private readonly inventoryRepository: InventoryRepositoryPort,
    @Inject(BUNDLE_STOCK_PORT)
    private readonly bundleStock: BundleStockPort,
    @Inject(INVENTORY_PRODUCT_OPTION_PROVISION_PORT)
    private readonly productProvision: InventoryProductOptionProvisionPort,
  ) {}

  async importRows(input: ImportSellpiaRowsInput): Promise<SellpiaSnapshotImportResponse> {
    const sellpiaCodes = unique(input.rows.map((row) => row.sellpiaProductCode).filter(Boolean));
    const optionsByCode = await this.sellpiaRepository.findOptionsBySellpiaCodes(
      input.organizationId,
      sellpiaCodes,
    );
    const optionIds = unique(
      [...optionsByCode.values()]
        .map((match) => match?.productOptionId)
        .filter((id): id is string => Boolean(id)),
    );
    const [rocketNetByOption, latestStockEventByOption] = await Promise.all([
      this.sellpiaRepository.sumRocketStockDeltas(
        input.organizationId,
        optionIds,
        input.effectiveExportedAt,
      ),
      this.sellpiaRepository.listLatestStockEventTimes(input.organizationId, optionIds),
    ]);

    const items = input.rows.map((row) => {
      const match = row.sellpiaProductCode
        ? optionsByCode.get(row.sellpiaProductCode) ?? null
        : null;
      const rocketLedgerNet = match
        ? rocketNetByOption.get(match.productOptionId) ?? 0
        : 0;
      const latestStockEventAt = match
        ? latestStockEventByOption.get(match.productOptionId) ?? null
        : null;
      const recommendation = buildSellpiaRecommendation({
        sellpiaStock: row.sellpiaStock,
        rocketLedgerNet,
        kiditemStockBefore: match?.currentStock ?? 0,
        warnings: normalizeWarnings(row.warnings),
        productOptionId: match?.productOptionId ?? null,
        inventoryId: match?.inventoryId ?? null,
        hasRecentKidItemEvent: latestStockEventAt
          ? latestStockEventAt > input.effectiveExportedAt
          : false,
      });
      const status = row.sellpiaProductCode
        ? recommendation.status
        : 'rejected';

      return {
        rowNumber: row.rowNumber,
        sellpiaProductCode: row.sellpiaProductCode,
        sellpiaProductName: row.sellpiaProductName,
        sellpiaStock: row.sellpiaStock,
        safetyStock: row.safetyStock,
        ownProductCode: row.ownProductCode,
        barcode: row.barcode,
        modelName: row.modelName,
        productOptionId: match?.productOptionId ?? null,
        inventoryId: match?.inventoryId ?? null,
        rocketLedgerNet,
        targetCurrentStock: Math.max(recommendation.targetCurrentStock, 0),
        kiditemStockBefore: match?.currentStock ?? 0,
        diff: recommendation.diff,
        diffRate: recommendation.diffRate,
        status,
        blockingReasons: recommendation.blockingReasons,
        warningReasons: recommendation.warningReasons,
        rawJson: row.raw,
        createCandidate: status === 'new_product_candidate' && Boolean(row.sellpiaProductCode),
      };
    });

    return this.sellpiaRepository.createSnapshotWithItems({
      organizationId: input.organizationId,
      userId: input.userId,
      fileName: input.fileName,
      fileHash: input.fileHash,
      effectiveExportedAt: input.effectiveExportedAt,
      ignoredColumns: input.ignoredColumns,
      headers: input.headers,
      items,
    });
  }

  async approveItem(input: ApproveSellpiaItemInput): Promise<void> {
    const itemBeforeLock = await this.sellpiaRepository.findSnapshotItemForApproval(
      input.organizationId,
      input.itemId,
    );
    const inventoryId = itemBeforeLock?.inventoryId;
    if (!inventoryId) throw new NotFoundException('Sellpia snapshot item inventory not found');

    await this.inventoryRepository.runInventoryStockMutation(
      inventoryId,
      input.organizationId,
      async (tx, locked) => {
        const item = await this.sellpiaRepository.lockSnapshotItemForApproval(
          tx,
          input.organizationId,
          input.itemId,
        );
        if (!item) throw new NotFoundException('Sellpia snapshot item not found');
        if (isAppliedStatus(item.status) || item.status === 'ignored') return;
        if (!isReviewableStatus(item.status)) {
          throw new BadRequestException('Sellpia snapshot item is not reviewable');
        }
        if (!item.productOptionId || !item.inventoryId) {
          throw new BadRequestException('Sellpia snapshot item is not linked to inventory');
        }
        assertApprovalAllowed(item.blockingReasons, input.reason);
        if (requiresSellpiaApprovalReason(item, input.targetCurrentStock) && !input.reason?.trim()) {
          throw new BadRequestException('reason is required for this Sellpia approval');
        }

        const delta = input.targetCurrentStock - locked.currentStock;
        try {
          assertSufficientStock(locked.currentStock, delta);
        } catch (err) {
          if (err instanceof InsufficientStockError) {
            throw new BadRequestException(err.message);
          }
          throw err;
        }

        let transactionId: string | null = null;
        if (delta !== 0) {
          const updated = await this.inventoryRepository.applyStockDelta(
            tx,
            locked.id,
            delta,
            false,
            locked.lastRestockedAt,
          );
          const optionName = await this.inventoryRepository.findOptionNameForLedger(
            tx,
            updated.optionId,
            input.organizationId,
          );
          const transaction = await this.inventoryRepository.appendStockLedger(tx, {
            organizationId: input.organizationId,
            optionId: updated.optionId,
            optionName,
            type: 'ADJUST',
            quantity: computeStoredQuantity('ADJUST', delta),
            unitCost: 0,
            totalCost: 0,
            relatedId: input.itemId,
            relatedType: 'sellpia_snapshot_item',
            note: input.reason ?? 'Sellpia inventory sync approval',
            createdBy: input.userId,
          });
          transactionId = transaction.id;
          await this.bundleStock.recomputeForComponent(input.organizationId, updated.optionId, tx);
        }

        await this.sellpiaRepository.markItemApplied(tx, {
          organizationId: input.organizationId,
          itemId: input.itemId,
          operatorTargetStock: input.targetCurrentStock,
          kiditemStockAtApply: locked.currentStock,
          transactionId,
          userId: input.userId,
          reason: input.reason ?? null,
          status: input.targetCurrentStock === item.targetCurrentStock
            ? 'approved_adjusted'
            : 'manual_adjusted',
        });
      },
    );
  }

  ignoreItem(input: IgnoreSellpiaItemInput): Promise<void> {
    return this.sellpiaRepository.markItemIgnored({
      organizationId: input.organizationId,
      itemId: input.itemId,
      userId: input.userId,
      reason: input.reason ?? null,
    });
  }

  async resolveCandidate(
    input: ResolveSellpiaCandidateInput,
  ): Promise<SellpiaNewProductCandidate> {
    return this.inventoryRepository.runTransaction(async (tx) => {
      const candidate = await this.sellpiaRepository.lockCandidateForResolution(
        tx,
        input.organizationId,
        input.candidateId,
      );
      if (!candidate) throw new NotFoundException('Sellpia new product candidate not found');
      if (candidate.status !== 'pending') {
        throw new BadRequestException('Sellpia new product candidate is already resolved');
      }

      if (input.action === 'ignore') {
        return this.sellpiaRepository.markCandidateResolved(tx, {
          organizationId: input.organizationId,
          candidateId: candidate.id,
          snapshotItemId: candidate.snapshotItemId,
          status: 'ignored',
          resolvedMasterProductId: null,
          resolvedProductOptionId: null,
          createdInventoryId: null,
          initialReceiveTransactionId: null,
          operatorInitialStock: null,
          resolutionDecision: input.action,
          userId: input.userId,
          note: input.note ?? null,
        });
      }

      const provisioned = input.action === 'create_product'
        ? await this.productProvision.createProductWithOption(tx, input.organizationId, {
          masterName: input.masterName,
          optionName: input.optionName ?? candidate.sellpiaProductName,
          legacyCode: candidate.sellpiaProductCode,
          barcode: input.barcode ?? candidate.barcode,
        })
        : input.action === 'create_option'
          ? await this.productProvision.createOption(tx, input.organizationId, {
            masterProductId: input.masterProductId,
            optionName: input.optionName ?? candidate.sellpiaProductName,
            legacyCode: candidate.sellpiaProductCode,
            barcode: input.barcode ?? candidate.barcode,
          })
          : await this.productProvision.linkOption(tx, input.organizationId, {
            productOptionId: input.productOptionId,
            legacyCode: candidate.sellpiaProductCode,
          });

      const inventory = await this.inventoryRepository.ensureInventoryForOption(
        tx,
        input.organizationId,
        provisioned.optionId,
      );
      let transactionId: string | null = null;
      if (input.operatorInitialStock > 0) {
        const updated = await this.inventoryRepository.applyStockDelta(
          tx,
          inventory.id,
          input.operatorInitialStock,
          true,
          inventory.lastRestockedAt,
        );
        const optionName = await this.inventoryRepository.findOptionNameForLedger(
          tx,
          updated.optionId,
          input.organizationId,
        );
        const transaction = await this.inventoryRepository.appendStockLedger(tx, {
          organizationId: input.organizationId,
          optionId: updated.optionId,
          optionName,
          type: 'RECEIVE',
          quantity: input.operatorInitialStock,
          unitCost: 0,
          totalCost: 0,
          relatedId: candidate.id,
          relatedType: 'sellpia_new_product_candidate',
          note: input.note ?? 'Sellpia new product candidate initial stock',
          createdBy: input.userId,
        });
        transactionId = transaction.id;
        await this.bundleStock.recomputeForComponent(input.organizationId, updated.optionId, tx);
      }

      return this.sellpiaRepository.markCandidateResolved(tx, {
        organizationId: input.organizationId,
        candidateId: candidate.id,
        snapshotItemId: candidate.snapshotItemId,
        status: input.action === 'link_option' ? 'linked_existing_option' : 'created_new_option',
        resolvedMasterProductId: provisioned.masterId,
        resolvedProductOptionId: provisioned.optionId,
        createdInventoryId: inventory.id,
        initialReceiveTransactionId: transactionId,
        operatorInitialStock: input.operatorInitialStock,
        resolutionDecision: input.action,
        userId: input.userId,
        note: input.note ?? null,
      });
    });
  }

  createReceiptBatch(
    input: CreateSellpiaReceiptBatchInput,
  ): Promise<SellpiaReceiptUploadBatch> {
    return this.sellpiaRepository.createReceiptBatch({
      organizationId: input.organizationId,
      userId: input.userId,
      sourceType: input.sourceType,
      sourceRef: input.sourceRef,
      note: input.note ?? null,
    });
  }

  listReceiptBatches(organizationId: string): Promise<SellpiaReceiptUploadBatch[]> {
    return this.sellpiaRepository.listReceiptBatches(organizationId);
  }

  markReceiptBatchUploaded(
    input: MarkSellpiaReceiptBatchUploadedInput,
  ): Promise<SellpiaReceiptUploadBatch> {
    return this.sellpiaRepository.markReceiptBatchUploaded({
      organizationId: input.organizationId,
      userId: input.userId,
      batchId: input.batchId,
      note: input.note ?? null,
    });
  }
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function normalizeWarnings(warnings: string[]): SellpiaRecommendationWarning[] {
  return warnings.filter((warning): warning is SellpiaRecommendationWarning =>
    warning === 'duplicate_code' ||
    warning === 'invalid_stock' ||
    warning === 'missing_product_code',
  );
}

function isAppliedStatus(status: SellpiaSnapshotItemStatus): boolean {
  return status === 'approved_adjusted' || status === 'manual_adjusted';
}

function isReviewableStatus(status: SellpiaSnapshotItemStatus): boolean {
  return status === 'recommended' || status === 'needs_review';
}

function assertApprovalAllowed(
  blockingReasons: string[],
  reason: string | undefined,
): void {
  const hardBlocks = blockingReasons.filter((reasonCode) =>
    reasonCode !== 'recent_kiditem_event',
  );
  if (hardBlocks.length > 0) {
    throw new BadRequestException(`Sellpia item cannot be approved: ${hardBlocks.join(', ')}`);
  }
  if (blockingReasons.includes('recent_kiditem_event') && !reason?.trim()) {
    throw new BadRequestException('reason is required after recent KidItem stock events');
  }
}
