import { createHash } from 'node:crypto';
import {
  BadRequestException,
  Controller,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { AuthUser } from '../../../../auth/auth.types';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { CurrentUser } from '../../../../auth/decorators/current-user.decorator';
import {
  CHANNEL_CATALOG_IMPORT_PORT,
  type ChannelCatalogImportPort,
} from '../../../application/port/in/channel-catalog-import.port';

type UploadedWorkbookFile = {
  buffer: Buffer;
  originalname: string;
};

@Controller('channels/accounts/:channelAccountId/catalog-imports/coupang-wing')
export class ChannelCatalogImportController {
  constructor(
    @Inject(CHANNEL_CATALOG_IMPORT_PORT)
    private readonly importer: ChannelCatalogImportPort,
  ) {}

  @Post()
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 20 * 1024 * 1024 } }),
  )
  importWorkbook(
    @Param('channelAccountId', new ParseUUIDPipe()) channelAccountId: string,
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: UploadedWorkbookFile | undefined,
  ) {
    if (!file?.buffer) {
      throw new BadRequestException('Coupang Wing workbook file is required');
    }
    const fileHash = createHash('sha256').update(file.buffer).digest('hex');
    return this.importer.importCoupangWing({
      organizationId,
      userId: user.id,
      channelAccountId,
      fileName: file.originalname,
      fileHash,
      bytes: file.buffer,
    });
  }
}
