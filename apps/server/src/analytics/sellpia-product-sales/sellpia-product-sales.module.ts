import { Module } from '@nestjs/common';
import { SellpiaProductSalesController } from './sellpia-product-sales.controller';
import { SellpiaProductSalesService } from './sellpia-product-sales.service';
import { InventoryModule } from '../../inventory/inventory.module';
import { AiModule } from '../../ai/ai.module';
import { SellpiaProductInventoryReader } from './sellpia-product-inventory-reader';
import { SELLPIA_PRODUCT_DEPLETION_READ_PORT } from './sellpia-product-depletion-read.port';
import { MASTER_PRODUCT_PROFIT_FACT_READ_PORT } from '../application/port/in/master-product-profit-fact-read.port';
import { SellpiaMasterProductProfitFactReader } from './sellpia-master-product-profit-fact.reader';
import { AlertsModule } from '../../alerts/alerts.module';
import { SellpiaProfitabilitySourceService } from './sellpia-profitability-source.service';

// Sellpia 상품별 이익현황(stat_prd_profit)의 source-owned publication + read.
// PrismaModule 은 @Global 이므로 별도 import 불필요.
@Module({
  imports: [InventoryModule, AiModule, AlertsModule],
  controllers: [SellpiaProductSalesController],
  providers: [
    SellpiaProductSalesService,
    SellpiaProfitabilitySourceService,
    SellpiaProductInventoryReader,
    SellpiaMasterProductProfitFactReader,
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
    SellpiaProfitabilitySourceService,
    SELLPIA_PRODUCT_DEPLETION_READ_PORT,
    MASTER_PRODUCT_PROFIT_FACT_READ_PORT,
  ],
})
export class SellpiaProductSalesModule {}
