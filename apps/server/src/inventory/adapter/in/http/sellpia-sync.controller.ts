import {
  BadRequestException,
  Body,
  Controller,
  Inject,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { createHash } from 'node:crypto';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { CurrentUser } from '../../../../auth/decorators/current-user.decorator';
import type { AuthUser } from '../../../../auth/auth.types';
import {
  SELLPIA_SYNC_PORT,
  type SellpiaSyncPort,
} from '../../../application/port/in/stock/sellpia-sync.port';
import { parseSellpiaWorkbook } from '../../../application/service/sellpia-workbook.parser';
import {
  ApproveSellpiaItemDto,
  IgnoreSellpiaItemDto,
  ImportSellpiaWorkbookDto,
} from './dto';

const MAX_UPLOAD_SIZE = 10 * 1024 * 1024;

type UploadedWorkbookFile = {
  buffer: Buffer;
  originalname: string;
};

@Controller('inventory/sellpia-sync')
export class SellpiaSyncController {
  constructor(
    @Inject(SELLPIA_SYNC_PORT)
    private readonly sellpiaSync: SellpiaSyncPort,
  ) {}

  @Post('import')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_SIZE } }))
  importWorkbook(
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: UploadedWorkbookFile | undefined,
    @Body() dto: ImportSellpiaWorkbookDto,
  ) {
    if (!file?.buffer) throw new BadRequestException('Sellpia XLSX file is required');
    const parsed = parseSellpiaWorkbook(file.buffer);
    const fileHash = createHash('sha256').update(file.buffer).digest('hex');

    return this.sellpiaSync.importRows({
      organizationId,
      userId: user.id,
      fileName: file.originalname,
      fileHash,
      effectiveExportedAt: new Date(dto.effectiveExportedAt),
      ...parsed,
    });
  }

  @Post('items/:id/approve')
  approveItem(
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
    @Param('id') itemId: string,
    @Body() dto: ApproveSellpiaItemDto,
  ) {
    return this.sellpiaSync.approveItem({
      organizationId,
      userId: user.id,
      itemId,
      targetCurrentStock: dto.targetCurrentStock,
      reason: dto.reason,
    });
  }

  @Post('items/:id/manual-adjust')
  manualAdjustItem(
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
    @Param('id') itemId: string,
    @Body() dto: ApproveSellpiaItemDto,
  ) {
    return this.sellpiaSync.approveItem({
      organizationId,
      userId: user.id,
      itemId,
      targetCurrentStock: dto.targetCurrentStock,
      reason: dto.reason,
    });
  }

  @Post('items/:id/ignore')
  ignoreItem(
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
    @Param('id') itemId: string,
    @Body() dto: IgnoreSellpiaItemDto,
  ) {
    return this.sellpiaSync.ignoreItem({
      organizationId,
      userId: user.id,
      itemId,
      reason: dto.reason,
    });
  }
}
