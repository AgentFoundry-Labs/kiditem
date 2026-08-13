import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { CurrentUser } from '../../../../auth/decorators/current-user.decorator';
import type { AuthUser } from '../../../../auth/auth.types';
import { SourcingExtensionIngestService } from '../../../application/service/sourcing-extension-ingest.service';
import { SourcingService } from '../../../application/service/sourcing.service';
import {
  CreateProductGenerationDto,
  CreateExtensionV2CollectionSessionDto,
  ListExtensionProductsQueryDto,
  RegisterManualProductDto,
  ReceiveExtensionDataDto,
  ReceiveExtensionV2DataDto,
  ScrapeUrlBodyDto,
  ScrapeUrlStatusQueryDto,
} from './dto';

@Controller('sourcing')
export class SourcingExtensionIngestController {
  constructor(
    private readonly sourcingService: SourcingService,
    private readonly extensionIngest: SourcingExtensionIngestService,
  ) {}

  @Post('extension/product-data')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async receiveExtensionData(
    @Body() body: ReceiveExtensionDataDto,
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.extensionIngest.ingestV1(
      { organizationId, userId: user.id ?? null },
      body,
    );
  }

  @Post('extension/v2/product-data')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async receiveExtensionV2Data(
    @Body() body: ReceiveExtensionV2DataDto,
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.extensionIngest.ingestV2(
      { organizationId, userId: user.id ?? null },
      body,
    );
  }

  @Post('extension/v2/sessions')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async createExtensionV2CollectionSession(
    @Body() body: CreateExtensionV2CollectionSessionDto,
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.extensionIngest.issueV2CollectionSession(
      { organizationId, userId: user.id ?? null },
      body,
    );
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
