import { Module } from '@nestjs/common';
import { AlertsModule } from '../alerts/alerts.module';
import { PrismaModule } from '../prisma/prisma.module';
import { InventoryFreshnessRuntimeModule } from './inventory-freshness-runtime.module';
import { CoupangShipmentsController } from './adapter/in/http/coupang-shipments.controller';
import { InventorySkuSnapshotController } from './adapter/in/http/inventory-sku-snapshot.controller';
import { SellpiaInventoryImportController } from './adapter/in/http/sellpia-inventory-import.controller';
import { SellpiaInventoryFreshnessController } from './adapter/in/http/sellpia-inventory-freshness.controller';
import { TransfersController } from './adapter/in/http/transfers.controller';
import { WarehousesController } from './adapter/in/http/warehouses.controller';
import { ConfirmedChannelComponentReferenceRepositoryAdapter } from './adapter/out/repository/confirmed-channel-component-reference.repository.adapter';
import { SellpiaImportRunRepositoryAdapter } from './adapter/out/repository/sellpia-import-run.repository.adapter';
import { SellpiaSnapshotPublicationRepositoryAdapter } from './adapter/out/repository/sellpia-snapshot-publication.repository.adapter';
import { InventorySkuSnapshotListRepositoryAdapter } from './adapter/out/repository/inventory-sku-snapshot-list.repository.adapter';
import { InventoryAvailabilityRepositoryAdapter } from './adapter/out/repository/inventory-availability.repository.adapter';
import { RocketWorkbookProgressRepositoryAdapter } from './adapter/out/repository/rocket-workbook-progress.repository.adapter';
import { SellpiaInventorySkuReadRepositoryAdapter } from './adapter/out/repository/sellpia-inventory-sku-read.repository.adapter';
import { TransfersRepositoryAdapter } from './adapter/out/repository/transfers.repository.adapter';
import { WarehousesRepositoryAdapter } from './adapter/out/repository/warehouses.repository.adapter';
import { CoupangShipmentDateSummaryRepositoryAdapter } from './adapter/out/repository/coupang-shipment-date-summary.repository.adapter';
import { LocalCoupangShipmentFilesAdapter } from './adapter/out/storage/local-coupang-shipment-files.adapter';
import { COUPANG_SHIPMENTS_PORT } from './application/port/in/fulfillment';
import {
  INVENTORY_SKU_SNAPSHOT_LIST_PORT,
  INVENTORY_AVAILABILITY_PORT,
  ROCKET_WORKBOOK_PROGRESS_PORT,
  SELLPIA_INVENTORY_IMPORT_PORT,
  SELLPIA_INVENTORY_SKU_READ_PORT,
} from './application/port/in/stock';
import { TRANSFERS_PORT, WAREHOUSES_PORT } from './application/port/in/warehouse';
import { CONFIRMED_CHANNEL_COMPONENT_REFERENCE_PORT } from './application/port/out/cross-domain/confirmed-channel-component-reference.port';
import { SELLPIA_IMPORT_RUN_REPOSITORY_PORT } from './application/port/out/repository/sellpia-import-run.repository.port';
import { SELLPIA_SNAPSHOT_PUBLICATION_REPOSITORY_PORT } from './application/port/out/repository/sellpia-snapshot-publication.repository.port';
import { INVENTORY_SKU_SNAPSHOT_LIST_REPOSITORY_PORT } from './application/port/out/repository/inventory-sku-snapshot-list.repository.port';
import { INVENTORY_AVAILABILITY_REPOSITORY_PORT } from './application/port/out/repository/inventory-availability.repository.port';
import { ROCKET_WORKBOOK_PROGRESS_REPOSITORY_PORT } from './application/port/out/repository/rocket-workbook-progress.repository.port';
import { SELLPIA_INVENTORY_SKU_READ_REPOSITORY_PORT } from './application/port/out/repository/sellpia-inventory-sku-read.repository.port';
import { TRANSFERS_REPOSITORY_PORT } from './application/port/out/repository/transfers.repository.port';
import { WAREHOUSES_REPOSITORY_PORT } from './application/port/out/repository/warehouses.repository.port';
import { COUPANG_SHIPMENT_DATE_SUMMARY_REPOSITORY_PORT } from './application/port/out/repository/coupang-shipment-date-summary.repository.port';
import { COUPANG_SHIPMENT_FILE_STORAGE_PORT } from './application/port/out/storage';
import { CoupangShipmentsService } from './application/service/coupang-shipments.service';
import { InventorySkuSnapshotListService } from './application/service/inventory-sku-snapshot-list.service';
import { InventoryAvailabilityService } from './application/service/inventory-availability.service';
import { RocketWorkbookProgressService } from './application/service/rocket-workbook-progress.service';
import { SellpiaInventoryImportService } from './application/service/sellpia-inventory-import.service';
import { SellpiaInventoryFileValidator } from './application/service/sellpia-inventory-file.validator';
import { SellpiaInventorySkuReadService } from './application/service/sellpia-inventory-sku-read.service';
import { TransfersService } from './application/service/transfers.service';
import { WarehousesService } from './application/service/warehouses.service';

