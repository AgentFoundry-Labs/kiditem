import { Module } from '@nestjs/common';
import { OperationAlertRuntimeModule } from '../automation/operation-alert-runtime.module';
import { PrismaModule } from '../prisma/prisma.module';
import { InventoryOperationAlertAdapter } from './adapter/out/automation/operation-alert.adapter';
import { SellpiaInventoryFreshnessRepositoryAdapter } from './adapter/out/repository/sellpia-inventory-freshness.repository.adapter';
import {
  SELLPIA_INVENTORY_FRESHNESS_GATE_PORT,
  SELLPIA_INVENTORY_FRESHNESS_PORT,
} from './application/port/in/stock';
import { INVENTORY_OPERATION_ALERT_PORT } from './application/port/out/cross-domain/operation-alert.port';
import { SELLPIA_INVENTORY_FRESHNESS_REPOSITORY_PORT } from './application/port/out/repository/sellpia-inventory-freshness.repository.port';
import { SellpiaInventoryFreshnessService } from './application/service/sellpia-inventory-freshness.service';

@Module({
  imports: [PrismaModule, OperationAlertRuntimeModule],
  providers: [
    SellpiaInventoryFreshnessRepositoryAdapter,
    InventoryOperationAlertAdapter,
    SellpiaInventoryFreshnessService,
    {
      provide: SELLPIA_INVENTORY_FRESHNESS_REPOSITORY_PORT,
      useExisting: SellpiaInventoryFreshnessRepositoryAdapter,
    },
    {
      provide: INVENTORY_OPERATION_ALERT_PORT,
      useExisting: InventoryOperationAlertAdapter,
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
