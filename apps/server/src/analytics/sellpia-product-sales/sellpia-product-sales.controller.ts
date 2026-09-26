import { Controller, Get, Query } from '@nestjs/common';
import type { SellpiaProductSalesSummary } from '@kiditem/shared/dashboard';
import { CurrentOrganization } from '../../auth/decorators/current-organization.decorator';
import { SellpiaProductSalesService } from './sellpia-product-sales.service';
import { SellpiaProductSalesQueryDto } from './dto/sellpia-product-sales.dto';

// 상품 손익 수집은 실행 kind `analytics.sellpia_product_profitability`(ADR-0025, KID-361) — 시작·진행·중단은
// `/api/operations`가 맡는다. 여기에는 읽기만 남는다.
@Controller('sellpia-product-sales')
export class SellpiaProductSalesController {
  constructor(private readonly service: SellpiaProductSalesService) {}

  // 재고 분석 '상품별 소진' — 상품별 1개월/2개월 평균 소진량 + 월별 추이 + 현재고/발주.
  @Get()
  async getSummary(
    @Query() query: SellpiaProductSalesQueryDto,
    @CurrentOrganization() organizationId: string,
  ): Promise<SellpiaProductSalesSummary> {
    return this.service.getSummary(organizationId, query.months);
  }
}
