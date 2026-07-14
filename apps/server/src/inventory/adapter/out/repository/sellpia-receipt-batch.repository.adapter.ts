import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import type { SellpiaReceiptUploadBatch } from '@kiditem/shared/inventory';
import type { SellpiaReceiptBatchRepositoryPort } from '../../../application/port/out/repository/sellpia-receipt-batch.repository.port';

@Injectable()
export class SellpiaReceiptBatchRepositoryAdapter
implements SellpiaReceiptBatchRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

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

  async listReceiptBatches(
    organizationId: string,
  ): Promise<SellpiaReceiptUploadBatch[]> {
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
    const updated = await this.prisma.sellpiaReceiptUploadBatch.updateMany({
      where: { id: input.batchId, organizationId: input.organizationId },
      data: {
        status: 'uploaded',
        uploadedBy: input.userId,
        uploadedAt: new Date(),
        note: input.note,
      },
    });
    if (updated.count !== 1) {
      throw new NotFoundException('Sellpia receipt batch not found');
    }
    const row = await this.prisma.sellpiaReceiptUploadBatch.findFirstOrThrow({
      where: { id: input.batchId, organizationId: input.organizationId },
    });
    return toReceiptBatch(row);
  }
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
    status: row.status as SellpiaReceiptUploadBatch['status'],
    sourceType: row.sourceType,
    sourceRef: row.sourceRef,
    templateVersion: row.templateVersion,
    uploadedAt: row.uploadedAt,
    note: row.note,
    createdAt: row.createdAt,
  };
}
