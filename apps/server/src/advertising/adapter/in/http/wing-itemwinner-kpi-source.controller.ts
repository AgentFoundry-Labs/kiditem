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
  Query,
} from '@nestjs/common';
import { z } from 'zod';
import { WingItemwinnerSourceStatusSchema } from '@kiditem/shared/advertising';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import {
  WING_ITEMWINNER_KPI_READ_PORT,
  WING_ITEMWINNER_KPI_SOURCE_PORT,
  type WingItemwinnerKpiReadPort,
  type WingItemwinnerKpiSourcePort,
} from '../../../application/port/in/wing-itemwinner-kpi-source.port';

// The owner derives the Wing page; a start names at most the account.
const BeginSchema = z
  .object({
    channelAccountId: z.string().uuid().optional(),
  })
  .strict();

// Deliberately excludes normalized rows/counts. The owner computes those from
// the raw current-page data inside the publication transaction.
const CaptureSchema = z
  .object({
    providerVendorId: z.string().trim().min(1).max(128).nullable().optional(),
    observedAt: z.string().datetime({ offset: true }),
    data: z.array(z.record(z.string(), z.unknown())).max(100_000),
    kpis: z.record(z.string(), z.unknown()),
    url: z.string().url().max(2_048),
    title: z.string().max(500).optional(),
    timestamp: z.string().datetime({ offset: true }).optional(),
  })
  .strict();

const FailureSchema = z
  .object({
    code: z.string().trim().min(1).max(100),
    message: z.string().trim().min(1).max(300),
  })
  .strict();

@Controller('ads/wing-itemwinner')
export class WingItemwinnerKpiSourceController {
  constructor(
    @Inject(WING_ITEMWINNER_KPI_SOURCE_PORT)
    private readonly source: WingItemwinnerKpiSourcePort,
    @Inject(WING_ITEMWINNER_KPI_READ_PORT)
    private readonly read: WingItemwinnerKpiReadPort,
  ) {}

  @Post('attempts')
  begin(
    @CurrentOrganization() organizationId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() rawBody: unknown,
  ) {
    const body = BeginSchema.safeParse(rawBody ?? {});
    if (!body.success) {
      throw new BadRequestException('INVALID_WING_ITEMWINNER_ATTEMPT');
    }
    return this.source.begin({
      organizationId,
      idempotencyKey: headerText(idempotencyKey, 'INVALID_IDEMPOTENCY_KEY'),
      channelAccountId: body.data.channelAccountId,
    });
  }

  @Get('source')
  async sourceStatus(
    @CurrentOrganization() organizationId: string,
    @Query('channelAccountId') channelAccountId?: string,
  ) {
    if (channelAccountId && !z.string().uuid().safeParse(channelAccountId).success) {
      throw new BadRequestException('INVALID_COUPANG_ACCOUNT');
    }
    return WingItemwinnerSourceStatusSchema.parse(
      await this.read.readSourceStatus({ organizationId, channelAccountId }),
    );
  }

  @Get('published')
  published(@CurrentOrganization() organizationId: string) {
    return this.read.readPublished({ organizationId });
  }

  @Get('attempts/:attemptId')
  async readAttempt(
    @CurrentOrganization() organizationId: string,
    @Param('attemptId', new ParseUUIDPipe()) attemptId: string,
  ) {
    const attempt = await this.source.read({ organizationId, attemptId });
    if (!attempt) throw new NotFoundException('WING_ITEMWINNER_ATTEMPT_NOT_FOUND');
    return attempt;
  }

  @Post('attempts/:attemptId/complete')
  complete(
    @CurrentOrganization() organizationId: string,
    @Param('attemptId', new ParseUUIDPipe()) attemptId: string,
    @Headers('x-source-attempt-token') attemptToken: string | undefined,
    @Body() rawBody: unknown,
  ) {
    const body = CaptureSchema.safeParse(rawBody);
    if (!body.success) throw new BadRequestException('INVALID_WING_ITEMWINNER_CAPTURE');
    return this.source.complete({
      organizationId,
      attemptId,
      attemptToken: uuidHeader(attemptToken),
      capture: body.data,
    });
  }

  @Post('attempts/:attemptId/fail')
  fail(
    @CurrentOrganization() organizationId: string,
    @Param('attemptId', new ParseUUIDPipe()) attemptId: string,
    @Headers('x-source-attempt-token') attemptToken: string | undefined,
    @Body() rawBody: unknown,
  ) {
    const body = FailureSchema.safeParse(rawBody);
    if (!body.success) throw new BadRequestException('INVALID_WING_ITEMWINNER_FAILURE');
    return this.source.fail({
      organizationId,
      attemptId,
      attemptToken: uuidHeader(attemptToken),
      ...body.data,
    });
  }

  @Post('attempts/:attemptId/cancel')
  @HttpCode(200)
  cancel(
    @CurrentOrganization() organizationId: string,
    @Param('attemptId', new ParseUUIDPipe()) attemptId: string,
  ) {
    return this.source.cancel({ organizationId, attemptId });
  }
}

function headerText(value: string | undefined, code: string): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > 128) {
    throw new BadRequestException(code);
  }
  return value.trim();
}

function uuidHeader(value: string | undefined): string {
  const parsed = z.string().uuid().safeParse(value);
  if (!parsed.success) throw new BadRequestException('INVALID_SOURCE_ATTEMPT_TOKEN');
  return parsed.data;
}
