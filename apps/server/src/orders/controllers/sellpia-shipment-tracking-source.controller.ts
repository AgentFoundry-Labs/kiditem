import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentOrganization } from '../../auth/decorators/current-organization.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import {
  SELLPIA_SHIPMENT_TRACKING_SOURCE_PORT,
  type SellpiaShipmentTrackingSourcePort,
} from '../application/port/in/sellpia-shipment-tracking-source.port';
import type { Response } from 'express';
import type { AuthUser } from '../../auth/auth.types';

type UploadedArtifact = {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
};

@Controller('orders/sellpia-shipment-tracking')
export class SellpiaShipmentTrackingSourceController {
  constructor(
    @Inject(SELLPIA_SHIPMENT_TRACKING_SOURCE_PORT)
    private readonly source: SellpiaShipmentTrackingSourcePort,
  ) {}

  @Post('attempts')
  begin(
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: unknown,
  ) {
    const input = parseBeginBody(body);
    if (!idempotencyKey?.trim() || idempotencyKey.length > 128) {
      throw new BadRequestException('INVALID_SELLPIA_SHIPMENT_TRACKING_IDEMPOTENCY_KEY');
    }
    return this.source.beginAttempt({
      organizationId,
      userId: user.id,
      idempotencyKey,
      ...input,
    });
  }

  @Get('attempts/:attemptId')
  async read(
    @CurrentOrganization() organizationId: string,
    @Param('attemptId', ParseUUIDPipe) attemptId: string,
  ) {
    const attempt = await this.source.readAttempt({ organizationId, attemptId });
    if (!attempt) throw new NotFoundException('SELLPIA_SHIPMENT_TRACKING_ATTEMPT_NOT_FOUND');
    return attempt;
  }

  @Get('attempts/:attemptId/control')
  async readControl(
    @CurrentOrganization() organizationId: string,
    @Param('attemptId', ParseUUIDPipe) attemptId: string,
  ) {
    const attempt = await this.source.readAttemptControl({ organizationId, attemptId });
    if (!attempt) throw new NotFoundException('SELLPIA_SHIPMENT_TRACKING_ATTEMPT_NOT_FOUND');
    return attempt;
  }

  @Post('attempts/:attemptId/complete')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  complete(
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
    @Param('attemptId', ParseUUIDPipe) attemptId: string,
    @Headers('x-source-attempt-token') attemptToken: string | undefined,
    @UploadedFile() file: UploadedArtifact | undefined,
  ) {
    if (!attemptToken?.trim()) {
      throw new BadRequestException('INVALID_SELLPIA_SHIPMENT_TRACKING_ATTEMPT_TOKEN');
    }
    if (!file?.buffer) {
      throw new BadRequestException('Sellpia shipment tracking JSON is required');
    }
    return this.source.completeAttempt({
      organizationId,
      userId: user.id,
      attemptId,
      attemptToken,
      source: {
        bytes: file.buffer,
        fileName: file.originalname,
        contentType: file.mimetype || 'application/json',
      },
    });
  }

  @Post('attempts/:attemptId/fail')
  fail(
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
    @Param('attemptId', ParseUUIDPipe) attemptId: string,
    @Headers('x-source-attempt-token') attemptToken: string | undefined,
    @Body() body: unknown,
  ) {
    const input = parseFailureBody(body);
    if (!attemptToken?.trim()) {
      throw new BadRequestException('INVALID_SELLPIA_SHIPMENT_TRACKING_ATTEMPT_TOKEN');
    }
    return this.source.failAttempt({
      organizationId,
      userId: user.id,
      attemptId,
      attemptToken,
      ...input,
    });
  }

  @Get('attempts/:attemptId/source')
  async readSource(
    @CurrentOrganization() organizationId: string,
    @Param('attemptId', ParseUUIDPipe) attemptId: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const source = await this.source.readSourceDownload({ organizationId, attemptId });
    setDownloadHeaders(response, source.fileName, source.contentType);
    return new StreamableFile(source.bytes);
  }
}

function parseBeginBody(value: unknown): { startDate: string; endDate: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new BadRequestException('INVALID_SELLPIA_SHIPMENT_TRACKING_DATE_RANGE');
  }
  const body = value as Record<string, unknown>;
  const startDate = text(body.startDate);
  const endDate = text(body.endDate);
  if (!startDate || !endDate || !/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    throw new BadRequestException('INVALID_SELLPIA_SHIPMENT_TRACKING_DATE_RANGE');
  }
  if (startDate !== endDate) {
    throw new BadRequestException('INVALID_SELLPIA_SHIPMENT_TRACKING_DATE_RANGE');
  }
  return { startDate, endDate };
}

function parseFailureBody(value: unknown): { errorCode: string; errorMessage: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new BadRequestException('INVALID_SELLPIA_SHIPMENT_TRACKING_FAILURE');
  }
  const body = value as Record<string, unknown>;
  const errorCode = text(body.errorCode);
  const errorMessage = text(body.errorMessage);
  if (!errorCode || !errorMessage || errorCode.length > 100 || errorMessage.length > 500) {
    throw new BadRequestException('INVALID_SELLPIA_SHIPMENT_TRACKING_FAILURE');
  }
  return { errorCode, errorMessage };
}

function text(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized || null;
}

function setDownloadHeaders(
  response: Response,
  fileName: string | null,
  contentType: string,
): void {
  if (fileName) {
    const asciiFallback = fileName.replace(/[^\x20-\x7E]/g, '_');
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    );
  }
  response.setHeader('Content-Type', contentType);
  response.setHeader('Cache-Control', 'private, no-store');
}
