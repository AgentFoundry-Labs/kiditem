import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CoupangShipmentsController } from './adapter/in/http/coupang-shipments.controller';
import { InventorySkuSnapshotController } from './adapter/in/http/inventory-sku-snapshot.controller';
import { PickingController } from './adapter/in/http/picking.controller';
import { SellpiaInventoryImportController } from './adapter/in/http/sellpia-inventory-import.controller';
import { SellpiaInventoryFreshnessController } from './adapter/in/http/sellpia-inventory-freshness.controller';
import { SellpiaReceiptBatchController } from './adapter/in/http/sellpia-receipt-batch.controller';
import { TransfersController } from './adapter/in/http/transfers.controller';
import { UnshippedController } from './adapter/in/http/unshipped.controller';
import { WarehousesController } from './adapter/in/http/warehouses.controller';
import { ConfirmedOrdersRepositoryAdapter } from './adapter/out/repository/confirmed-orders.repository.adapter';
import { SellpiaMasterImportRepositoryAdapter } from './adapter/out/repository/sellpia-master-import.repository.adapter';
import { SellpiaInventoryFreshnessRepositoryAdapter } from './adapter/out/repository/sellpia-inventory-freshness.repository.adapter';
import { InventorySkuSnapshotListRepositoryAdapter } from './adapter/out/repository/inventory-sku-snapshot-list.repository.adapter';
import { SellpiaMasterProductReadRepositoryAdapter } from './adapter/out/repository/sellpia-master-product-read.repository.adapter';
import { PickingRepositoryAdapter } from './adapter/out/repository/picking.repository.adapter';
import { SellpiaReceiptBatchRepositoryAdapter } from './adapter/out/repository/sellpia-receipt-batch.repository.adapter';
import { TransfersRepositoryAdapter } from './adapter/out/repository/transfers.repository.adapter';
import { UnshippedRepositoryAdapter } from './adapter/out/repository/unshipped.repository.adapter';
import { WarehousesRepositoryAdapter } from './adapter/out/repository/warehouses.repository.adapter';
import { LocalCoupangShipmentFilesAdapter } from './adapter/out/storage/local-coupang-shipment-files.adapter';
import { COUPANG_SHIPMENTS_PORT, PICKING_PORT, UNSHIPPED_PORT } from './application/port/in/fulfillment';
import {
  INVENTORY_SKU_SNAPSHOT_LIST_PORT,
  SELLPIA_INVENTORY_IMPORT_PORT,
  SELLPIA_INVENTORY_FRESHNESS_GATE_PORT,
  SELLPIA_INVENTORY_FRESHNESS_PORT,
  SELLPIA_INVENTORY_REFRESH_REQUEST_PORT,
  SELLPIA_MASTER_PRODUCT_READ_PORT,
  SELLPIA_RECEIPT_BATCH_PORT,
} from './application/port/in/stock';
import { TRANSFERS_PORT, WAREHOUSES_PORT } from './application/port/in/warehouse';
import { CONFIRMED_ORDERS_PORT } from './application/port/out/cross-domain/confirmed-orders.port';
import { SELLPIA_MASTER_IMPORT_REPOSITORY_PORT } from './application/port/out/repository/sellpia-master-import.repository.port';
import { SELLPIA_INVENTORY_FRESHNESS_REPOSITORY_PORT } from './application/port/out/repository/sellpia-inventory-freshness.repository.port';
import { INVENTORY_SKU_SNAPSHOT_LIST_REPOSITORY_PORT } from './application/port/out/repository/inventory-sku-snapshot-list.repository.port';
import { SELLPIA_MASTER_PRODUCT_READ_REPOSITORY_PORT } from './application/port/out/repository/sellpia-master-product-read.repository.port';
import { PICKING_REPOSITORY_PORT } from './application/port/out/repository/picking.repository.port';
import { SELLPIA_RECEIPT_BATCH_REPOSITORY_PORT } from './application/port/out/repository/sellpia-receipt-batch.repository.port';
import { TRANSFERS_REPOSITORY_PORT } from './application/port/out/repository/transfers.repository.port';
import { UNSHIPPED_REPOSITORY_PORT } from './application/port/out/repository/unshipped.repository.port';
import { WAREHOUSES_REPOSITORY_PORT } from './application/port/out/repository/warehouses.repository.port';
import { COUPANG_SHIPMENT_FILE_STORAGE_PORT } from './application/port/out/storage';
import { CoupangShipmentsService } from './application/service/coupang-shipments.service';
import { InventorySkuSnapshotListService } from './application/service/inventory-sku-snapshot-list.service';
import { PickingService } from './application/service/picking.service';
import { SellpiaInventoryImportService } from './application/service/sellpia-inventory-import.service';
import { SellpiaInventoryFreshnessService } from './application/service/sellpia-inventory-freshness.service';
import { SellpiaMasterProductReadService } from './application/service/sellpia-master-product-read.service';
import { SellpiaReceiptBatchService } from './application/service/sellpia-receipt-batch.service';
import { TransfersService } from './application/service/transfers.service';
import { UnshippedService } from './application/service/unshipped.service';
import { WarehousesService } from './application/service/warehouses.service';

