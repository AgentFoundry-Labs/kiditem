import { Controller, Get, Post, Body, Query, BadRequestException } from '@nestjs/common';
import { SourcingService } from './sourcing.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  type ReceiveExtensionDataBody,
  ScrapeUrlBodyDto,
  ListExtensionProductsQueryDto,
} from './dto';

@Controller('sourcing')
export class SourcingController {
  constructor(
    private readonly sourcingService: SourcingService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('extension/product-data')
  async receiveExtensionData(@Body() data: ReceiveExtensionDataBody) {
    const companyId = await this.getDefaultCompanyId();
    return this.sourcingService.receiveExtensionData(data, companyId);
  }

  @Post('scrape-url')
  async scrapeUrl(@Body() body: ScrapeUrlBodyDto) {
    const companyId = await this.getDefaultCompanyId();
    return this.sourcingService.scrapeUrl(body.url.trim(), companyId);
  }

  @Get('extension/products')
  listProducts(@Query() query: ListExtensionProductsQueryDto) {
    return this.sourcingService.listProducts(query as any);
  }

  private async getDefaultCompanyId(): Promise<string> {
    const company = await this.prisma.company.findFirst({
      orderBy: { createdAt: 'asc' },
    });
    if (!company) {
      throw new BadRequestException('No company found. Run seed first.');
    }
    return company.id;
  }
}
