import { MASTER_PRODUCT_MONTHLY_SALES_READ_PORT } from '../application/port/in/master-product-monthly-sales-read.port';
import { Module } from '@nestjs/common';
import { ProductAbcReadModule } from '../../products/product-abc-read.module';
import { ProductCollectionRuntimeModule } from '../../products/product-collection-runtime.module';
import { AiModule } from '../../content/ai.module';
import { MASTER_PRODUCT_PROFIT_FACT_READ_PORT } from '../application/port/in/master-product-profit-fact-read.port';
import { SellpiaProductSalesController } from './sellpia-product-sales.controller';
import { SellpiaProductSalesService } from './sellpia-product-sales.service';
import { SellpiaProductInventoryReader } from './sellpia-product-inventory-reader';
import { SELLPIA_PRODUCT_DEPLETION_READ_PORT } from './sellpia-product-depletion-read.port';
import { SELLPIA_PRODUCT_SALES_SUMMARY_READ_PORT } from './sellpia-product-sales-summary-read.port';
import { SellpiaMasterProductProfitFactReader } from './sellpia-master-product-profit-fact.reader';
import { SellpiaProfitabilitySourceModule } from './sellpia-profitability-source.module';

// Sellpia 상품별 이익현황(stat_prd_profit)의 source-owned publication + read.
// PrismaModule 은 @Global 이므로 별도 import 불필요.
@Module({
  imports: [
    ProductCollectionRuntimeModule,
    AiModule,
    SellpiaProfitabilitySourceModule,
    ProductAbcReadModule,
  ],
  controllers: [SellpiaProductSalesController],
  providers: [
    SellpiaProductSalesService,
    { provide: SELLPIA_PRODUCT_SALES_SUMMARY_READ_PORT, useExisting: SellpiaProductSalesService },
    SellpiaProductInventoryReader,
    SellpiaMasterProductProfitFactReader,
    { provide: MASTER_PRODUCT_MONTHLY_SALES_READ_PORT, useExisting: SellpiaMasterProductProfitFactReader },
    {
      provide: SELLPIA_PRODUCT_DEPLETION_READ_PORT,
      useExisting: SellpiaProductSalesService,
    },
    {
      provide: MASTER_PRODUCT_PROFIT_FACT_READ_PORT,
      useExisting: SellpiaMasterProductProfitFactReader,
    },
  ],
  exports: [
    SELLPIA_PRODUCT_SALES_SUMMARY_READ_PORT,
    MASTER_PRODUCT_MONTHLY_SALES_READ_PORT,
    SellpiaProfitabilitySourceModule,
    SELLPIA_PRODUCT_DEPLETION_READ_PORT,
    MASTER_PRODUCT_PROFIT_FACT_READ_PORT,
  ],
})
export class SellpiaProductSalesModule {}
