import { Body, Controller, Get, Inject, Param, Post } from '@nestjs/common';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { CurrentUser } from '../../../../auth/decorators/current-user.decorator';
import type { AuthUser } from '../../../../auth/auth.types';
import {
  SELLPIA_SYNC_PORT,
  type SellpiaSyncPort,
} from '../../../application/port/in/stock/sellpia-sync.port';
import {
  CreateSellpiaReceiptBatchDto,
  MarkSellpiaReceiptBatchUploadedDto,
} from './dto';

@Controller('inventory/sellpia-receipt-batches')
export class SellpiaReceiptBatchController {
  constructor(
    @Inject(SELLPIA_SYNC_PORT)
    private readonly sellpiaSync: SellpiaSyncPort,
  ) {}

  @Post()
  create(
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateSellpiaReceiptBatchDto,
  ) {
    return this.sellpiaSync.createReceiptBatch({
      organizationId,
      userId: user.id,
      sourceType: dto.sourceType,
      sourceRef: dto.sourceRef,
      note: dto.note,
    });
  }

  @Get()
  list(@CurrentOrganization() organizationId: string) {
    return this.sellpiaSync.listReceiptBatches(organizationId);
  }

  @Post(':id/mark-uploaded')
  markUploaded(
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
    @Param('id') batchId: string,
    @Body() dto: MarkSellpiaReceiptBatchUploadedDto,
  ) {
    return this.sellpiaSync.markReceiptBatchUploaded({
      organizationId,
      userId: user.id,
      batchId,
      note: dto.note,
    });
  }
}
