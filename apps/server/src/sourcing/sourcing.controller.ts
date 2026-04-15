import { Controller, Get, Post, Body, Query } from '@nestjs/common';
import { SourcingService } from './sourcing.service';
import {
  type ReceiveExtensionDataBody,
  ScrapeUrlBodyDto,
  ListExtensionProductsQueryDto,
} from './dto';
import { CurrentCompany } from '../auth/decorators/current-company.decorator';

@Controller('sourcing')
export class SourcingController {
  constructor(
    private readonly sourcingService: SourcingService,
  ) {}

  @Post('extension/product-data')
  async receiveExtensionData(
    @Body() data: ReceiveExtensionDataBody,
    @CurrentCompany() companyId: string,
  ) {
    return this.sourcingService.receiveExtensionData(data, companyId);
  }

  @Post('scrape-url')
  async scrapeUrl(
    @Body() body: ScrapeUrlBodyDto,
    @CurrentCompany() companyId: string,
  ) {
    return this.sourcingService.scrapeUrl(body.url.trim(), companyId);
  }

  @Get('extension/products')
  listProducts(
    @Query() query: ListExtensionProductsQueryDto,
    @CurrentCompany() companyId: string,
  ) {
    return this.sourcingService.listProducts(query, companyId);
  }
}
