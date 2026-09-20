import 'reflect-metadata';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PrismaModule } from '../../prisma/prisma.module';
import { AlertsModule } from '../../alerts/alerts.module';
import { InventorySkuSnapshotController } from '../adapter/in/web/inventory-sku-snapshot.controller';
import { SellpiaInventorySourceController } from '../adapter/in/web/sellpia-inventory-source.controller';
import { SellpiaInventoryFreshnessController } from '../adapter/in/web/sellpia-inventory-freshness.controller';
import { TransfersController } from '../adapter/in/web/transfers.controller';
import { WarehousesController } from '../adapter/in/web/warehouses.controller';
import { SellpiaImportRunRepositoryAdapter } from '../adapter/out/persistence/sellpia-import-run.repository.adapter';
import { SellpiaSnapshotPublicationRepositoryAdapter } from '../adapter/out/persistence/sellpia-snapshot-publication.repository.adapter';
import { SellpiaInventoryFreshnessRepositoryAdapter } from '../adapter/out/persistence/sellpia-inventory-freshness.repository.adapter';
import { InventorySkuSnapshotListRepositoryAdapter } from '../adapter/out/persistence/inventory-sku-snapshot-list.repository.adapter';
import { InventoryAvailabilityRepositoryAdapter } from '../adapter/out/persistence/inventory-availability.repository.adapter';
import { RocketWorkbookProgressRepositoryAdapter } from '../adapter/out/persistence/rocket-workbook-progress.repository.adapter';
import { SellpiaInventorySkuReadRepositoryAdapter } from '../adapter/out/persistence/sellpia-inventory-sku-read.repository.adapter';
import { TransfersRepositoryAdapter } from '../adapter/out/persistence/transfers.repository.adapter';
import { WarehousesRepositoryAdapter } from '../adapter/out/persistence/warehouses.repository.adapter';
import { InventoryTransactionalReadRepositoryAdapter } from '../adapter/out/persistence/inventory-transactional-read.repository.adapter';
import { INVENTORY_SKU_SNAPSHOT_LIST_PORT } from '../application/port/in/stock/inventory-sku-snapshot-list.port';
import { INVENTORY_SKU_EXPORT_PORT } from '../application/port/in/stock/inventory-sku-export.port';
import { INVENTORY_AVAILABILITY_PORT } from '../application/port/in/stock/inventory-availability.port';
import { SELLPIA_INVENTORY_SKU_READ_PORT } from '../application/port/in/stock/sellpia-inventory-sku-read.port';
import { SELLPIA_INVENTORY_IMPORT_PORT } from '../application/port/in/stock/sellpia-inventory-import.port';
import { SELLPIA_INVENTORY_FRESHNESS_GATE_PORT } from '../application/port/in/stock/sellpia-inventory-freshness-gate.port';
import { SELLPIA_INVENTORY_COLLECTION_STATUS_PORT } from '../application/port/in/stock/sellpia-inventory-freshness.port';
import { ROCKET_WORKBOOK_PROGRESS_PORT } from '../application/port/in/stock/rocket-workbook-progress.port';
import { INVENTORY_TRANSACTIONAL_READ_PORT } from '../application/port/in/stock/inventory-transactional-read.port';
import { SELLPIA_IMPORT_RUN_REPOSITORY_PORT } from '../application/port/out/persistence/sellpia-import-run.repository.port';
import { SELLPIA_SNAPSHOT_PUBLICATION_REPOSITORY_PORT } from '../application/port/out/persistence/sellpia-snapshot-publication.repository.port';
import { INVENTORY_SKU_SNAPSHOT_LIST_REPOSITORY_PORT } from '../application/port/out/persistence/inventory-sku-snapshot-list.repository.port';
import { INVENTORY_AVAILABILITY_REPOSITORY_PORT } from '../application/port/out/persistence/inventory-availability.repository.port';
import { SELLPIA_INVENTORY_SKU_READ_REPOSITORY_PORT } from '../application/port/out/persistence/sellpia-inventory-sku-read.repository.port';
import { SELLPIA_INVENTORY_FRESHNESS_REPOSITORY_PORT } from '../application/port/out/persistence/sellpia-inventory-freshness.repository.port';
import { ROCKET_WORKBOOK_PROGRESS_REPOSITORY_PORT } from '../application/port/out/persistence/rocket-workbook-progress.repository.port';
import { InventorySkuSnapshotListService } from '../application/usecase/inventory-sku-snapshot-list.service';
import { InventorySkuExportService } from '../application/usecase/inventory-sku-export.service';
import { InventoryAvailabilityService } from '../application/usecase/inventory-availability.service';
import { RocketWorkbookProgressService } from '../application/usecase/rocket-workbook-progress.service';
import { SellpiaInventorySkuReadService } from '../application/usecase/sellpia-inventory-sku-read.service';
import { SellpiaInventoryImportService } from '../application/usecase/sellpia-inventory-import.service';
import { SellpiaInventoryFileValidator } from '../application/usecase/sellpia-inventory-file.validator';
import { SellpiaInventoryFreshnessService } from '../application/usecase/sellpia-inventory-freshness.service';
import { TransfersService } from '../application/usecase/transfers.service';
import { WarehousesService } from '../application/usecase/warehouses.service';
import { InventoryModule } from '../inventory.module';
import { InventoryFreshnessRuntimeModule } from '../inventory-freshness-runtime.module';

