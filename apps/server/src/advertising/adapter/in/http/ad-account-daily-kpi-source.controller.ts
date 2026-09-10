import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  NotFoundException,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  AdAccountDailyKpiSourceBeginSchema,
  AdAccountDailyKpiSourceCompleteSchema,
  AdAccountDailyKpiSourceFailSchema,
  AdAccountDailyKpiSourceReceiptWireSchema,
} from '@kiditem/shared/advertising';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import {
  AD_ACCOUNT_DAILY_KPI_READ_PORT,
  AD_ACCOUNT_DAILY_KPI_SOURCE_PORT,
  type AdAccountDailyKpiReadPort,
  type AdAccountDailyKpiSourcePort,
} from '../../../application/port/in/ad-account-daily-kpi-source.port';

@Controller('ads/account-daily-kpis')
export class AdAccountDailyKpiSourceController {
  constructor(
    @Inject(AD_ACCOUNT_DAILY_KPI_SOURCE_PORT)
    private readonly source: AdAccountDailyKpiSourcePort,
    @Inject(AD_ACCOUNT_DAILY_KPI_READ_PORT)
    private readonly read: AdAccountDailyKpiReadPort,
  ) {}

  @Post('attempts')
  beginAttempt(
    @Body() rawBody: unknown,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentOrganization() organizationId: string,
  ) {
    const body = AdAccountDailyKpiSourceBeginSchema.safeParse(rawBody ?? {});
    if (!body.success) throw new BadRequestException('INVALID_ACCOUNT_DAILY_KPI_SCOPE');
    return this.source.beginAttempt({
      organizationId,
      idempotencyKey: headerText(idempotencyKey, 'INVALID_IDEMPOTENCY_KEY'),
      ...(body.data.targetDate ? { targetDate: body.data.targetDate } : {}),
    });
  }

  @Get('source')
  readSourceStatus(@CurrentOrganization() organizationId: string) {
    return this.source.readSourceStatus({ organizationId });
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
    if (sequence < 0) throw new BadRequestException('INVALID_ACCOUNT_DAILY_KPI_RECEIPT');
    const body = AdAccountDailyKpiSourceReceiptWireSchema.safeParse(rawBody);
    if (!body.success) throw new BadRequestException('INVALID_ACCOUNT_DAILY_KPI_RECEIPT');
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
    const body = AdAccountDailyKpiSourceCompleteSchema.safeParse(rawBody);
    if (!body.success) throw new BadRequestException('INVALID_ACCOUNT_DAILY_KPI_MANIFEST');
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
    const body = AdAccountDailyKpiSourceFailSchema.safeParse(rawBody);
    if (!body.success) throw new BadRequestException('INVALID_ACCOUNT_DAILY_KPI_FAILURE');
    return this.source.failAttempt({
      organizationId,
      attemptId,
      attemptToken: uuidHeader(attemptToken),
      ...body.data,
    });
  }

  @Get('published')
  readPublished(
    @CurrentOrganization() organizationId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.read.readPublished({ organizationId, from, to });
  }

  private async requireAttempt<T>(attempt: Promise<T | null>): Promise<T> {
    const value = await attempt;
    if (!value) throw new NotFoundException('AD_ACCOUNT_DAILY_KPI_ATTEMPT_NOT_FOUND');
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