const REPOSITORY_PORT_BINDINGS = [
  {
    provide: SELLPIA_MASTER_IMPORT_REPOSITORY_PORT,
    useExisting: SellpiaMasterImportRepositoryAdapter,
  },
  {
    provide: SELLPIA_INVENTORY_FRESHNESS_REPOSITORY_PORT,
    useExisting: SellpiaInventoryFreshnessRepositoryAdapter,
  },
  {
    provide: SELLPIA_MASTER_PRODUCT_READ_REPOSITORY_PORT,
    useExisting: SellpiaMasterProductReadRepositoryAdapter,
  },
  {
    provide: INVENTORY_SKU_SNAPSHOT_LIST_REPOSITORY_PORT,
    useExisting: InventorySkuSnapshotListRepositoryAdapter,
  },
  { provide: UNSHIPPED_REPOSITORY_PORT, useExisting: UnshippedRepositoryAdapter },
  { provide: SELLPIA_RECEIPT_BATCH_REPOSITORY_PORT, useExisting: SellpiaReceiptBatchRepositoryAdapter },
  { provide: WAREHOUSES_REPOSITORY_PORT, useExisting: WarehousesRepositoryAdapter },
  { provide: TRANSFERS_REPOSITORY_PORT, useExisting: TransfersRepositoryAdapter },
  { provide: PICKING_REPOSITORY_PORT, useExisting: PickingRepositoryAdapter },
  { provide: CONFIRMED_ORDERS_PORT, useExisting: ConfirmedOrdersRepositoryAdapter },
  { provide: COUPANG_SHIPMENT_FILE_STORAGE_PORT, useExisting: LocalCoupangShipmentFilesAdapter },
];

const APPLICATION_PORT_BINDINGS = [
  { provide: SELLPIA_MASTER_PRODUCT_READ_PORT, useExisting: SellpiaMasterProductReadService },
  { provide: INVENTORY_SKU_SNAPSHOT_LIST_PORT, useExisting: InventorySkuSnapshotListService },
  { provide: SELLPIA_INVENTORY_IMPORT_PORT, useExisting: SellpiaInventoryImportService },
  { provide: SELLPIA_INVENTORY_FRESHNESS_PORT, useExisting: SellpiaInventoryFreshnessService },
  { provide: SELLPIA_INVENTORY_REFRESH_REQUEST_PORT, useExisting: SellpiaInventoryFreshnessService },
  { provide: SELLPIA_INVENTORY_FRESHNESS_GATE_PORT, useExisting: SellpiaInventoryFreshnessService },
  { provide: SELLPIA_RECEIPT_BATCH_PORT, useExisting: SellpiaReceiptBatchService },
  { provide: UNSHIPPED_PORT, useExisting: UnshippedService },
  { provide: WAREHOUSES_PORT, useExisting: WarehousesService },
  { provide: TRANSFERS_PORT, useExisting: TransfersService },
  { provide: PICKING_PORT, useExisting: PickingService },
  { provide: COUPANG_SHIPMENTS_PORT, useExisting: CoupangShipmentsService },
];

@Module({
  imports: [PrismaModule],
  controllers: [
    InventorySkuSnapshotController,
    SellpiaInventoryImportController,
    SellpiaInventoryFreshnessController,
    SellpiaReceiptBatchController,
    UnshippedController,
    WarehousesController,
    TransfersController,
    PickingController,
    CoupangShipmentsController,
  ],
  providers: [
    SellpiaMasterImportRepositoryAdapter,
    SellpiaInventoryFreshnessRepositoryAdapter,
    InventorySkuSnapshotListRepositoryAdapter,
    SellpiaMasterProductReadRepositoryAdapter,
    UnshippedRepositoryAdapter,
    SellpiaReceiptBatchRepositoryAdapter,
    WarehousesRepositoryAdapter,
    TransfersRepositoryAdapter,
    PickingRepositoryAdapter,
    ConfirmedOrdersRepositoryAdapter,
    LocalCoupangShipmentFilesAdapter,
    InventorySkuSnapshotListService,
    SellpiaMasterProductReadService,
    SellpiaInventoryImportService,
    SellpiaInventoryFreshnessService,
    SellpiaReceiptBatchService,
    UnshippedService,
    WarehousesService,
    TransfersService,
    PickingService,
    CoupangShipmentsService,
    ...REPOSITORY_PORT_BINDINGS,
    ...APPLICATION_PORT_BINDINGS,
  ],
  exports: [
    SELLPIA_MASTER_PRODUCT_READ_PORT,
    SELLPIA_INVENTORY_REFRESH_REQUEST_PORT,
    SELLPIA_INVENTORY_FRESHNESS_GATE_PORT,
  ],
})
export class InventoryModule {}