const IMPORTS_KEY = 'imports';
const CONTROLLERS_KEY = 'controllers';
const PROVIDERS_KEY = 'providers';
const EXPORTS_KEY = 'exports';
const PATH_KEY = 'path';
const INVENTORY_ROOT = path.resolve(__dirname, '..');

const FORBIDDEN_LEGACY_FILES = [
  'adapter/in/web/inventory-items.controller.ts',
  'adapter/in/web/inventory-assets.controller.ts',
  'adapter/in/web/inventory-stock-mutations.controller.ts',
  'adapter/in/web/inventory-transactions.controller.ts',
  'adapter/in/web/rocket-inventory.controller.ts',
  'adapter/in/web/audits.controller.ts',
  'application/usecase/inventory.service.ts',
  'application/usecase/audits.service.ts',
  'adapter/out/persistence/inventory.repository.adapter.ts',
  'adapter/out/persistence/inventory-query.repository.adapter.ts',
  'adapter/out/persistence/audits.repository.adapter.ts',
  'adapter/out/persistence/sellpia-master-import.repository.adapter.ts',
  'application/port/out/persistence/sellpia-master-import.repository.port.ts',
  'adapter/in/operation/coupang-shipment-summary.operation-handler.ts',
  'adapter/in/operation/sellpia-inventory.operation-handler.ts',
  'adapter/out/automation/operation-alert.adapter.ts',
] as const;

