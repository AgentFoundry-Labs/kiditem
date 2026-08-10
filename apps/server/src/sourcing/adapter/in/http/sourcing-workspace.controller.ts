import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import type { AuthUser } from '../../../../auth/auth.types';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { CurrentUser } from '../../../../auth/decorators/current-user.decorator';
import { SourcingRecommendationService } from '../../../application/service/sourcing-recommendation.service';
import { SourcingWingCatalogIngestService } from '../../../application/service/sourcing-wing-catalog-ingest.service';
import {
  SourcingCoupangObservationDto,
  SourcingRecommendationQueryDto,
} from './dto';

@Controller('sourcing/workspace')
export class SourcingWorkspaceController {
  constructor(
    private readonly recommendations: SourcingRecommendationService,
    private readonly wingCatalog: SourcingWingCatalogIngestService,
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

  @Post('recommendations/refresh')
  refreshRecommendations(@CurrentOrganization() organizationId: string) {
    return this.recommendations.refresh({ organizationId, limit: 50 });
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
}
