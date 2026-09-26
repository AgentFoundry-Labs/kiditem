import {
  Controller,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { KiditemInvalidValueError } from '@kiditem/shared/errors';
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

/**
 * 로켓-셀피아 매칭 CSV 업로드 → `channels.rocket_matching_csv` 실행 하나(KID-363). 응답은 `{ operation }`이고,
 * 같은 파일 재업로드·같은 계정의 진행 중 실행은 실행 계약이 거절한다.
 */
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
      throw new KiditemInvalidValueError('VALIDATION_FAILED', { details: { reason: 'matching_csv_missing', field: 'file' } });
    }
    return this.importer.importMatchingCsv({
      organizationId,
      userId: user.id,
      channelAccountId,
      fileName: file.originalname,
      bytes: file.buffer,
    });
  }
}
