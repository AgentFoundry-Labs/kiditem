import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ProductsModule } from '../products/products.module';
import { InventoryController } from './controllers/inventory.controller';
import { UnshippedController } from './controllers/unshipped.controller';
import { InventoryService } from './services/inventory.service';
import { UnshippedService } from './services/unshipped.service';
import { WarehousesModule } from './warehouses/warehouses.module';
import { StockTransfersModule } from './stock-transfers/stock-transfers.module';
import { StockAuditsModule } from './stock-audits/stock-audits.module';
import { PickingModule } from './picking/picking.module';

@Module({
  imports: [
    PrismaModule,
    ProductsModule,
    WarehousesModule,
    StockTransfersModule,
    StockAuditsModule,
    PickingModule,
  ],
  controllers: [InventoryController, UnshippedController],
  providers: [InventoryService, UnshippedService],
  exports: [InventoryService],
})
export class InventoryModule {}
