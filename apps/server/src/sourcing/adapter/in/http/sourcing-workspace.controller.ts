import {
  BadRequestException,
  ConflictException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { z } from 'zod';
import {
  SourcingWingCatalogKeywordSchema,
} from '@kiditem/shared/sourcing';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { CurrentUser } from '../../../../auth/decorators/current-user.decorator';
import { SourcingRecommendationService } from '../../../application/service/sourcing-recommendation.service';
import { SourcingWingCatalogIngestService } from '../../../application/service/sourcing-wing-catalog-ingest.service';
import { SourcingKeywordSuggestionService } from '../../../application/service/sourcing-keyword-suggestion.service';
import { SourcingKeywordPreferenceService } from '../../../application/service/sourcing-keyword-preference.service';
import { parseAttemptToken as parseSourceToken, toPublicAttempt, toPublicStatus } from './sourcing-source-attempt-http';
import {
  SourcingCoupangObservationDto,
  SourcingKeywordPreferenceDto,
  SourcingKeywordPreferenceParamsDto,
  SourcingRecommendationQueryDto,
} from './dto';
import type { AuthUser } from '../../../../auth/auth.types';

@Controller('sourcing/workspace')
export class SourcingWorkspaceController {
  constructor(
    private readonly recommendations: SourcingRecommendationService,
    private readonly wingCatalog: SourcingWingCatalogIngestService,
    private readonly keywordSuggestions: SourcingKeywordSuggestionService,
    private readonly keywordPreferences: SourcingKeywordPreferenceService,
  ) {}

  @Get('recommendations')
  listRecommendations(
    @Query() query: SourcingRecommendationQueryDto,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.recommendations.latest({
      organizationId,
      surface: query.surface,
      limit: query.limit,
      cursor: query.cursor,
    });
  }

  @Post('coupang-observations')
  ingestCoupangObservations(
    @Body() body: SourcingCoupangObservationDto,
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.wingCatalog.ingest({
      organizationId,
      actorUserId: user.id,
      idempotencyKey: body.idempotencyKey,
      items: body.items.map((item) => ({
        productId: item.productId,
        itemId: item.itemId ?? null,
        vendorItemId: item.vendorItemId ?? null,
        productName: item.productName,
        sourceKeyword: item.sourceKeyword,
        salePriceKrw: item.salePriceKrw ?? null,
        ratingCount: item.ratingCount ?? null,
        ratingAverage: item.ratingAverage ?? null,
        viewsLast28d: item.viewsLast28d ?? null,
        salesLast28d: item.salesLast28d ?? null,
        capturedAt: item.capturedAt,
      })),
    }).then(toPublicAttempt);
  }

  @Post('recommendations/refresh')
  async refreshWingRecommendations(
    @CurrentOrganization() organizationId: string,
    @Body() body: unknown,
  ) {
    const parsed = parseStrictBody(z.object({ sourceAttemptId: z.string().uuid() }).strict(), body, 'INVALID_SOURCE_ATTEMPT');
    const attempt = await this.wingCatalog.read({ organizationId, attemptId: parsed.sourceAttemptId });
    if (attempt.state !== 'COMPLETE' || !['market_analysis', 'recommendation_validation'].includes(String(attempt.plan.purpose))) {
      throw new ConflictException('WING_RECOMMENDATION_SOURCE_NOT_COMPLETE');
    }
    return this.recommendations.refresh({ organizationId, limit: 50,
      idempotencyKey: `wing-source:${attempt.attemptId}:recommendations` });
  }

  @Get('wing-catalog/current')
  async currentWingCatalog(@CurrentOrganization() organizationId: string) {
    const attempt = await this.wingCatalog.current(organizationId);
    return attempt ? toPublicAttempt(attempt) : null;
  }

  @Post('wing-catalog/attempts')
  beginWingCatalog(
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: unknown,
  ) {
    return this.wingCatalog.begin({ organizationId, requestedByUserId: user.id,
      idempotencyKey: idempotencyKey ?? '', input: body });
  }

  @Get('wing-catalog/attempts/:attemptId')
  readWingCatalog(
    @Param('attemptId', new ParseUUIDPipe({ version: '4' })) attemptId: string,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.wingCatalog.read({ organizationId, attemptId }).then(toPublicAttempt);
  }

  @Post('wing-catalog/attempts/:attemptId/chunks')
  uploadWingCatalog(
    @Param('attemptId', new ParseUUIDPipe({ version: '4' })) attemptId: string,
    @Headers('x-source-attempt-token') token: string | undefined,
    @Body() batch: unknown,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.wingCatalog.upload({ organizationId, attemptId, attemptToken: parseSourceToken(token), batch });
  }

  @Put('wing-catalog/attempts/:attemptId')
  completeWingCatalog(
    @Param('attemptId', new ParseUUIDPipe({ version: '4' })) attemptId: string,
    @Headers('x-source-attempt-token') token: string | undefined,
    @Body() finalization: unknown,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.wingCatalog.complete({ organizationId, attemptId,
      attemptToken: parseSourceToken(token), finalization }).then(toPublicAttempt);
  }

  @Post('wing-catalog/attempts/:attemptId/fail')
  failWingCatalog(
    @Param('attemptId', new ParseUUIDPipe({ version: '4' })) attemptId: string,
    @Headers('x-source-attempt-token') token: string | undefined,
    @Body() body: { code?: unknown; message?: unknown },
    @CurrentOrganization() organizationId: string,
  ) {
    return this.wingCatalog.fail({ organizationId, attemptId, attemptToken: parseSourceToken(token),
      code: typeof body?.code === 'string' ? body.code : '',
      message: typeof body?.message === 'string' ? body.message : '' }).then(toPublicAttempt);
  }

  @Get('wing-catalog')
  getWingCatalogSnapshot(
    @Query('keyword') rawKeyword: string | undefined,
    @CurrentOrganization() organizationId: string,
  ) {
    const keyword = SourcingWingCatalogKeywordSchema.safeParse(rawKeyword);
    if (!keyword.success) {
      throw new BadRequestException('invalid_wing_catalog_keyword');
    }
    return this.wingCatalog.snapshot({
      organizationId,
      keyword: keyword.data,
    });
  }

  @Post('keyword-suggestions/attempts')
  beginKeywordSuggestions(
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() input: unknown,
  ) {
    return this.keywordSuggestions.begin({
      organizationId, requestedByUserId: user.id, idempotencyKey: idempotencyKey ?? '', input,
    });
  }

  @Get('keyword-suggestions/attempts/:attemptId')
  readKeywordSuggestions(
    @Param('attemptId', new ParseUUIDPipe({ version: '4' })) attemptId: string,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.keywordSuggestions.read({ organizationId, attemptId }).then(toPublicAttempt);
  }

  @Get('keyword-suggestions/current')
  keywordSuggestionStatus(
    @Query('keyword') keyword: string,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.keywordSuggestions.status({ organizationId, keyword }).then(toPublicStatus);
  }

  @Put('keyword-suggestions/attempts/:attemptId')
  completeKeywordSuggestions(
    @Param('attemptId', new ParseUUIDPipe({ version: '4' })) attemptId: string,
    @Headers('x-source-attempt-token') token: string | undefined,
    @Body() batch: unknown,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.keywordSuggestions.complete({
      organizationId, attemptId, attemptToken: parseSourceToken(token), batch,
    }).then(toPublicAttempt);
  }

  @Post('keyword-suggestions/attempts/:attemptId/fail')
  failKeywordSuggestions(
    @Param('attemptId', new ParseUUIDPipe({ version: '4' })) attemptId: string,
    @Headers('x-source-attempt-token') token: string | undefined,
    @Body() body: { code?: unknown; message?: unknown },
    @CurrentOrganization() organizationId: string,
  ) {
    return this.keywordSuggestions.fail({
      organizationId, attemptId, attemptToken: parseSourceToken(token),
      code: typeof body?.code === 'string' ? body.code : '',
      message: typeof body?.message === 'string' ? body.message : '',
    }).then(toPublicAttempt);
  }

  @Get('keyword-suggestions')
  getKeywordSuggestionSnapshot(
    @Query('keyword') rawKeyword: string | undefined,
    @CurrentOrganization() organizationId: string,
  ) {
    const keyword = SourcingWingCatalogKeywordSchema.safeParse(rawKeyword);
    if (!keyword.success) {
      throw new BadRequestException('invalid_keyword_suggestion_keyword');
    }
    return this.keywordSuggestions.snapshot({
      organizationId,
      keyword: keyword.data,
    });
  }

  @Get('keyword-preferences')
  listKeywordPreferences(@CurrentOrganization() organizationId: string) {
    return this.keywordPreferences.list(organizationId);
  }

  @Put('keyword-preferences/:keyword')
  saveKeywordPreference(
    @Param() params: SourcingKeywordPreferenceParamsDto,
    @Body() body: SourcingKeywordPreferenceDto,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.keywordPreferences.save({
      organizationId,
      keyword: params.keyword,
      excluded: body.excluded,
      expectedVersion: body.expectedVersion,
    });
  }
}

function parseStrictBody<T>(
  schema: z.ZodType<T>,
  value: unknown,
  errorCode: string,
): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new BadRequestException(errorCode);
  return parsed.data;
}
