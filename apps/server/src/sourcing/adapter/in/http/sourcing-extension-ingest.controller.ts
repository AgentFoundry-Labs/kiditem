import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { CurrentUser } from '../../../../auth/decorators/current-user.decorator';
import type { AuthUser } from '../../../../auth/auth.types';
import { SourcingService } from '../../../application/service/sourcing.service';
import {
  CreateProductGenerationDto,
  ListExtensionProductsQueryDto,
  RegisterManualProductDto,
  ReceiveExtensionDataDto,
  ScrapeUrlBodyDto,
  ScrapeUrlStatusQueryDto,
} from './dto';

@Controller('sourcing')
export class SourcingExtensionIngestController {
  constructor(private readonly sourcingService: SourcingService) {}

  @Post('extension/product-data')
  async receiveExtensionData(
    @Body() body: ReceiveExtensionDataDto,
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
  ) {
    const flat = { ...body, ...(body.extra ?? {}) };
    return this.sourcingService.receiveExtensionData(flat, organizationId, user.id ?? null);
  }

  @Post('product-registration')
  async registerManualProduct(
    @Body() body: RegisterManualProductDto,
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.sourcingService.registerManualProduct(body, organizationId, user.id ?? null);
  }

  @Post('product-generation')
  async createProductGeneration(
    @Body() body: CreateProductGenerationDto,
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.sourcingService.createProductGeneration(body, organizationId, user.id ?? null);
  }

  @Post('scrape-url')
  async scrapeUrl(
    @Body() body: ScrapeUrlBodyDto,
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.sourcingService.scrapeUrl(body.url.trim(), organizationId, user.id);
  }

  @Get('scrape-url/status')
  scrapeUrlStatus(
    @Query() query: ScrapeUrlStatusQueryDto,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.sourcingService.scrapeUrlStatus(query.url.trim(), organizationId);
  }

  @Get('extension/products')
  listProducts(
    @Query() query: ListExtensionProductsQueryDto,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.sourcingService.listProducts(query, organizationId);
  }
}
