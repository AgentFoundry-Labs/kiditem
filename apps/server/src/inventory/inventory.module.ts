import { Module } from '@nestjs/common';
import { AlertsModule } from '../alerts/alerts.module';
import { PrismaModule } from '../prisma/prisma.module';
import { InventoryFreshnessRuntimeModule } from './inventory-freshness-runtime.module';
import { InventorySkuSnapshotController } from './adapter/in/web/inventory-sku-snapshot.controller';
import { SellpiaInventorySourceController } from './adapter/in/web/sellpia-inventory-source.controller';
import { SellpiaInventoryFreshnessController } from './adapter/in/web/sellpia-inventory-freshness.controller';
import { TransfersController } from './adapter/in/web/transfers.controller';
import { WarehousesController } from './adapter/in/web/warehouses.controller';
import { SellpiaImportRunRepositoryAdapter } from './adapter/out/persistence/sellpia-import-run.repository.adapter';
import { SellpiaSnapshotPublicationRepositoryAdapter } from './adapter/out/persistence/sellpia-snapshot-publication.repository.adapter';
import { InventorySkuSnapshotListRepositoryAdapter } from './adapter/out/persistence/inventory-sku-snapshot-list.repository.adapter';
import { RocketWorkbookProgressRepositoryAdapter } from './adapter/out/persistence/rocket-workbook-progress.repository.adapter';
import { SellpiaInventorySkuReadRepositoryAdapter } from './adapter/out/persistence/sellpia-inventory-sku-read.repository.adapter';
import { TransfersRepositoryAdapter } from './adapter/out/persistence/transfers.repository.adapter';
import { WarehousesRepositoryAdapter } from './adapter/out/persistence/warehouses.repository.adapter';
import { InventoryTransactionalReadRepositoryAdapter } from './adapter/out/persistence/inventory-transactional-read.repository.adapter';
import {
  INVENTORY_SKU_SNAPSHOT_LIST_PORT,
  INVENTORY_SKU_EXPORT_PORT,
  ROCKET_WORKBOOK_PROGRESS_PORT,
  SELLPIA_INVENTORY_IMPORT_PORT,
  SELLPIA_INVENTORY_SKU_READ_PORT,
  INVENTORY_TRANSACTIONAL_READ_PORT,
} from './application/port/in/stock';
import { TRANSFERS_PORT, WAREHOUSES_PORT } from './application/port/in/warehouse';
import { SELLPIA_IMPORT_RUN_REPOSITORY_PORT } from './application/port/out/persistence/sellpia-import-run.repository.port';
import { SELLPIA_SNAPSHOT_PUBLICATION_REPOSITORY_PORT } from './application/port/out/persistence/sellpia-snapshot-publication.repository.port';
import { INVENTORY_SKU_SNAPSHOT_LIST_REPOSITORY_PORT } from './application/port/out/persistence/inventory-sku-snapshot-list.repository.port';
import { ROCKET_WORKBOOK_PROGRESS_REPOSITORY_PORT } from './application/port/out/persistence/rocket-workbook-progress.repository.port';
import { SELLPIA_INVENTORY_SKU_READ_REPOSITORY_PORT } from './application/port/out/persistence/sellpia-inventory-sku-read.repository.port';
import { TRANSFERS_REPOSITORY_PORT } from './application/port/out/persistence/transfers.repository.port';
import { WAREHOUSES_REPOSITORY_PORT } from './application/port/out/persistence/warehouses.repository.port';
import { InventorySkuSnapshotListService } from './application/usecase/inventory-sku-snapshot-list.service';
import { InventorySkuExportService } from './application/usecase/inventory-sku-export.service';
import { RocketWorkbookProgressService } from './application/usecase/rocket-workbook-progress.service';
import { SellpiaInventoryImportService } from './application/usecase/sellpia-inventory-import.service';
import { SellpiaInventoryFileValidator } from './application/usecase/sellpia-inventory-file.validator';
import { SellpiaInventorySkuReadService } from './application/usecase/sellpia-inventory-sku-read.service';
import { TransfersService } from './application/usecase/transfers.service';
import { WarehousesService } from './application/usecase/warehouses.service';

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
    provide: SELLPIA_INVENTORY_SKU_READ_REPOSITORY_PORT,
    useExisting: SellpiaInventorySkuReadRepositoryAdapter,
  },
  {
    provide: INVENTORY_SKU_SNAPSHOT_LIST_REPOSITORY_PORT,
    useExisting: InventorySkuSnapshotListRepositoryAdapter,
  },
  {
    provide: ROCKET_WORKBOOK_PROGRESS_REPOSITORY_PORT,
    useExisting: RocketWorkbookProgressRepositoryAdapter,
  },
  { provide: WAREHOUSES_REPOSITORY_PORT, useExisting: WarehousesRepositoryAdapter },
  { provide: TRANSFERS_REPOSITORY_PORT, useExisting: TransfersRepositoryAdapter },
];

const APPLICATION_PORT_BINDINGS = [
  { provide: SELLPIA_INVENTORY_SKU_READ_PORT, useExisting: SellpiaInventorySkuReadService },
  { provide: INVENTORY_SKU_SNAPSHOT_LIST_PORT, useExisting: InventorySkuSnapshotListService },
  { provide: INVENTORY_SKU_EXPORT_PORT, useExisting: InventorySkuExportService },
  { provide: SELLPIA_INVENTORY_IMPORT_PORT, useExisting: SellpiaInventoryImportService },
  { provide: ROCKET_WORKBOOK_PROGRESS_PORT, useExisting: RocketWorkbookProgressService },
  { provide: WAREHOUSES_PORT, useExisting: WarehousesService },
  { provide: TRANSFERS_PORT, useExisting: TransfersService },
  {
    provide: INVENTORY_TRANSACTIONAL_READ_PORT,
    useExisting: InventoryTransactionalReadRepositoryAdapter,
  },
];

@Module({
  imports: [InventoryFreshnessRuntimeModule, AlertsModule, PrismaModule],
  controllers: [
    InventorySkuSnapshotController,
    SellpiaInventorySourceController,
    SellpiaInventoryFreshnessController,
    WarehousesController,
    TransfersController,
  ],
  providers: [
    SellpiaImportRunRepositoryAdapter,
    SellpiaSnapshotPublicationRepositoryAdapter,
    InventorySkuSnapshotListRepositoryAdapter,
    RocketWorkbookProgressRepositoryAdapter,
    SellpiaInventorySkuReadRepositoryAdapter,
    WarehousesRepositoryAdapter,
    TransfersRepositoryAdapter,
    InventoryTransactionalReadRepositoryAdapter,
    InventorySkuSnapshotListService,
    InventorySkuExportService,
    RocketWorkbookProgressService,
    SellpiaInventorySkuReadService,
    SellpiaInventoryImportService,
    SellpiaInventoryFileValidator,
    WarehousesService,
    TransfersService,
    ...REPOSITORY_PORT_BINDINGS,
    ...APPLICATION_PORT_BINDINGS,
  ],
  exports: [
    INVENTORY_SKU_SNAPSHOT_LIST_PORT,
    SELLPIA_INVENTORY_SKU_READ_PORT,
    InventoryFreshnessRuntimeModule,
    ROCKET_WORKBOOK_PROGRESS_PORT,
    INVENTORY_TRANSACTIONAL_READ_PORT,
  ],
})
export class InventoryModule {}
