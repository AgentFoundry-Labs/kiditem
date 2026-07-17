import {
  BadRequestException,
  Body,
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
import type { AuthUser } from '../../../../auth/auth.types';
import { SellpiaInventoryImportDto } from './dto';

type UploadedWorkbookFile = {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
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
    @Body() dto: SellpiaInventoryImportDto,
    @UploadedFile() file: UploadedWorkbookFile | undefined,
  ) {
    if (!file?.buffer) {
      throw new BadRequestException(
        `Sellpia ${SELLPIA_WORKBOOK_FORMAT_LABEL} file is required`,
      );
    }
    return this.importer.importInventory({
      organizationId,
      userId: user.id,
      file: {
        buffer: file.buffer,
        fileName: file.originalname,
        mimeType: file.mimetype,
      },
      execution: dto.kind === 'browser'
        ? {
            kind: 'browser',
            claimToken: dto.claimToken!,
            activeGeneration: dto.activeGeneration!,
            trigger: dto.trigger!,
            sourceOrigin: dto.sourceOrigin!,
            sourceAccountKey: dto.sourceAccountKey!,
          }
        : {
            kind: 'manual',
            manualFreshExportConfirmed: dto.manualFreshExportConfirmed!,
          },
    });
  }
}
