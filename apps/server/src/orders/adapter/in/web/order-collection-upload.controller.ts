import { Body, Controller, Param, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { KiditemInvalidValueError } from '@kiditem/shared/errors';
import type { OperationView } from '@kiditem/shared/operation';
import type { AuthUser } from '../../../../auth/auth.types';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { CurrentUser } from '../../../../auth/decorators/current-user.decorator';
import type { MulterFile } from '../../../../common/types';
import { MallOrdersUploadService } from '../../../application/service/mall-orders-upload.service';

/** 옛 업로드 변환 라우트와 같은 상한. */
const MAX_UPLOAD_SIZE = 10 * 1024 * 1024;

/**
 * 수동 엑셀 업로드 → `orders.mall_orders` 실행 하나(KID-380 T4). 응답은 `{ operation }`(끝난 실행)이고, 화면은 그 id로
 * 기다린 뒤 몰 변환 라우트에 본문 `operationId`로 셀피아 파일을 받는다. 옛 attempt 업로드는 없다.
 */
@Controller('orders/collection/malls/:mallKey/upload')
export class OrderCollectionUploadController {
  constructor(private readonly uploads: MallOrdersUploadService) {}

  @Post()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_SIZE } }))
  upload(
    @Param('mallKey') mallKey: string,
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: MulterFile | undefined,
    @Body('password') password: unknown,
  ): Promise<{ operation: OperationView }> {
    if (!file?.buffer) {
      throw new KiditemInvalidValueError('VALIDATION_FAILED', { details: { reason: 'upload_file_missing', field: 'file' } });
    }
    return this.uploads.upload({
      organizationId,
      userId: user.id,
      mallKey,
      file,
      ...(typeof password === 'string' && password.trim() ? { password: password.trim() } : {}),
    });
  }
}
