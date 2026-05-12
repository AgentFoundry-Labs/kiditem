import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { SourcingService } from '../../../application/service/sourcing.service';
import { SourcingPromotionService } from '../../../application/service/sourcing-promotion.service';
import {
  ListExtensionProductsQueryDto,
  PromoteCandidateBodyDto,
  ReceiveExtensionDataDto,
  RejectCandidateBodyDto,
  ScrapeUrlBodyDto,
} from './dto';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { CurrentUser } from '../../../../auth/decorators/current-user.decorator';
import type { AuthUser } from '../../../../auth/auth.types';

@Controller('sourcing')
export class SourcingController {
  constructor(
    private readonly sourcingService: SourcingService,
    private readonly promotionSvc: SourcingPromotionService,
  ) {}

  @Post('extension/product-data')
  async receiveExtensionData(
    @Body() body: ReceiveExtensionDataDto,
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
  ) {
    const flat = { ...body, ...(body.extra ?? {}) };
    return this.sourcingService.receiveExtensionData(flat, organizationId, user.id ?? null);
  }

  @Post('scrape-url')
  async scrapeUrl(
    @Body() body: ScrapeUrlBodyDto,
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.sourcingService.scrapeUrl(body.url.trim(), organizationId, user.id);
  }

  @Get('extension/products')
  listProducts(
    @Query() query: ListExtensionProductsQueryDto,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.sourcingService.listProducts(query, organizationId);
  }

  @Post('candidates/:id/promote')
  async promote(
    @Param('id') id: string,
    @Body() body: PromoteCandidateBodyDto,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.promotionSvc.promote(id, organizationId, body);
  }

  @Post('candidates/:id/reject')
  async reject(
    @Param('id') id: string,
    @Body() body: RejectCandidateBodyDto,
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.promotionSvc.reject(id, organizationId, body, user.id ?? null);
  }

  @Get(':id')
  getProduct(
    @Param('id') id: string,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.sourcingService.getProduct(id, organizationId);
  }
}
