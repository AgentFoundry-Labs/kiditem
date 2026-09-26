import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

// Sellpia 상품별 소진(재고 분석) read 쿼리 DTO. 상품 손익 수집은 실행 kind
// `analytics.sellpia_product_profitability`(KID-361)가 맡는다.

export class SellpiaProductSalesQueryDto {
  // 최근 N개월 조회(기본 13=1년). 평균/추세/시즌은 완결 월(현재 월 제외)에서 산정.
  @IsOptional()
  @IsInt()
  @Min(2)
  @Max(24)
  @Type(() => Number)
  months?: number;
}
