import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ProductsModule } from '../products/products.module';

import { InventoryAssetsController } from './adapter/in/http/inventory-assets.controller';
import { InventoryItemsController } from './adapter/in/http/inventory-items.controller';
import { InventoryStockMutationsController } from './adapter/in/http/inventory-stock-mutations.controller';
import { InventoryTransactionsController } from './adapter/in/http/inventory-transactions.controller';
import { UnshippedController } from './adapter/in/http/unshipped.controller';
import { WarehousesController } from './adapter/in/http/warehouses.controller';
import { TransfersController } from './adapter/in/http/transfers.controller';
import { AuditsController } from './adapter/in/http/audits.controller';
import { PickingController } from './adapter/in/http/picking.controller';

import { InventoryQueryRepositoryAdapter } from './adapter/out/repository/inventory-query.repository.adapter';
import { InventoryRepositoryAdapter } from './adapter/out/repository/inventory.repository.adapter';
import { WarehousesRepositoryAdapter } from './adapter/out/repository/warehouses.repository.adapter';
import { TransfersRepositoryAdapter } from './adapter/out/repository/transfers.repository.adapter';
import { AuditsRepositoryAdapter } from './adapter/out/repository/audits.repository.adapter';
import { PickingRepositoryAdapter } from './adapter/out/repository/picking.repository.adapter';
import { ConfirmedOrdersRepositoryAdapter } from './adapter/out/repository/confirmed-orders.repository.adapter';
import { BundleStockAdapter } from './adapter/out/products/bundle-stock.adapter';

import { InventoryService } from './application/service/inventory.service';
import { UnshippedService } from './application/service/unshipped.service';
import { WarehousesService } from './application/service/warehouses.service';
import { TransfersService } from './application/service/transfers.service';
import { AuditsService } from './application/service/audits.service';
import { PickingService } from './application/service/picking.service';

import { AUDITS_PORT, INVENTORY_PORT } from './application/port/in/stock';
import { PICKING_PORT, UNSHIPPED_PORT } from './application/port/in/fulfillment';
import { TRANSFERS_PORT, WAREHOUSES_PORT } from './application/port/in/warehouse';

import { INVENTORY_QUERY_REPOSITORY_PORT } from './application/port/out/repository/inventory-query.repository.port';
import { INVENTORY_REPOSITORY_PORT } from './application/port/out/repository/inventory.repository.port';
import { WAREHOUSES_REPOSITORY_PORT } from './application/port/out/repository/warehouses.repository.port';
import { TRANSFERS_REPOSITORY_PORT } from './application/port/out/repository/transfers.repository.port';
import { AUDITS_REPOSITORY_PORT } from './application/port/out/repository/audits.repository.port';
import { PICKING_REPOSITORY_PORT } from './application/port/out/repository/picking.repository.port';
import { CONFIRMED_ORDERS_PORT } from './application/port/out/cross-domain/confirmed-orders.port';
import { BUNDLE_STOCK_PORT } from './application/port/out/cross-domain/bundle-stock.port';

// Application port → adapter bindings live in this module. Application services
// only depend on `application/port/out/*` contracts; the Nest module is the
// single place that wires those contracts to concrete adapters.
const REPOSITORY_PORT_BINDINGS = [
  { provide: INVENTORY_QUERY_REPOSITORY_PORT, useExisting: InventoryQueryRepositoryAdapter },
  { provide: INVENTORY_REPOSITORY_PORT, useExisting: InventoryRepositoryAdapter },
  { provide: WAREHOUSES_REPOSITORY_PORT, useExisting: WarehousesRepositoryAdapter },
  { provide: TRANSFERS_REPOSITORY_PORT, useExisting: TransfersRepositoryAdapter },
  { provide: AUDITS_REPOSITORY_PORT, useExisting: AuditsRepositoryAdapter },
  { provide: PICKING_REPOSITORY_PORT, useExisting: PickingRepositoryAdapter },
  { provide: CONFIRMED_ORDERS_PORT, useExisting: ConfirmedOrdersRepositoryAdapter },
  { provide: BUNDLE_STOCK_PORT, useExisting: BundleStockAdapter },
];

const APPLICATION_PORT_BINDINGS = [
  { provide: INVENTORY_PORT, useExisting: InventoryService },
  { provide: UNSHIPPED_PORT, useExisting: UnshippedService },
  { provide: WAREHOUSES_PORT, useExisting: WarehousesService },
  { provide: TRANSFERS_PORT, useExisting: TransfersService },
  { provide: AUDITS_PORT, useExisting: AuditsService },
  { provide: PICKING_PORT, useExisting: PickingService },
];

@Module({
  imports: [PrismaModule, ProductsModule],
  controllers: [
    InventoryTransactionsController,
    InventoryAssetsController,
    InventoryItemsController,
    InventoryStockMutationsController,
    UnshippedController,
    WarehousesController,
    TransfersController,
    AuditsController,
    PickingController,
  ],
  providers: [
    // adapter/out/repository
    InventoryQueryRepositoryAdapter,
    InventoryRepositoryAdapter,
    WarehousesRepositoryAdapter,
    TransfersRepositoryAdapter,
    AuditsRepositoryAdapter,
    PickingRepositoryAdapter,
    ConfirmedOrdersRepositoryAdapter,
    // adapter/out/products
    BundleStockAdapter,
    // application/service
    InventoryService,
    UnshippedService,
    WarehousesService,
    TransfersService,
    AuditsService,
    PickingService,
    // port bindings
    ...REPOSITORY_PORT_BINDINGS,
    ...APPLICATION_PORT_BINDINGS,
  ],
  exports: [INVENTORY_PORT],
})
export class InventoryModule {}
