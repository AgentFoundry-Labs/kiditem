import {
  BadRequestException,
  ConflictException,
  Body,
  Controller,
  Get,
  Param,
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
import { toPublicAttempt } from './sourcing-source-attempt-http';
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
    // 끝난 Wing 검색 소싱 실행(KID-360)의 발행이 시장분석·추천 검증 용도일 때만 추천을 다시 계산한다.
    const parsed = parseStrictBody(z.object({ sourceOperationId: z.string().uuid() }).strict(), body, 'INVALID_SOURCE_ATTEMPT');
    const purpose = await this.wingCatalog.publishedPurpose({ organizationId, operationId: parsed.sourceOperationId });
    if (!purpose || !['market_analysis', 'recommendation_validation'].includes(purpose)) {
      throw new ConflictException('WING_RECOMMENDATION_SOURCE_NOT_COMPLETE');
    }
    return this.recommendations.refresh({ organizationId, limit: 50,
      idempotencyKey: `wing-source:${parsed.sourceOperationId}:recommendations` });
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
