import { Module } from '@nestjs/common';
import { SellpiaProductSalesController } from './sellpia-product-sales.controller';
import { SellpiaProductSalesService } from './sellpia-product-sales.service';

// Sellpia 상품별 이익현황(stat_prd_profit) 월별 소진 ingest + read.
// analytics owner 의 daily/monthly-fact ingest 예외 레인(traffic upload·sellpia-sales 와 동일 성격).
// PrismaModule 은 @Global 이므로 별도 import 불필요.
@Module({
  controllers: [SellpiaProductSalesController],
  providers: [SellpiaProductSalesService],
  exports: [SellpiaProductSalesService],
})
export class SellpiaProductSalesModule {}
