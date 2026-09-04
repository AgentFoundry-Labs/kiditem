import { Module } from '@nestjs/common';
import { AlertsModule } from '../alerts/alerts.module';
import { PrismaModule } from '../prisma/prisma.module';
import { SellpiaInventoryFreshnessRepositoryAdapter } from './adapter/out/repository/sellpia-inventory-freshness.repository.adapter';
import {
  SELLPIA_INVENTORY_FRESHNESS_GATE_PORT,
  SELLPIA_INVENTORY_FRESHNESS_PORT,
} from './application/port/in/stock';
import { SELLPIA_INVENTORY_FRESHNESS_REPOSITORY_PORT } from './application/port/out/repository/sellpia-inventory-freshness.repository.port';
import { SellpiaInventoryFreshnessService } from './application/service/sellpia-inventory-freshness.service';

@Module({
  imports: [PrismaModule, AlertsModule],
  providers: [
    SellpiaInventoryFreshnessRepositoryAdapter,
    SellpiaInventoryFreshnessService,
    {
      provide: SELLPIA_INVENTORY_FRESHNESS_REPOSITORY_PORT,
      useExisting: SellpiaInventoryFreshnessRepositoryAdapter,
    },
    {
      provide: SELLPIA_INVENTORY_FRESHNESS_PORT,
      useExisting: SellpiaInventoryFreshnessService,
    },
    {
      provide: SELLPIA_INVENTORY_FRESHNESS_GATE_PORT,
      useExisting: SellpiaInventoryFreshnessService,
    },
  ],
  exports: [
    SELLPIA_INVENTORY_FRESHNESS_PORT,
    SELLPIA_INVENTORY_FRESHNESS_GATE_PORT,
  ],
})
export class InventoryFreshnessRuntimeModule {}
