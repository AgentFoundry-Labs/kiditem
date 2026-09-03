import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentOrganization } from '../../auth/decorators/current-organization.decorator';
import { SellpiaProductSalesService } from './sellpia-product-sales.service';
import { SellpiaProfitabilitySourceService } from './sellpia-profitability-source.service';
import {
  SellpiaProfitabilityBeginBodyDto,
  SellpiaProfitabilityFailureBodyDto,
  SellpiaProfitabilitySubmitBodyDto,
  SellpiaProductSalesQueryDto,
} from './dto/sellpia-product-sales.dto';
import type {
  SellpiaProfitabilityAttempt,
  SellpiaProfitabilityAttemptControl,
  SellpiaProfitabilitySourceStatus,
} from '@kiditem/shared/source-import';
import type { SellpiaProductSalesSummary } from '@kiditem/shared/dashboard';

@Controller('sellpia-product-sales')
export class SellpiaProductSalesController {
  constructor(
    private readonly service: SellpiaProductSalesService,
    private readonly source: SellpiaProfitabilitySourceService,
  ) {}

  @Post('attempts')
  beginAttempt(
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: SellpiaProfitabilityBeginBodyDto,
    @CurrentOrganization() organizationId: string,
  ): Promise<SellpiaProfitabilityAttempt> {
    return this.source.beginAttempt(organizationId, idempotencyKey, body);
  }

  @Post('attempts/:attemptId')
  submitAttempt(
    @Param('attemptId') attemptId: string,
    @Body() body: SellpiaProfitabilitySubmitBodyDto,
    @CurrentOrganization() organizationId: string,
  ): Promise<SellpiaProfitabilityAttempt> {
    return this.source.submitAttempt(organizationId, attemptId, body);
  }

  @Post('attempts/:attemptId/fail')
  failAttempt(
    @Param('attemptId') attemptId: string,
    @Body() body: SellpiaProfitabilityFailureBodyDto,
    @CurrentOrganization() organizationId: string,
  ): Promise<SellpiaProfitabilityAttempt> {
    return this.source.failAttempt(organizationId, attemptId, body);
  }

  @Get('attempts/:attemptId')
  readAttemptControl(
    @Param('attemptId', new ParseUUIDPipe({ version: '4' })) attemptId: string,
    @CurrentOrganization() organizationId: string,
  ): Promise<SellpiaProfitabilityAttemptControl> {
    return this.source.readAttemptControl(organizationId, attemptId);
  }

  @Get('status')
  readSourceStatus(
    @CurrentOrganization() organizationId: string,
  ): Promise<SellpiaProfitabilitySourceStatus> {
    return this.source.readSourceStatus(organizationId);
  }

  // 재고 분석 '상품별 소진' — 상품별 1개월/2개월 평균 소진량 + 월별 추이 + 현재고/발주.
  @Get()
  async getSummary(
    @Query() query: SellpiaProductSalesQueryDto,
    @CurrentOrganization() organizationId: string,
  ): Promise<SellpiaProductSalesSummary> {
    return this.service.getSummary(organizationId, query.months);
  }
}
