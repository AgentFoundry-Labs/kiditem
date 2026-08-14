import {
  BadRequestException,
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
  SourcingWingCatalogFinalizeSchema,
  SourcingWingCatalogKeywordSchema,
  SourcingWingCatalogObservationBatchSchema,
  SourcingKeywordSuggestionObservationBatchSchema,
} from '@kiditem/shared/sourcing';
import type { AuthUser } from '../../../../auth/auth.types';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { CurrentUser } from '../../../../auth/decorators/current-user.decorator';
import { SourcingRecommendationService } from '../../../application/service/sourcing-recommendation.service';
import { SourcingWingCatalogIngestService } from '../../../application/service/sourcing-wing-catalog-ingest.service';
import { SourcingKeywordSuggestionService } from '../../../application/service/sourcing-keyword-suggestion.service';
import { SourcingKeywordPreferenceService } from '../../../application/service/sourcing-keyword-preference.service';
import {
  SourcingCoupangObservationDto,
  SourcingKeywordPreferenceDto,
  SourcingKeywordPreferenceParamsDto,
  SourcingRecommendationQueryDto,
} from './dto';

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
    });
  }

  @Post('browser-operations/:runId/coupang-observations')
  ingestBrowserCoupangObservations(
    @Param('runId', new ParseUUIDPipe()) runId: string,
    @Headers('x-operation-attempt-token') rawAttemptToken: string | undefined,
    @Body() rawBody: unknown,
    @CurrentOrganization() organizationId: string,
  ) {
    const batch = parseStrictBody(
      SourcingWingCatalogObservationBatchSchema,
      rawBody,
      'invalid_wing_catalog_observations',
    );
    return this.wingCatalog.ingestBrowserBatch({
      organizationId,
      operationRunId: runId,
      attemptToken: parseAttemptToken(rawAttemptToken),
      batch,
    });
  }

  @Post('browser-operations/:runId/finalize')
  finalizeBrowserOperation(
    @Param('runId', new ParseUUIDPipe()) runId: string,
    @Headers('x-operation-attempt-token') rawAttemptToken: string | undefined,
    @Body() rawBody: unknown,
    @CurrentOrganization() organizationId: string,
  ) {
    const finalization = parseStrictBody(
      SourcingWingCatalogFinalizeSchema,
      rawBody,
      'invalid_wing_catalog_finalization',
    );
    return this.wingCatalog.finalizeBrowserOperation({
      organizationId,
      operationRunId: runId,
      attemptToken: parseAttemptToken(rawAttemptToken),
      finalization,
    });
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

  @Post('browser-operations/:runId/keyword-suggestions')
  ingestBrowserKeywordSuggestions(
    @Param('runId', new ParseUUIDPipe()) runId: string,
    @Headers('x-operation-attempt-token') rawAttemptToken: string | undefined,
    @Body() rawBody: unknown,
    @CurrentOrganization() organizationId: string,
  ) {
    const batch = parseStrictBody(
      SourcingKeywordSuggestionObservationBatchSchema,
      rawBody,
      'invalid_keyword_suggestion_observations',
    );
    return this.keywordSuggestions.ingestBrowserBatch({
      organizationId,
      operationRunId: runId,
      attemptToken: parseAttemptToken(rawAttemptToken),
      batch,
    });
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

const AttemptTokenSchema = z.string().uuid();

function parseAttemptToken(value: string | undefined): string {
  const parsed = AttemptTokenSchema.safeParse(value);
  if (!parsed.success) {
    throw new BadRequestException('invalid_operation_attempt_token');
  }
  return parsed.data;
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
