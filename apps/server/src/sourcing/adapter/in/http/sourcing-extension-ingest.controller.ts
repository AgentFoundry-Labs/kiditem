import { Body, Controller, Get, Headers, Post, Query, UseFilters } from '@nestjs/common';
import { parseRequiredIdempotencyKey } from '../../../../common/http/required-idempotency-key';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { CurrentUser } from '../../../../auth/decorators/current-user.decorator';
import { SourcingService } from '../../../application/service/sourcing.service';
import { SourceRecordDuplicateFilter } from './source-record-duplicate.filter';
import {
  CreateProductGenerationDto,
  RegisterManualProductDto,
  ScrapeUrlBodyDto,
  ScrapeUrlStatusQueryDto,
} from './dto';
import type { AuthUser } from '../../../../auth/auth.types';

/**
 * 수집 입구(URL 스크랩·수동 등록·생성). 같은 원본의 두 번째 수집은 여기서 409 로 답한다(KID-313).
 * 확장 상품 수집은 실행 kind `sourcing.product_extension`(KID-360)이다.
 */
@Controller('sourcing')
@UseFilters(SourceRecordDuplicateFilter)
export class SourcingExtensionIngestController {
  constructor(
    private readonly sourcingService: SourcingService,
  ) {}

  @Post('product-registration')
  async registerManualProduct(
    @Body() body: RegisterManualProductDto,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.sourcingService.registerManualProduct(body, organizationId);
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
}