const REPOSITORY_PORT_BINDINGS = [
  {
    provide: SELLPIA_IMPORT_RUN_REPOSITORY_PORT,
    useExisting: SellpiaImportRunRepositoryAdapter,
  },
  {
    provide: SELLPIA_SNAPSHOT_PUBLICATION_REPOSITORY_PORT,
    useExisting: SellpiaSnapshotPublicationRepositoryAdapter,
  },
  {
    provide: CONFIRMED_CHANNEL_COMPONENT_REFERENCE_PORT,
    useExisting: ConfirmedChannelComponentReferenceRepositoryAdapter,
  },
  {
    provide: SELLPIA_INVENTORY_SKU_READ_REPOSITORY_PORT,
    useExisting: SellpiaInventorySkuReadRepositoryAdapter,
  },
  {
    provide: INVENTORY_SKU_SNAPSHOT_LIST_REPOSITORY_PORT,
    useExisting: InventorySkuSnapshotListRepositoryAdapter,
  },
  {
    provide: INVENTORY_AVAILABILITY_REPOSITORY_PORT,
    useExisting: InventoryAvailabilityRepositoryAdapter,
  },
  {
    provide: ROCKET_WORKBOOK_PROGRESS_REPOSITORY_PORT,
    useExisting: RocketWorkbookProgressRepositoryAdapter,
  },
  { provide: WAREHOUSES_REPOSITORY_PORT, useExisting: WarehousesRepositoryAdapter },
  { provide: TRANSFERS_REPOSITORY_PORT, useExisting: TransfersRepositoryAdapter },
  { provide: COUPANG_SHIPMENT_FILE_STORAGE_PORT, useExisting: LocalCoupangShipmentFilesAdapter },
  {
    provide: COUPANG_SHIPMENT_DATE_SUMMARY_REPOSITORY_PORT,
    useExisting: CoupangShipmentDateSummaryRepositoryAdapter,
  },
];

const APPLICATION_PORT_BINDINGS = [
  { provide: SELLPIA_INVENTORY_SKU_READ_PORT, useExisting: SellpiaInventorySkuReadService },
  { provide: INVENTORY_SKU_SNAPSHOT_LIST_PORT, useExisting: InventorySkuSnapshotListService },
  { provide: SELLPIA_INVENTORY_IMPORT_PORT, useExisting: SellpiaInventoryImportService },
  { provide: INVENTORY_AVAILABILITY_PORT, useExisting: InventoryAvailabilityService },
  { provide: ROCKET_WORKBOOK_PROGRESS_PORT, useExisting: RocketWorkbookProgressService },
  { provide: WAREHOUSES_PORT, useExisting: WarehousesService },
  { provide: TRANSFERS_PORT, useExisting: TransfersService },
  { provide: COUPANG_SHIPMENTS_PORT, useExisting: CoupangShipmentsService },
];

@Module({
  imports: [InventoryFreshnessRuntimeModule, AlertsModule, PrismaModule],
  controllers: [
    InventorySkuSnapshotController,
    SellpiaInventoryImportController,
    SellpiaInventoryFreshnessController,
    WarehousesController,
    TransfersController,
    CoupangShipmentsController,
  ],
  providers: [
    SellpiaImportRunRepositoryAdapter,
    SellpiaSnapshotPublicationRepositoryAdapter,
    ConfirmedChannelComponentReferenceRepositoryAdapter,
    InventorySkuSnapshotListRepositoryAdapter,
    InventoryAvailabilityRepositoryAdapter,
    RocketWorkbookProgressRepositoryAdapter,
    SellpiaInventorySkuReadRepositoryAdapter,
    WarehousesRepositoryAdapter,
    TransfersRepositoryAdapter,
    LocalCoupangShipmentFilesAdapter,
    CoupangShipmentDateSummaryRepositoryAdapter,
    InventorySkuSnapshotListService,
    InventoryAvailabilityService,
    RocketWorkbookProgressService,
    SellpiaInventorySkuReadService,
    SellpiaInventoryImportService,
    SellpiaInventoryFileValidator,
    WarehousesService,
    TransfersService,
    CoupangShipmentsService,
    ...REPOSITORY_PORT_BINDINGS,
    ...APPLICATION_PORT_BINDINGS,
  ],
  exports: [
    SELLPIA_INVENTORY_SKU_READ_PORT,
    InventoryFreshnessRuntimeModule,
    INVENTORY_AVAILABILITY_PORT,
    ROCKET_WORKBOOK_PROGRESS_PORT,
  ],
})
export class InventoryModule {}
