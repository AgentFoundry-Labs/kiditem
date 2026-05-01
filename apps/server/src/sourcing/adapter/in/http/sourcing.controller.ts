import { Controller, Get, Post, Body, Query } from '@nestjs/common';
import { SourcingService } from '../../../application/service/sourcing.service';
import {
  type ReceiveExtensionDataBody,
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
}
