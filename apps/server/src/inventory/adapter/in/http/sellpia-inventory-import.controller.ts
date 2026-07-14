import { createHash } from 'node:crypto';
import {
  BadRequestException,
  Controller,
  Inject,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { SELLPIA_WORKBOOK_FORMAT_LABEL } from '@kiditem/shared/inventory';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { CurrentUser } from '../../../../auth/decorators/current-user.decorator';
import {
  SELLPIA_INVENTORY_IMPORT_PORT,
  type SellpiaInventoryImportPort,
} from '../../../application/port/in/stock/sellpia-inventory-import.port';
import { parseSellpiaInventoryWorkbook } from '../../../application/service/sellpia-inventory-workbook.parser';
import type { AuthUser } from '../../../../auth/auth.types';

type UploadedWorkbookFile = {
  buffer: Buffer;
  originalname: string;
};

@Controller('inventory/sellpia-sync')
export class SellpiaInventoryImportController {
  constructor(
    @Inject(SELLPIA_INVENTORY_IMPORT_PORT)
    private readonly importer: SellpiaInventoryImportPort,
  ) {}

  @Post('import')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  importWorkbook(
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: UploadedWorkbookFile | undefined,
  ) {
    if (!file?.buffer) {
      throw new BadRequestException(
        `Sellpia ${SELLPIA_WORKBOOK_FORMAT_LABEL} file is required`,
      );
    }
    const parsed = parseSellpiaInventoryWorkbook(file.buffer);
    const fileHash = createHash('sha256').update(file.buffer).digest('hex');
    return this.importer.importInventory({
      organizationId,
      userId: user.id,
      fileName: file.originalname,
      fileHash,
      ...parsed,
    });
  }
}
