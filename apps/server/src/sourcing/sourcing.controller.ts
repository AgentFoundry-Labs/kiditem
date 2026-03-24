import { Controller, Get, Post, Body, Query, BadRequestException } from '@nestjs/common';
import { SourcingService } from './sourcing.service';

const DEFAULT_COMPANY_ID = process.env.DEFAULT_COMPANY_ID || '';

@Controller('sourcing')
export class SourcingController {
  constructor(private readonly sourcingService: SourcingService) {}

  @Post('extension/product-data')
  async receiveExtensionData(@Body() data: any) {
    if (!data.source_url) {
      throw new BadRequestException('source_url is required');
    }
    const companyId = DEFAULT_COMPANY_ID || await this.getFirstCompanyId();
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
    const companyId = DEFAULT_COMPANY_ID || await this.getFirstCompanyId();
    return this.sourcingService.scrapeUrl(body.url.trim(), companyId);
  }

  @Get('extension/products')
  listProducts(@Query() query: { limit?: string; platform?: string }) {
    return this.sourcingService.listProducts(query);
  }

  private async getFirstCompanyId(): Promise<string> {
    const { PrismaService } = await import('../prisma/prisma.service');
    return '';
  }
}
