import { UseFilters } from '@nestjs/common';
import { ChannelBusinessExceptionFilter } from './channel-business-exception.filter';
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
  ROCKET_SELLPIA_MATCHING_CSV_IMPORT_PORT,
  type RocketSellpiaMatchingCsvImportPort,
} from '../../../application/port/in/rocket-sellpia-matching-csv-import.port';

type UploadedCsvFile = {
  buffer: Buffer;
  originalname: string;
};

@UseFilters(ChannelBusinessExceptionFilter)
@Controller('channels/accounts/:channelAccountId/catalog-imports/coupang-rocket-matching')
export class RocketSellpiaMatchingCsvImportController {
  constructor(
    @Inject(ROCKET_SELLPIA_MATCHING_CSV_IMPORT_PORT)
    private readonly importer: RocketSellpiaMatchingCsvImportPort,
  ) {}

  @Post()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 20 * 1024 * 1024 } }))
  importCsv(
    @Param('channelAccountId', new ParseUUIDPipe()) channelAccountId: string,
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: UploadedCsvFile | undefined,
  ) {
    if (!file?.buffer) {
      throw new BadRequestException('Rocket-Sellpia matching CSV file is required');
    }
    const fileHash = createHash('sha256').update(file.buffer).digest('hex');
    return this.importer.importMatchingCsv({
      organizationId,
      userId: user.id,
      channelAccountId,
      fileName: file.originalname,
      fileHash,
      bytes: file.buffer,
    });
  }
}
