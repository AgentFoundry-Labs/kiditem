import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { MasterProductAdSpendReadAdapter } from './adapter/out/repository/master-product-ad-spend-read.adapter';
import { MASTER_PRODUCT_AD_SPEND_READ_PORT } from './application/port/in/master-product-ad-spend-read.port';

/**
 * Narrow cross-domain export for Finance. It deliberately avoids AdvertisingModule
 * (and therefore ProductsModule), preventing a Products → Finance → Advertising cycle.
 */
@Module({
  imports: [PrismaModule],
  providers: [
    MasterProductAdSpendReadAdapter,
    {
      provide: MASTER_PRODUCT_AD_SPEND_READ_PORT,
      useExisting: MasterProductAdSpendReadAdapter,
    },
  ],
  exports: [MASTER_PRODUCT_AD_SPEND_READ_PORT],
})
export class AdvertisingProfitabilityReadModule {}
