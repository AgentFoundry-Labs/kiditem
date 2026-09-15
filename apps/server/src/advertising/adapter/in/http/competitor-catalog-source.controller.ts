import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
} from '@nestjs/common';
import { z } from 'zod';
import { AdvertisingCompetitorCatalogBatchSchema } from '@kiditem/shared/sourcing';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { CompetitorCatalogSourceAttemptService } from '../../../application/service/competitor-catalog-source-attempt.service';

const AttemptStartSchema = z.discriminatedUnion('target', [
  z.object({ target: z.literal('all') }).strict(),
  z.object({ target: z.literal('rank_enrichment'), excludeCompletedAttemptId: z.string().uuid().optional() }).strict(),
  z.object({
    target: z.literal('seller_id'),
    sellerId: z.string().trim().min(1).max(80).regex(/^[A-Za-z0-9_-]+$/u),
  }).strict(),
]);

const AttemptFailureSchema = z.object({
  code: z.string().trim().min(1).max(100),
  message: z.string().trim().min(1).max(300),
}).strict();

/** Direct HTTP ingress for Advertising's server-owned competitor catalog source. */
@Controller('ads/competitor-catalogs')
export class CompetitorCatalogSourceController {
  constructor(private readonly service: CompetitorCatalogSourceAttemptService) {}

  @Post('attempts')
  beginAttempt(
    @Body() rawBody: unknown,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentOrganization() organizationId: string,
  ) {
    const body = AttemptStartSchema.safeParse(rawBody);
    if (!body.success) throw new BadRequestException('INVALID_COMPETITOR_CATALOG_SCOPE');
    return this.service.beginAttempt({
      organizationId,
      idempotencyKey: headerText(idempotencyKey, 'INVALID_IDEMPOTENCY_KEY'),
      input: body.data,
    });
  }

  @Get('attempts/current')
  readSourceStatus(@CurrentOrganization() organizationId: string) {
    return this.service.readSourceStatus(organizationId);
  }

  @Get('attempts/:attemptId')
  readAttemptControl(
    @Param('attemptId', new ParseUUIDPipe()) attemptId: string,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.service.readAttemptControl({ organizationId, attemptId });
  }

  @Put('attempts/:attemptId')
  submitAttempt(
    @Param('attemptId', new ParseUUIDPipe()) attemptId: string,
    @Headers('x-source-attempt-token') rawAttemptToken: string | undefined,
    @Body() rawBody: unknown,
    @CurrentOrganization() organizationId: string,
  ) {
    const body = AdvertisingCompetitorCatalogBatchSchema.safeParse(rawBody);
    if (!body.success) throw new BadRequestException('INVALID_COMPETITOR_CATALOG_BATCH');
    return this.service.submitAttempt({
      organizationId,
      attemptId,
      attemptToken: attemptToken(rawAttemptToken),
      catalogs: body.data.catalogs,
    });
  }

  @Post('attempts/:attemptId/fail')
  failAttempt(
    @Param('attemptId', new ParseUUIDPipe()) attemptId: string,
    @Headers('x-source-attempt-token') rawAttemptToken: string | undefined,
    @Body() rawBody: unknown,
    @CurrentOrganization() organizationId: string,
  ) {
    const body = AttemptFailureSchema.safeParse(rawBody);
    if (!body.success) throw new BadRequestException('INVALID_COMPETITOR_CATALOG_FAILURE');
    return this.service.failAttempt({
      organizationId,
      attemptId,
      attemptToken: attemptToken(rawAttemptToken),
      ...body.data,
    });
  }

  @Post('attempts/:attemptId/cancel')
  @HttpCode(200)
  cancelAttempt(
    @Param('attemptId', new ParseUUIDPipe()) attemptId: string,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.service.cancelAttempt({ organizationId, attemptId });
  }
}

function attemptToken(value: string | undefined): string {
  const parsed = z.string().uuid().safeParse(value);
  if (!parsed.success) throw new BadRequestException('INVALID_SOURCE_ATTEMPT_TOKEN');
  return parsed.data;
}

function headerText(value: string | undefined, code: string): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > 128) {
    throw new BadRequestException(code);
  }
  return value.trim();
}
