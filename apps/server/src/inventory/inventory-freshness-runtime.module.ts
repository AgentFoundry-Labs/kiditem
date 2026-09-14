import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SellpiaInventoryFreshnessRepositoryAdapter } from './adapter/out/repository/sellpia-inventory-freshness.repository.adapter';
import { InventoryAvailabilityRepositoryAdapter } from './adapter/out/repository/inventory-availability.repository.adapter';
import {
  INVENTORY_AVAILABILITY_PORT,
  SELLPIA_INVENTORY_FRESHNESS_GATE_PORT,
  SELLPIA_INVENTORY_FRESHNESS_PORT,
} from './application/port/in/stock';
import { INVENTORY_AVAILABILITY_REPOSITORY_PORT } from './application/port/out/repository/inventory-availability.repository.port';
import { SELLPIA_INVENTORY_FRESHNESS_REPOSITORY_PORT } from './application/port/out/repository/sellpia-inventory-freshness.repository.port';
import { InventoryAvailabilityService } from './application/service/inventory-availability.service';
import { SellpiaInventoryFreshnessService } from './application/service/sellpia-inventory-freshness.service';

@Module({
  imports: [PrismaModule],
  providers: [
    SellpiaInventoryFreshnessRepositoryAdapter,
    SellpiaInventoryFreshnessService,
    InventoryAvailabilityRepositoryAdapter,
    InventoryAvailabilityService,
    {
      provide: INVENTORY_AVAILABILITY_REPOSITORY_PORT,
      useExisting: InventoryAvailabilityRepositoryAdapter,
    },
    {
      provide: INVENTORY_AVAILABILITY_PORT,
      useExisting: InventoryAvailabilityService,
    },
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
    INVENTORY_AVAILABILITY_PORT,
  ],
})
export class InventoryFreshnessRuntimeModule {}
