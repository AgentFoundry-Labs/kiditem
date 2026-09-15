import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { z } from 'zod';
import {
  AdTrafficSourceBeginSchema,
  AdTrafficSourceCompleteSchema,
  AdTrafficSourceFailureSchema,
  AdTrafficSourceReceiptInputSchema,
} from '@kiditem/shared/advertising';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import {
  AD_TRAFFIC_READ_PORT,
  AD_TRAFFIC_SOURCE_PORT,
  type AdTrafficReadPort,
  type AdTrafficSourcePort,
} from '../../../application/port/in/ad-traffic-source.port';

@Controller('ads/traffic')
export class AdTrafficSourceController {
  constructor(
    @Inject(AD_TRAFFIC_SOURCE_PORT)
    private readonly source: AdTrafficSourcePort,
    @Inject(AD_TRAFFIC_READ_PORT)
    private readonly read: AdTrafficReadPort,
  ) {}

  @Post('attempts')
  beginAttempt(
    @Body() rawBody: unknown,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentOrganization() organizationId: string,
  ) {
    const body = AdTrafficSourceBeginSchema.safeParse(rawBody ?? {});
    if (!body.success) {
      // The start schema's only custom rule is the 92-day range cap. When that
      // rule is the only issue, the range is too long, the code the owner gives
      // a range with a defaulted date; any other issue, alone or beside the
      // cap, is a malformed scope.
      const tooLong = body.error.issues.every((issue) => issue.code === 'custom');
      throw new BadRequestException(tooLong ? 'TRAFFIC_RANGE_TOO_LONG' : 'INVALID_TRAFFIC_SCOPE');
    }
    return this.source.beginAttempt({
      organizationId,
      idempotencyKey: headerText(idempotencyKey, 'INVALID_IDEMPOTENCY_KEY'),
      request: body.data,
    });
  }

  @Get('source')
  readSourceStatus(
    @CurrentOrganization() organizationId: string,
    @Query('channelAccountId') channelAccountId?: string,
  ) {
    if (channelAccountId && !z.string().uuid().safeParse(channelAccountId).success) {
      throw new BadRequestException('INVALID_COUPANG_ACCOUNT');
    }
    return this.source.readSourceStatus({ organizationId, channelAccountId });
  }

  @Get('published')
  readPublished(
    @CurrentOrganization() organizationId: string,
    @Query('channelAccountId') channelAccountId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    if (channelAccountId && !z.string().uuid().safeParse(channelAccountId).success) {
      throw new BadRequestException('INVALID_COUPANG_ACCOUNT');
    }
    return this.read.readPublished({ organizationId, channelAccountId, from, to });
  }

  @Get('attempts/:attemptId')
  readAttempt(
    @CurrentOrganization() organizationId: string,
    @Param('attemptId', new ParseUUIDPipe()) attemptId: string,
  ) {
    return this.requireAttempt(this.source.readAttempt({ organizationId, attemptId }));
  }

  @Get('attempts/:attemptId/control')
  readAttemptControl(
    @CurrentOrganization() organizationId: string,
    @Param('attemptId', new ParseUUIDPipe()) attemptId: string,
  ) {
    return this.requireAttempt(this.source.readAttemptControl({ organizationId, attemptId }));
  }

  @Put('attempts/:attemptId/receipts/:sequence')
  uploadReceipt(
    @CurrentOrganization() organizationId: string,
    @Param('attemptId', new ParseUUIDPipe()) attemptId: string,
    @Param('sequence', ParseIntPipe) sequence: number,
    @Headers('x-source-attempt-token') attemptToken: string | undefined,
    @Body() rawBody: unknown,
  ) {
    if (sequence < 0) throw new BadRequestException('INVALID_TRAFFIC_RECEIPT');
    const body = AdTrafficSourceReceiptInputSchema.safeParse(rawBody);
    if (!body.success) throw new BadRequestException('INVALID_TRAFFIC_RECEIPT');
    return this.source.uploadReceipt({
      organizationId,
      attemptId,
      attemptToken: uuidHeader(attemptToken),
      sequence,
      receipt: body.data,
    });
  }

  @Post('attempts/:attemptId/complete')
  complete(
    @CurrentOrganization() organizationId: string,
    @Param('attemptId', new ParseUUIDPipe()) attemptId: string,
    @Headers('x-source-attempt-token') attemptToken: string | undefined,
    @Body() rawBody: unknown,
  ) {
    const body = AdTrafficSourceCompleteSchema.safeParse(rawBody);
    if (!body.success) throw new BadRequestException('INVALID_TRAFFIC_MANIFEST');
    return this.source.finalizeAttempt({
      organizationId,
      attemptId,
      attemptToken: uuidHeader(attemptToken),
      manifestChecksum: body.data.manifestChecksum,
    });
  }

  @Post('attempts/:attemptId/fail')
  fail(
    @CurrentOrganization() organizationId: string,
    @Param('attemptId', new ParseUUIDPipe()) attemptId: string,
    @Headers('x-source-attempt-token') attemptToken: string | undefined,
    @Body() rawBody: unknown,
  ) {
    const body = AdTrafficSourceFailureSchema.safeParse(rawBody);
    if (!body.success) throw new BadRequestException('INVALID_TRAFFIC_FAILURE');
    return this.source.failAttempt({
      organizationId,
      attemptId,
      attemptToken: uuidHeader(attemptToken),
      ...body.data,
    });
  }

  @Post('attempts/:attemptId/cancel')
  @HttpCode(200)
  cancelAttempt(
    @CurrentOrganization() organizationId: string,
    @Param('attemptId', new ParseUUIDPipe()) attemptId: string,
  ) {
    return this.source.cancelAttempt({ organizationId, attemptId });
  }

  private async requireAttempt<T>(attempt: Promise<T | null>): Promise<T> {
    const value = await attempt;
    if (!value) throw new NotFoundException('AD_TRAFFIC_ATTEMPT_NOT_FOUND');
    return value;
  }
}

function headerText(value: string | undefined, code: string): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > 128) {
    throw new BadRequestException(code);
  }
  return value.trim();
}

function uuidHeader(value: string | undefined): string {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (typeof value !== 'string' || !uuid.test(value)) {
    throw new BadRequestException('INVALID_SOURCE_ATTEMPT_TOKEN');
  }
  return value;
}
