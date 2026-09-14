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
  ParseUUIDPipe,
  Post,
  Put,
} from '@nestjs/common';
import { z } from 'zod';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import {
  PROFITABILITY_AD_IMPORT_PORT,
  type ProfitabilityAdImportPort,
} from '../../../application/port/in/profitability-ad-import.port';

const CalendarDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const IntegerMetricSchema = z.number().int().nonnegative().max(2_147_483_647);
const ReportCountSchema = z.number().int().nonnegative().max(100_000);
const ResponseBytesSchema = z.number().int().nonnegative().max(50_000_000);
const ReportIdSchema = z.string().trim().min(1).max(128);
const ProviderRowSchema = z.object({
  businessDate: CalendarDateSchema,
  externalOptionId: z.string().trim().min(1).max(100),
  adSpend: IntegerMetricSchema,
  impressions: IntegerMetricSchema,
  clicks: IntegerMetricSchema,
  orders: IntegerMetricSchema,
  conversions: IntegerMetricSchema,
  adRevenue: IntegerMetricSchema,
}).strict();
const SliceUploadSchema = z.object({
  sequence: z.number().int().nonnegative().max(2_147_483_647),
  checksum: z.string().trim().regex(/^[a-f0-9]{64}$/i),
  providerAdvertiserId: z.string().trim().min(1).max(100),
  reportId: ReportIdSchema,
  campaignCount: ReportCountSchema,
  expectedRowCount: ReportCountSchema,
  collectedRowCount: ReportCountSchema,
  responseBytes: ResponseBytesSchema,
  rows: z.array(ProviderRowSchema).max(100_000),
}).strict();
const FailureSchema = z.object({
  code: z.string().trim().min(1).max(100),
  message: z.string().trim().min(1).max(300),
}).strict();
const TokenSchema = z.string().uuid();

@Controller('ads/profitability-imports')
export class ProfitabilityAdImportController {
  constructor(
    @Inject(PROFITABILITY_AD_IMPORT_PORT)
    private readonly service: ProfitabilityAdImportPort,
  ) {}

  @Post()
  begin(
    @CurrentOrganization() organizationId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    return this.service.beginAttempt({
      organizationId,
      idempotencyKey: headerText(idempotencyKey, 'INVALID_IDEMPOTENCY_KEY'),
    });
  }

  @Get('current')
  readSourceStatus(@CurrentOrganization() organizationId: string) {
    return this.service.readSourceStatus({ organizationId });
  }

  @Get(':attemptId')
  async readAttemptControl(
    @CurrentOrganization() organizationId: string,
    @Param('attemptId', new ParseUUIDPipe()) attemptId: string,
  ) {
    const plan = await this.service.readAttemptControl({ organizationId, attemptId });
    if (!plan) throw new NotFoundException('SOURCE_ATTEMPT_NOT_FOUND');
    return plan;
  }

  @Put(':attemptId/slices/:sliceId')
  uploadSlice(
    @CurrentOrganization() organizationId: string,
    @Param('attemptId', new ParseUUIDPipe()) attemptId: string,
    @Param('sliceId') sliceId: string,
    @Headers('x-source-attempt-token') rawAttemptToken: string | undefined,
    @Body() rawBody: unknown,
  ) {
    const parsed = SliceUploadSchema.safeParse(rawBody);
    if (!parsed.success) throw new BadRequestException('INVALID_PROFITABILITY_SLICE');
    return this.service.uploadSlice({
      organizationId,
      attemptId,
      attemptToken: attemptToken(rawAttemptToken),
      sliceId,
      ...parsed.data,
    });
  }

  @Post(':attemptId/complete')
  complete(
    @CurrentOrganization() organizationId: string,
    @Param('attemptId', new ParseUUIDPipe()) attemptId: string,
    @Headers('x-source-attempt-token') rawAttemptToken: string | undefined,
  ) {
    return this.service.finalizeAttempt({
      organizationId,
      attemptId,
      attemptToken: attemptToken(rawAttemptToken),
    });
  }

  @Post(':attemptId/fail')
  fail(
    @CurrentOrganization() organizationId: string,
    @Param('attemptId', new ParseUUIDPipe()) attemptId: string,
    @Headers('x-source-attempt-token') rawAttemptToken: string | undefined,
    @Body() rawBody: unknown,
  ) {
    const parsed = FailureSchema.safeParse(rawBody);
    if (!parsed.success) throw new BadRequestException('INVALID_PROFITABILITY_FAILURE');
    return this.service.failAttempt({
      organizationId,
      attemptId,
      attemptToken: attemptToken(rawAttemptToken),
      ...parsed.data,
    });
  }

  @Post(':attemptId/cancel')
  @HttpCode(200)
  cancel(
    @CurrentOrganization() organizationId: string,
    @Param('attemptId', new ParseUUIDPipe()) attemptId: string,
  ) {
    return this.service.cancelAttempt({ organizationId, attemptId });
  }
}

function attemptToken(value: string | undefined): string {
  const parsed = TokenSchema.safeParse(value);
  if (!parsed.success) throw new BadRequestException('INVALID_SOURCE_ATTEMPT_TOKEN');
  return parsed.data;
}

function headerText(value: string | undefined, code: string): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > 128) {
    throw new BadRequestException(code);
  }
  return value.trim();
}