describe('InventoryModule authoritative capability wiring', () => {
  it('does not expose manual import or transfer status mutation routes', () => {
    const controllers: Array<{ prototype: object }> = Reflect.getMetadata(CONTROLLERS_KEY, InventoryModule) ?? [];
    expect(controllers.map(controller => Reflect.getMetadata(PATH_KEY, controller)))
      .not.toContain('inventory/sellpia-sync');
    const methods = Object.getOwnPropertyNames(TransfersController.prototype)
      .filter(name => name !== 'constructor')
      .map(name => Reflect.getMetadata('method',
        TransfersController.prototype[name as keyof TransfersController]));
    expect(methods).not.toContain(4); // Nest RequestMethod.PATCH
  });

  it('imports Prisma, focused Alerts, and the controller-free freshness runtime', () => {
    const imports: unknown[] = Reflect.getMetadata(IMPORTS_KEY, InventoryModule) ?? [];
    expect(new Set(imports)).toEqual(new Set([
      InventoryFreshnessRuntimeModule,
      AlertsModule,
      PrismaModule,
    ]));
  });

  it('keeps the freshness runtime free of legacy Operation and alert adapters', () => {
    const imports: unknown[] = Reflect.getMetadata(
      IMPORTS_KEY,
      InventoryFreshnessRuntimeModule,
    ) ?? [];
    const providers: unknown[] = Reflect.getMetadata(
      PROVIDERS_KEY,
      InventoryFreshnessRuntimeModule,
    ) ?? [];

    expect(imports).toEqual([PrismaModule]);
    expect(providers).toEqual([
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
    ]);
  });

  it('mounts only snapshot/import and record-only capability controllers', () => {
    const controllers: unknown[] = Reflect.getMetadata(CONTROLLERS_KEY, InventoryModule) ?? [];
    expect(new Set(controllers)).toEqual(new Set([
      InventorySkuSnapshotController,
      SellpiaInventorySourceController,
      SellpiaInventoryFreshnessController,
      WarehousesController,
      TransfersController,
    ]));
  });

  it('declares retained repositories and services', () => {
    const providers: unknown[] = [
      ...(Reflect.getMetadata(PROVIDERS_KEY, InventoryModule) ?? []),
      ...(Reflect.getMetadata(PROVIDERS_KEY, InventoryFreshnessRuntimeModule) ?? []),
    ];
    for (const provider of [
      SellpiaImportRunRepositoryAdapter,
      SellpiaSnapshotPublicationRepositoryAdapter,
      SellpiaInventoryFreshnessRepositoryAdapter,
      InventorySkuSnapshotListRepositoryAdapter,
      InventoryAvailabilityRepositoryAdapter,
      RocketWorkbookProgressRepositoryAdapter,
      SellpiaInventorySkuReadRepositoryAdapter,
      WarehousesRepositoryAdapter,
      TransfersRepositoryAdapter,
      InventorySkuSnapshotListService,
      InventorySkuExportService,
      InventoryAvailabilityService,
      RocketWorkbookProgressService,
      SellpiaInventorySkuReadService,
      SellpiaInventoryImportService,
      SellpiaInventoryFileValidator,
      SellpiaInventoryFreshnessService,
      WarehousesService,
      TransfersService,
      InventoryTransactionalReadRepositoryAdapter,
    ]) {
      expect(providers).toContain(provider);
    }
  });

  it('binds the authoritative owner read', () => {
    const providers: unknown[] = Reflect.getMetadata(PROVIDERS_KEY, InventoryModule) ?? [];
    expect(providers).toContainEqual({
      provide: INVENTORY_SKU_SNAPSHOT_LIST_PORT,
      useExisting: InventorySkuSnapshotListService,
    });
    expect(providers).toContainEqual({
      provide: INVENTORY_SKU_EXPORT_PORT,
      useExisting: InventorySkuExportService,
    });
    expect(providers).toContainEqual({
      provide: INVENTORY_SKU_SNAPSHOT_LIST_REPOSITORY_PORT,
      useExisting: InventorySkuSnapshotListRepositoryAdapter,
    });
    expect(providers).toContainEqual({
      provide: SELLPIA_INVENTORY_SKU_READ_PORT,
      useExisting: SellpiaInventorySkuReadService,
    });
    expect(providers).toContainEqual({
      provide: SELLPIA_INVENTORY_SKU_READ_REPOSITORY_PORT,
      useExisting: SellpiaInventorySkuReadRepositoryAdapter,
    });
  });

  it('binds and exports physical availability ownership', () => {
    const providers: unknown[] = Reflect.getMetadata(
      PROVIDERS_KEY,
      InventoryFreshnessRuntimeModule,
    ) ?? [];
    expect(providers).toContainEqual({
      provide: INVENTORY_AVAILABILITY_REPOSITORY_PORT,
      useExisting: InventoryAvailabilityRepositoryAdapter,
    });
    expect(providers).toContainEqual({
      provide: INVENTORY_AVAILABILITY_PORT,
      useExisting: InventoryAvailabilityService,
    });
  });

  it('binds and exports Rocket workbook progress without exposing persistence', () => {
    const providers: unknown[] = Reflect.getMetadata(PROVIDERS_KEY, InventoryModule) ?? [];
    expect(providers).toContainEqual({
      provide: ROCKET_WORKBOOK_PROGRESS_REPOSITORY_PORT,
      useExisting: RocketWorkbookProgressRepositoryAdapter,
    });
    expect(providers).toContainEqual({
      provide: ROCKET_WORKBOOK_PROGRESS_PORT,
      useExisting: RocketWorkbookProgressService,
    });
    expect(Reflect.getMetadata(EXPORTS_KEY, InventoryModule) ?? [])
      .toContain(ROCKET_WORKBOOK_PROGRESS_PORT);
  });

  it('keeps the Sellpia importer isolated', () => {
    const providers: unknown[] = Reflect.getMetadata(PROVIDERS_KEY, InventoryModule) ?? [];
    expect(providers).toContainEqual({
      provide: SELLPIA_INVENTORY_IMPORT_PORT,
      useExisting: SellpiaInventoryImportService,
    });
    expect(providers).toContainEqual({
      provide: SELLPIA_IMPORT_RUN_REPOSITORY_PORT,
      useExisting: SellpiaImportRunRepositoryAdapter,
    });
    expect(providers).toContainEqual({
      provide: SELLPIA_SNAPSHOT_PUBLICATION_REPOSITORY_PORT,
      useExisting: SellpiaSnapshotPublicationRepositoryAdapter,
    });
    expect(providers).toContainEqual({
      provide: INVENTORY_TRANSACTIONAL_READ_PORT,
      useExisting: InventoryTransactionalReadRepositoryAdapter,
    });
    expect(Reflect.getMetadata(EXPORTS_KEY, InventoryModule) ?? [])
      .toContain(INVENTORY_TRANSACTIONAL_READ_PORT);
  });

  it('binds freshness ownership and exports only the cross-domain inventory gates', () => {
    const providers: unknown[] = Reflect.getMetadata(
      PROVIDERS_KEY,
      InventoryFreshnessRuntimeModule,
    ) ?? [];
    expect(providers).toContainEqual({
      provide: SELLPIA_INVENTORY_FRESHNESS_REPOSITORY_PORT,
      useExisting: SellpiaInventoryFreshnessRepositoryAdapter,
    });
    for (const port of [
        SELLPIA_INVENTORY_COLLECTION_STATUS_PORT,
      SELLPIA_INVENTORY_FRESHNESS_GATE_PORT,
    ]) {
      expect(providers).toContainEqual({
        provide: port,
        useExisting: SellpiaInventoryFreshnessService,
      });
    }
    expect(Reflect.getMetadata(EXPORTS_KEY, InventoryFreshnessRuntimeModule) ?? [])
      .toEqual([
        SELLPIA_INVENTORY_COLLECTION_STATUS_PORT,
        SELLPIA_INVENTORY_FRESHNESS_GATE_PORT,
        INVENTORY_AVAILABILITY_PORT,
      ]);
    expect(Reflect.getMetadata(EXPORTS_KEY, InventoryModule) ?? [])
      .toContain(InventoryFreshnessRuntimeModule);
  });

  it('has no executable legacy inventory runtime', () => {
    expect(FORBIDDEN_LEGACY_FILES.filter((file) =>
      existsSync(path.join(INVENTORY_ROOT, file)))).toEqual([]);
  });

  it('preserves the public routes that remain truthful', () => {
    expect(Reflect.getMetadata(PATH_KEY, InventorySkuSnapshotController)).toBe('inventory');
    expect(Reflect.getMetadata(PATH_KEY, SellpiaInventoryFreshnessController)).toBe('inventory/sellpia-collection-status');
    expect(Reflect.getMetadata(PATH_KEY, WarehousesController)).toBe('warehouses');
    expect(Reflect.getMetadata(PATH_KEY, TransfersController)).toBe('stock-transfers');
  });
});
