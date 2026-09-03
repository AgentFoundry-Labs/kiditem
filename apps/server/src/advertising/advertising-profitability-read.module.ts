import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AlertsModule } from '../alerts/alerts.module';
import { MasterProductAdSpendReadAdapter } from './adapter/out/repository/master-product-ad-spend-read.adapter';
import { ProfitabilityAdImportRepositoryAdapter } from './adapter/out/repository/profitability-ad-import.repository.adapter';
import { ProfitabilityAdImportService } from './application/service/profitability-ad-import.service';
import { MASTER_PRODUCT_AD_SPEND_READ_PORT } from './application/port/in/master-product-ad-spend-read.port';
import {
  ADVERTISING_PROFITABILITY_READ_PORT,
  PROFITABILITY_AD_IMPORT_PORT,
} from './application/port/in/profitability-ad-import.port';
import { PROFITABILITY_AD_IMPORT_REPOSITORY_PORT } from './application/port/out/repository/profitability-ad-import.repository.port';
import { ProfitabilityAdImportController } from './adapter/in/http/profitability-ad-import.controller';

/**
 * Owns profitability import HTTP and exports only read capabilities. It
 * deliberately avoids AdvertisingModule (and therefore ProductsModule),
 * preventing a Products → Finance → Advertising cycle.
 */
@Module({
  imports: [PrismaModule, AlertsModule],
  controllers: [ProfitabilityAdImportController],
  providers: [
    MasterProductAdSpendReadAdapter,
    ProfitabilityAdImportRepositoryAdapter,
    ProfitabilityAdImportService,
    {
      provide: MASTER_PRODUCT_AD_SPEND_READ_PORT,
      useExisting: MasterProductAdSpendReadAdapter,
    },
    {
      provide: PROFITABILITY_AD_IMPORT_REPOSITORY_PORT,
      useExisting: ProfitabilityAdImportRepositoryAdapter,
    },
    {
      provide: PROFITABILITY_AD_IMPORT_PORT,
      useExisting: ProfitabilityAdImportService,
    },
    {
      provide: ADVERTISING_PROFITABILITY_READ_PORT,
      useExisting: ProfitabilityAdImportRepositoryAdapter,
    },
  ],
  exports: [MASTER_PRODUCT_AD_SPEND_READ_PORT, ADVERTISING_PROFITABILITY_READ_PORT],
})
export class AdvertisingProfitabilityReadModule {}
