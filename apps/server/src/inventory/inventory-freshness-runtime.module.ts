import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SellpiaInventoryFreshnessRepositoryAdapter } from './adapter/out/persistence/sellpia-inventory-freshness.repository.adapter';
import { InventoryAvailabilityRepositoryAdapter } from './adapter/out/persistence/inventory-availability.repository.adapter';
import {
  INVENTORY_AVAILABILITY_PORT,
  SELLPIA_INVENTORY_FRESHNESS_GATE_PORT,
  SELLPIA_INVENTORY_COLLECTION_STATUS_PORT,
} from './application/port/in/stock';
import { INVENTORY_AVAILABILITY_REPOSITORY_PORT } from './application/port/out/persistence/inventory-availability.repository.port';
import { SELLPIA_INVENTORY_FRESHNESS_REPOSITORY_PORT } from './application/port/out/persistence/sellpia-inventory-freshness.repository.port';
import { InventoryAvailabilityService } from './application/usecase/inventory-availability.service';
import { SellpiaInventoryFreshnessService } from './application/usecase/sellpia-inventory-freshness.service';

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
      provide: SELLPIA_INVENTORY_COLLECTION_STATUS_PORT,
      useExisting: SellpiaInventoryFreshnessService,
    },
    {
      provide: SELLPIA_INVENTORY_FRESHNESS_GATE_PORT,
      useExisting: SellpiaInventoryFreshnessService,
    },
  ],
  exports: [
    SELLPIA_INVENTORY_COLLECTION_STATUS_PORT,
    SELLPIA_INVENTORY_FRESHNESS_GATE_PORT,
    INVENTORY_AVAILABILITY_PORT,
  ],
})
export class InventoryFreshnessRuntimeModule {}
