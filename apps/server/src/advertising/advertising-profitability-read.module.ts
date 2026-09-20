import { InventoryModule } from '../inventory/inventory.module';
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AlertsModule } from '../alerts/alerts.module';
import { ProfitabilityAdImportRepositoryAdapter } from './adapter/out/repository/profitability-ad-import.repository.adapter';
import { ProfitabilityAdImportService } from './application/service/profitability-ad-import.service';
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
  imports: [PrismaModule, AlertsModule, InventoryModule],
  controllers: [ProfitabilityAdImportController],
  providers: [
    ProfitabilityAdImportRepositoryAdapter,
    ProfitabilityAdImportService,
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
  exports: [ADVERTISING_PROFITABILITY_READ_PORT],
})
export class AdvertisingProfitabilityReadModule {}
