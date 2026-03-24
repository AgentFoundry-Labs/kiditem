import { Controller, Get, Post, Body, Query, BadRequestException } from '@nestjs/common';
import { SourcingService } from './sourcing.service';
import { PrismaService } from '../prisma/prisma.service';

@Controller('sourcing')
export class SourcingController {
  constructor(
    private readonly sourcingService: SourcingService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('extension/product-data')
  async receiveExtensionData(@Body() data: any) {
    if (!data.source_url) {
      throw new BadRequestException('source_url is required');
    }
    const companyId = await this.getDefaultCompanyId();
    return this.sourcingService.receiveExtensionData(data, companyId);
  }

  @Post('scrape-url')
  async scrapeUrl(@Body() body: { url: string }) {
    if (!body.url?.trim()) {
      throw new BadRequestException('URL is required');
    }
    if (!body.url.includes('1688.com') && !body.url.includes('alibaba.com')) {
      throw new BadRequestException('1688.com 또는 alibaba.com URL만 지원합니다');
    }
    const companyId = await this.getDefaultCompanyId();
    return this.sourcingService.scrapeUrl(body.url.trim(), companyId);
  }

  @Get('extension/products')
  listProducts(@Query() query: { limit?: string; platform?: string }) {
    return this.sourcingService.listProducts(query);
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
