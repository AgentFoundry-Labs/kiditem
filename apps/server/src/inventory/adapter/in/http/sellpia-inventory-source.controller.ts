import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
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
import {
  BeginSellpiaInventorySourceAttemptDto,
  CompleteSellpiaInventorySourceAttemptDto,
  FailSellpiaInventorySourceAttemptDto,
} from './dto';
import type { AuthUser } from '../../../../auth/auth.types';

type UploadedInventoryArtifact = {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
};

@Controller('inventory/sellpia-source')
export class SellpiaInventorySourceController {
  constructor(
    @Inject(SELLPIA_INVENTORY_IMPORT_PORT)
    private readonly owner: SellpiaInventoryImportPort,
  ) {}

  @Post('attempts')
  begin(
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: BeginSellpiaInventorySourceAttemptDto,
  ) {
    if (!idempotencyKey?.trim() || idempotencyKey.length > 128) {
      throw new BadRequestException('INVALID_SELLPIA_INVENTORY_BEGIN');
    }
    return this.owner.beginAttempt({
      organizationId,
      userId: user.id,
      idempotencyKey,
      scope: dto.scope,
      trigger: dto.trigger,
    });
  }

  @Get('attempts/:attemptId')
  read(
    @CurrentOrganization() organizationId: string,
    @Param('attemptId', ParseUUIDPipe) attemptId: string,
  ) {
    return this.owner.readAttempt({ organizationId, attemptId });
  }

  @Post('attempts/:attemptId/complete')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  complete(
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
    @Param('attemptId', ParseUUIDPipe) attemptId: string,
    @Headers('x-source-attempt-token') attemptToken: string | undefined,
    @Body() dto: CompleteSellpiaInventorySourceAttemptDto,
    @UploadedFile() file: UploadedInventoryArtifact | undefined,
  ) {
    if (!attemptToken?.trim()) {
      throw new BadRequestException('INVALID_SELLPIA_INVENTORY_ATTEMPT_TOKEN');
    }
    if (!file?.buffer) {
      throw new BadRequestException(
        'Sellpia inventory snapshot JSON or XLS/XLSX/CSV file is required',
      );
    }
    return this.owner.completeAttempt({
      organizationId,
      userId: user.id,
      attemptId,
      attemptToken,
      file: {
        buffer: file.buffer,
        fileName: file.originalname,
        mimeType: file.mimetype,
      },
      manualFreshExportConfirmed: dto?.manualFreshExportConfirmed,
    });
  }

  @Post('attempts/:attemptId/fail')
  fail(
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
    @Param('attemptId', ParseUUIDPipe) attemptId: string,
    @Headers('x-source-attempt-token') attemptToken: string | undefined,
    @Body() dto: FailSellpiaInventorySourceAttemptDto,
  ) {
    if (!attemptToken?.trim()) {
      throw new BadRequestException('INVALID_SELLPIA_INVENTORY_ATTEMPT_TOKEN');
    }
    return this.owner.failAttempt({
      organizationId,
      userId: user.id,
      attemptId,
      attemptToken,
      errorCode: dto.errorCode,
      errorMessage: dto.errorMessage,
    });
  }

  @Post('attempts/:attemptId/cancel')
  @HttpCode(200)
  cancel(
    @CurrentOrganization() organizationId: string,
    @Param('attemptId', ParseUUIDPipe) attemptId: string,
  ) {
    return this.owner.cancelAttempt({ organizationId, attemptId });
  }
}
