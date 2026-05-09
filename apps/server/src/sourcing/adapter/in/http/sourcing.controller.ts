import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { SourcingService } from '../../../application/service/sourcing.service';
import {
  GenerateDetailPageBodyDto,
  ListExtensionProductsQueryDto,
  ReceiveExtensionDataDto,
  ScrapeUrlBodyDto,
} from './dto';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { CurrentUser } from '../../../../auth/decorators/current-user.decorator';
import type { AuthUser } from '../../../../auth/auth.types';

@Controller('sourcing')
export class SourcingController {
  constructor(
    private readonly sourcingService: SourcingService,
  ) {}

  @Post('extension/product-data')
  async receiveExtensionData(
    @Body() body: ReceiveExtensionDataDto,
    @CurrentOrganization() organizationId: string,
  ) {
    // DTO 의 known field + extra escape hatch 를 평탄화. service 는 known
    // field 는 DTO 타입에서, vendor-specific 키는 extra 에서 읽는다.
    const flat = { ...body, ...(body.extra ?? {}) };
    return this.sourcingService.receiveExtensionData(flat, organizationId);
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

  @Get(':id')
  getProduct(
    @Param('id') id: string,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.sourcingService.getProduct(id, organizationId);
  }

  @Post(':id/generate')
  generateDetailPage(
    @Param('id') id: string,
    @Body() body: GenerateDetailPageBodyDto,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.sourcingService.generateDetailPage(id, body, organizationId);
  }
}
