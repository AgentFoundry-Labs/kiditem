import { Controller, Get, Post, Body, Query } from '@nestjs/common';
import { SourcingService } from './sourcing.service';
import { CompanyResolverService } from '../common/company-resolver.service';
import {
  type ReceiveExtensionDataBody,
  ScrapeUrlBodyDto,
  ListExtensionProductsQueryDto,
} from './dto';

@Controller('sourcing')
export class SourcingController {
  constructor(
    private readonly sourcingService: SourcingService,
    private readonly companyResolver: CompanyResolverService,
  ) {}

  @Post('extension/product-data')
  async receiveExtensionData(@Body() data: ReceiveExtensionDataBody) {
    const companyId = await this.companyResolver.resolve();
    return this.sourcingService.receiveExtensionData(data, companyId);
  }

  @Post('scrape-url')
  async scrapeUrl(@Body() body: ScrapeUrlBodyDto) {
    const companyId = await this.companyResolver.resolve();
    return this.sourcingService.scrapeUrl(body.url.trim(), companyId);
  }

  @Get('extension/products')
  listProducts(@Query() query: ListExtensionProductsQueryDto) {
    return this.sourcingService.listProducts(query as any);
  }
}
