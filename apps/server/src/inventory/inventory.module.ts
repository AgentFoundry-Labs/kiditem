import { Module } from '@nestjs/common';
import { InventoryController } from './controllers/inventory.controller';
import { InventoryService } from './services/inventory.service';
import { StockMovementController } from './controllers/stock-movement.controller';
import { StockMovementService } from './services/stock-movement.service';
import { UnshippedController } from './controllers/unshipped.controller';
import { UnshippedService } from './services/unshipped.service';

@Module({
  controllers: [
    InventoryController,
    StockMovementController,
    UnshippedController,
  ],
  providers: [
    InventoryService,
    StockMovementService,
    UnshippedService,
  ],
})
export class InventoryModule {}
