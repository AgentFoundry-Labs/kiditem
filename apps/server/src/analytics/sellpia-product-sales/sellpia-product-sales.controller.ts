import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { CurrentOrganization } from '../../auth/decorators/current-organization.decorator';
import type {
  SellpiaProductSalesSummary,
  SellpiaProductSalesIngestResult,
  SellpiaProductStockIngestResult,
} from '@kiditem/shared/dashboard';
import { SellpiaProductSalesService } from './sellpia-product-sales.service';
import {
  SellpiaProductSalesIngestBodyDto,
  SellpiaProductSalesQueryDto,
  SellpiaProductStockIngestBodyDto,
} from './dto/sellpia-product-sales.dto';

@Controller('sellpia-product-sales')
export class SellpiaProductSalesController {
  constructor(private readonly service: SellpiaProductSalesService) {}

  // 확장 크롤 결과 적재. 멱등(같은 상품/옵션/연월 재수집 시 덮어씀).
  @Post('ingest')
  async ingest(
    @Body() body: SellpiaProductSalesIngestBodyDto,
    @CurrentOrganization() organizationId: string,
  ): Promise<SellpiaProductSalesIngestResult> {
    return this.service.ingest(organizationId, body);
  }

  // 확장 재고 크롤 결과 적재(통합 재고현황 c_stosum). 조직 범위 전체 스냅샷 교체.
  @Post('stock')
  async ingestStock(
    @Body() body: SellpiaProductStockIngestBodyDto,
    @CurrentOrganization() organizationId: string,
  ): Promise<SellpiaProductStockIngestResult> {
    return this.service.ingestStock(organizationId, body);
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
