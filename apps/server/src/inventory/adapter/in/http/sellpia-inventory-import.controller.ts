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
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { CurrentUser } from '../../../../auth/decorators/current-user.decorator';
import {
  SELLPIA_INVENTORY_IMPORT_PORT,
  type SellpiaInventoryImportPort,
} from '../../../application/port/in/stock/sellpia-inventory-import.port';
import { SellpiaInventoryImportDto } from './dto';
import type { AuthUser } from '../../../../auth/auth.types';

type UploadedInventoryArtifact = {
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
  importArtifact(
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: SellpiaInventoryImportDto,
    @UploadedFile() file: UploadedInventoryArtifact | undefined,
  ) {
    if (!file?.buffer) {
      throw new BadRequestException(
        'Sellpia inventory snapshot JSON or XLS/XLSX/CSV file is required',
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
