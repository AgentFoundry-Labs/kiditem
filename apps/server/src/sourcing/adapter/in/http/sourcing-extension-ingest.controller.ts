import { Body, Controller, Get, Headers, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { parseRequiredIdempotencyKey } from '../../../../common/http/required-idempotency-key';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { CurrentUser } from '../../../../auth/decorators/current-user.decorator';
import { SourcingExtensionIngestService } from '../../../application/service/sourcing-extension-ingest.service';
import { SourcingService } from '../../../application/service/sourcing.service';
import { parseAttemptToken, toPublicAttempt, toPublicStatus } from './sourcing-source-attempt-http';
import {
  CreateProductGenerationDto,
  ListExtensionProductsQueryDto,
  RegisterManualProductDto,
  ScrapeUrlBodyDto,
  ScrapeUrlStatusQueryDto,
} from './dto';
import type { AuthUser } from '../../../../auth/auth.types';

@Controller('sourcing')
export class SourcingExtensionIngestController {
  constructor(
    private readonly sourcingService: SourcingService,
    private readonly extensionIngest: SourcingExtensionIngestService,
  ) {}

  @Post('extension/product-data/attempts')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async beginProductExtraction(
    @Body() body: unknown,
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    return this.extensionIngest.begin(
      { organizationId, userId: user.id ?? null },
      body,
      parseRequiredIdempotencyKey(idempotencyKey),
    );
  }

  @Get('extension/product-data/status')
  async productSourceStatus(@Query('sourceUrl') sourceUrl: string, @CurrentOrganization() organizationId: string) {
    return toPublicStatus(await this.extensionIngest.status(organizationId, sourceUrl));
  }

  @Get('extension/product-data/attempts/:attemptId')
  async readProductExtraction(@Param('attemptId', ParseUUIDPipe) attemptId: string, @CurrentOrganization() organizationId: string) {
    return toPublicAttempt(await this.extensionIngest.read(organizationId, attemptId));
  }

  @Put('extension/product-data/attempts/:attemptId/complete')
  async completeProductExtraction(@Param('attemptId', ParseUUIDPipe) attemptId: string,
    @Headers('x-source-attempt-token') token: string | undefined, @Body() body: unknown,
    @CurrentOrganization() organizationId: string, @CurrentUser() user: AuthUser) {
    return toPublicAttempt(await this.extensionIngest.complete({ organizationId, userId: user.id ?? null }, attemptId, parseAttemptToken(token), body));
  }

  @Post('extension/product-data/attempts/:attemptId/fail')
  async failProductExtraction(@Param('attemptId', ParseUUIDPipe) attemptId: string,
    @Headers('x-source-attempt-token') token: string | undefined, @Body() body: unknown,
    @CurrentOrganization() organizationId: string) {
    return toPublicAttempt(await this.extensionIngest.fail(organizationId, attemptId, parseAttemptToken(token), body));
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
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    return this.sourcingService.createProductGeneration(
      body,
      organizationId,
      user.id ?? null,
      parseRequiredIdempotencyKey(idempotencyKey),
    );
  }

  @Post('scrape-url')
  async scrapeUrl(
    @Body() body: ScrapeUrlBodyDto,
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    return this.sourcingService.scrapeUrl(body.url.trim(), organizationId, user.id, parseRequiredIdempotencyKey(idempotencyKey));
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
