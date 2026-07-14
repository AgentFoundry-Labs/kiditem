import { Body, Controller, Get, Inject, Param, Post } from '@nestjs/common';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { CurrentUser } from '../../../../auth/decorators/current-user.decorator';
import {
  SELLPIA_RECEIPT_BATCH_PORT,
  type SellpiaReceiptBatchPort,
} from '../../../application/port/in/stock/sellpia-receipt-batch.port';
import {
  CreateSellpiaReceiptBatchDto,
  MarkSellpiaReceiptBatchUploadedDto,
} from './dto';
import type { AuthUser } from '../../../../auth/auth.types';

@Controller('inventory/sellpia-receipt-batches')
export class SellpiaReceiptBatchController {
  constructor(
    @Inject(SELLPIA_RECEIPT_BATCH_PORT)
    private readonly receiptBatches: SellpiaReceiptBatchPort,
  ) {}

  @Post()
  create(
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateSellpiaReceiptBatchDto,
  ) {
    return this.receiptBatches.createReceiptBatch({
      organizationId,
      userId: user.id,
      sourceType: dto.sourceType,
      sourceRef: dto.sourceRef,
      note: dto.note,
    });
  }

  @Get()
  list(@CurrentOrganization() organizationId: string) {
    return this.receiptBatches.listReceiptBatches(organizationId);
  }

  @Post(':id/mark-uploaded')
  markUploaded(
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
    @Param('id') batchId: string,
    @Body() dto: MarkSellpiaReceiptBatchUploadedDto,
  ) {
    return this.receiptBatches.markReceiptBatchUploaded({
      organizationId,
      userId: user.id,
      batchId,
      note: dto.note,
    });
  }
}
