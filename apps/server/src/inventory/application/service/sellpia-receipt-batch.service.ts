import { Inject, Injectable } from '@nestjs/common';
import {
  SELLPIA_RECEIPT_BATCH_REPOSITORY_PORT,
  type SellpiaReceiptBatchRepositoryPort,
} from '../port/out/repository/sellpia-receipt-batch.repository.port';
import type { SellpiaReceiptUploadBatch } from '@kiditem/shared/inventory';
import type {
  CreateSellpiaReceiptBatchInput,
  MarkSellpiaReceiptBatchUploadedInput,
  SellpiaReceiptBatchPort,
} from '../port/in/stock/sellpia-receipt-batch.port';

@Injectable()
export class SellpiaReceiptBatchService implements SellpiaReceiptBatchPort {
  constructor(
    @Inject(SELLPIA_RECEIPT_BATCH_REPOSITORY_PORT)
    private readonly repository: SellpiaReceiptBatchRepositoryPort,
  ) {}

  createReceiptBatch(
    input: CreateSellpiaReceiptBatchInput,
  ): Promise<SellpiaReceiptUploadBatch> {
    return this.repository.createReceiptBatch({
      organizationId: input.organizationId,
      userId: input.userId,
      sourceType: input.sourceType,
      sourceRef: input.sourceRef,
      note: input.note ?? null,
    });
  }

  listReceiptBatches(organizationId: string): Promise<SellpiaReceiptUploadBatch[]> {
    return this.repository.listReceiptBatches(organizationId);
  }

  markReceiptBatchUploaded(
    input: MarkSellpiaReceiptBatchUploadedInput,
  ): Promise<SellpiaReceiptUploadBatch> {
    return this.repository.markReceiptBatchUploaded({
      organizationId: input.organizationId,
      userId: input.userId,
      batchId: input.batchId,
      note: input.note ?? null,
    });
  }
}
