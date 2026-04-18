import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ProductsModule } from '../products/products.module';
import { InventoryController } from './controllers/inventory.controller';
import { UnshippedController } from './controllers/unshipped.controller';
import { InventoryService } from './services/inventory.service';
import { UnshippedService } from './services/unshipped.service';

@Module({
  imports: [PrismaModule, ProductsModule],
  controllers: [InventoryController, UnshippedController],
  providers: [InventoryService, UnshippedService],
  exports: [InventoryService],
})
export class InventoryModule {}
