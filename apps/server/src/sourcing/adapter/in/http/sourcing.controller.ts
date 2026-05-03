import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { SourcingService } from '../../../application/service/sourcing.service';
import {
  type ReceiveExtensionDataBody,
  GenerateDetailPageBodyDto,
  ScrapeUrlBodyDto,
  ListExtensionProductsQueryDto,
} from './dto';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';

@Controller('sourcing')
export class SourcingController {
  constructor(
    private readonly sourcingService: SourcingService,
  ) {}

  @Post('extension/product-data')
  async receiveExtensionData(
    @Body() data: ReceiveExtensionDataBody,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.sourcingService.receiveExtensionData(data, organizationId);
  }

  @Post('scrape-url')
  async scrapeUrl(
    @Body() body: ScrapeUrlBodyDto,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.sourcingService.scrapeUrl(body.url.trim(), organizationId);
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
