import {
  Body,
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
  WING_CATALOG_OPERATION_PORT,
  type WingCatalogOperationPort,
} from '../../../application/port/in/wing-catalog-operation.port';

type UploadedWorkbookFile = {
  buffer: Buffer;
  originalname: string;
};

/**
 * [쿠팡상품정보] 엑셀 업로드 → `channels.wing_catalog_excel` 실행 하나(KID-351). 응답은 `{ operation }`이고,
 * 같은 파일 재업로드·동기화 중 업로드는 실행 계약이 거절한다.
 */
@Controller('channels/accounts/:channelAccountId/catalog-imports/coupang-wing')
export class ChannelCatalogImportController {
  constructor(@Inject(WING_CATALOG_OPERATION_PORT) private readonly catalog: WingCatalogOperationPort) {}

  @Post()
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 20 * 1024 * 1024 } }),
  )
  importWorkbook(
    @Param('channelAccountId', new ParseUUIDPipe()) channelAccountId: string,
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: UploadedWorkbookFile | undefined,
    @Body('observedAt') observedAt?: string,
  ) {
    if (!file?.buffer) {
      throw new KiditemInvalidValueError('VALIDATION_FAILED', { details: { reason: 'catalog_workbook_missing', field: 'file' } });
    }
    return this.catalog.uploadWorkbook({
      organizationId,
      userId: user.id,
      channelAccountId,
      bytes: file.buffer,
      ...(typeof observedAt === 'string' && observedAt !== '' ? { observedAt } : {}),
    });
  }
}
