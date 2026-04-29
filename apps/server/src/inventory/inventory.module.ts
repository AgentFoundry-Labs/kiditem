import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ProductsModule } from '../products/products.module';

import { InventoryController } from './adapter/in/http/inventory.controller';
import { UnshippedController } from './adapter/in/http/unshipped.controller';
import { WarehousesController } from './adapter/in/http/warehouses.controller';
import { StockTransfersController } from './adapter/in/http/stock-transfers.controller';
import { StockAuditsController } from './adapter/in/http/stock-audits.controller';
import { PickingController } from './adapter/in/http/picking.controller';

import { InventoryQuery } from './adapter/out/prisma/inventory.query';
import { InventoryPersistence } from './adapter/out/prisma/inventory.persistence';
import { UnshippedQuery } from './adapter/out/prisma/unshipped.query';
import { WarehousesPersistence } from './adapter/out/prisma/warehouses.persistence';
import { StockTransfersPersistence } from './adapter/out/prisma/stock-transfers.persistence';
import { StockAuditsPersistence } from './adapter/out/prisma/stock-audits.persistence';
import { PickingPersistence } from './adapter/out/prisma/picking.persistence';

import { InventoryApplicationService } from './application/service/inventory-application.service';
import { UnshippedQueryService } from './application/service/unshipped-query.service';
import { WarehousesApplicationService } from './application/service/warehouses-application.service';
import { StockTransfersApplicationService } from './application/service/stock-transfers-application.service';
import { StockAuditsApplicationService } from './application/service/stock-audits-application.service';
import { PickingApplicationService } from './application/service/picking-application.service';

@Module({
  imports: [PrismaModule, ProductsModule],
  controllers: [
    InventoryController,
    UnshippedController,
    WarehousesController,
    StockTransfersController,
    StockAuditsController,
    PickingController,
  ],
  providers: [
    // adapter/out/prisma
    InventoryQuery,
    InventoryPersistence,
    UnshippedQuery,
    WarehousesPersistence,
    StockTransfersPersistence,
    StockAuditsPersistence,
    PickingPersistence,
    // application/service
    InventoryApplicationService,
    UnshippedQueryService,
    WarehousesApplicationService,
    StockTransfersApplicationService,
    StockAuditsApplicationService,
    PickingApplicationService,
  ],
  exports: [InventoryApplicationService],
})
export class InventoryModule {}
