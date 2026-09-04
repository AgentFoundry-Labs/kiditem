import 'reflect-metadata';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PrismaModule } from '../../prisma/prisma.module';
import { AlertsModule } from '../../alerts/alerts.module';
import { CoupangShipmentsController } from '../adapter/in/http/coupang-shipments.controller';
import { InventorySkuSnapshotController } from '../adapter/in/http/inventory-sku-snapshot.controller';
import { SellpiaInventoryImportController } from '../adapter/in/http/sellpia-inventory-import.controller';
import { SellpiaInventoryFreshnessController } from '../adapter/in/http/sellpia-inventory-freshness.controller';
import { TransfersController } from '../adapter/in/http/transfers.controller';
import { WarehousesController } from '../adapter/in/http/warehouses.controller';
import { ConfirmedChannelComponentReferenceRepositoryAdapter } from '../adapter/out/repository/confirmed-channel-component-reference.repository.adapter';
import { SellpiaImportRunRepositoryAdapter } from '../adapter/out/repository/sellpia-import-run.repository.adapter';
import { SellpiaSnapshotPublicationRepositoryAdapter } from '../adapter/out/repository/sellpia-snapshot-publication.repository.adapter';
import { SellpiaInventoryFreshnessRepositoryAdapter } from '../adapter/out/repository/sellpia-inventory-freshness.repository.adapter';
import { InventorySkuSnapshotListRepositoryAdapter } from '../adapter/out/repository/inventory-sku-snapshot-list.repository.adapter';
import { InventoryAvailabilityRepositoryAdapter } from '../adapter/out/repository/inventory-availability.repository.adapter';
import { RocketWorkbookProgressRepositoryAdapter } from '../adapter/out/repository/rocket-workbook-progress.repository.adapter';
import { SellpiaInventorySkuReadRepositoryAdapter } from '../adapter/out/repository/sellpia-inventory-sku-read.repository.adapter';
import { TransfersRepositoryAdapter } from '../adapter/out/repository/transfers.repository.adapter';
import { WarehousesRepositoryAdapter } from '../adapter/out/repository/warehouses.repository.adapter';
import { INVENTORY_SKU_SNAPSHOT_LIST_PORT } from '../application/port/in/stock/inventory-sku-snapshot-list.port';
import { INVENTORY_AVAILABILITY_PORT } from '../application/port/in/stock/inventory-availability.port';
import { SELLPIA_INVENTORY_SKU_READ_PORT } from '../application/port/in/stock/sellpia-inventory-sku-read.port';
import { SELLPIA_INVENTORY_IMPORT_PORT } from '../application/port/in/stock/sellpia-inventory-import.port';
import { SELLPIA_INVENTORY_FRESHNESS_PORT } from '../application/port/in/stock/sellpia-inventory-freshness.port';
import { SELLPIA_INVENTORY_FRESHNESS_GATE_PORT } from '../application/port/in/stock/sellpia-inventory-freshness-gate.port';
import { ROCKET_WORKBOOK_PROGRESS_PORT } from '../application/port/in/stock/rocket-workbook-progress.port';
import { CONFIRMED_CHANNEL_COMPONENT_REFERENCE_PORT } from '../application/port/out/cross-domain/confirmed-channel-component-reference.port';
import { SELLPIA_IMPORT_RUN_REPOSITORY_PORT } from '../application/port/out/repository/sellpia-import-run.repository.port';
import { SELLPIA_SNAPSHOT_PUBLICATION_REPOSITORY_PORT } from '../application/port/out/repository/sellpia-snapshot-publication.repository.port';
import { INVENTORY_SKU_SNAPSHOT_LIST_REPOSITORY_PORT } from '../application/port/out/repository/inventory-sku-snapshot-list.repository.port';
import { INVENTORY_AVAILABILITY_REPOSITORY_PORT } from '../application/port/out/repository/inventory-availability.repository.port';
import { SELLPIA_INVENTORY_SKU_READ_REPOSITORY_PORT } from '../application/port/out/repository/sellpia-inventory-sku-read.repository.port';
import { SELLPIA_INVENTORY_FRESHNESS_REPOSITORY_PORT } from '../application/port/out/repository/sellpia-inventory-freshness.repository.port';
import { ROCKET_WORKBOOK_PROGRESS_REPOSITORY_PORT } from '../application/port/out/repository/rocket-workbook-progress.repository.port';
import { InventorySkuSnapshotListService } from '../application/service/inventory-sku-snapshot-list.service';
import { InventoryAvailabilityService } from '../application/service/inventory-availability.service';
import { RocketWorkbookProgressService } from '../application/service/rocket-workbook-progress.service';
import { SellpiaInventorySkuReadService } from '../application/service/sellpia-inventory-sku-read.service';
import { SellpiaInventoryImportService } from '../application/service/sellpia-inventory-import.service';
import { SellpiaInventoryFileValidator } from '../application/service/sellpia-inventory-file.validator';
import { SellpiaInventoryFreshnessService } from '../application/service/sellpia-inventory-freshness.service';
import { TransfersService } from '../application/service/transfers.service';
import { WarehousesService } from '../application/service/warehouses.service';
import { InventoryModule } from '../inventory.module';
import { InventoryFreshnessRuntimeModule } from '../inventory-freshness-runtime.module';

const IMPORTS_KEY = 'imports';
const CONTROLLERS_KEY = 'controllers';
const PROVIDERS_KEY = 'providers';
const EXPORTS_KEY = 'exports';
const PATH_KEY = 'path';
const INVENTORY_ROOT = path.resolve(__dirname, '..');

const FORBIDDEN_LEGACY_FILES = [
  'adapter/in/http/inventory-items.controller.ts',
  'adapter/in/http/inventory-assets.controller.ts',
  'adapter/in/http/inventory-stock-mutations.controller.ts',
  'adapter/in/http/inventory-transactions.controller.ts',
  'adapter/in/http/rocket-inventory.controller.ts',
  'adapter/in/http/audits.controller.ts',
  'application/service/inventory.service.ts',
  'application/service/audits.service.ts',
  'adapter/out/repository/inventory.repository.adapter.ts',
  'adapter/out/repository/inventory-query.repository.adapter.ts',
  'adapter/out/repository/audits.repository.adapter.ts',
  'adapter/out/repository/sellpia-master-import.repository.adapter.ts',
  'application/port/out/repository/sellpia-master-import.repository.port.ts',
  'adapter/in/operation/coupang-shipment-summary.operation-handler.ts',
  'adapter/in/operation/sellpia-inventory.operation-handler.ts',
  'adapter/out/automation/operation-alert.adapter.ts',
] as const;

describe('InventoryModule authoritative capability wiring', () => {
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

    expect(imports).toEqual([PrismaModule, AlertsModule]);
    expect(providers).toEqual([
      SellpiaInventoryFreshnessRepositoryAdapter,
      SellpiaInventoryFreshnessService,
      {
        provide: SELLPIA_INVENTORY_FRESHNESS_REPOSITORY_PORT,
        useExisting: SellpiaInventoryFreshnessRepositoryAdapter,
      },
      {
        provide: SELLPIA_INVENTORY_FRESHNESS_PORT,
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
      SellpiaInventoryImportController,
      SellpiaInventoryFreshnessController,
      WarehousesController,
      TransfersController,
      CoupangShipmentsController,
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
      ConfirmedChannelComponentReferenceRepositoryAdapter,
      SellpiaInventoryFreshnessRepositoryAdapter,
      InventorySkuSnapshotListRepositoryAdapter,
      InventoryAvailabilityRepositoryAdapter,
      RocketWorkbookProgressRepositoryAdapter,
      SellpiaInventorySkuReadRepositoryAdapter,
      WarehousesRepositoryAdapter,
      TransfersRepositoryAdapter,
      InventorySkuSnapshotListService,
      InventoryAvailabilityService,
      RocketWorkbookProgressService,
      SellpiaInventorySkuReadService,
      SellpiaInventoryImportService,
      SellpiaInventoryFileValidator,
      SellpiaInventoryFreshnessService,
      WarehousesService,
      TransfersService,
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
    const providers: unknown[] = Reflect.getMetadata(PROVIDERS_KEY, InventoryModule) ?? [];
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
      provide: CONFIRMED_CHANNEL_COMPONENT_REFERENCE_PORT,
      useExisting: ConfirmedChannelComponentReferenceRepositoryAdapter,
    });
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
      SELLPIA_INVENTORY_FRESHNESS_PORT,
      SELLPIA_INVENTORY_FRESHNESS_GATE_PORT,
    ]) {
      expect(providers).toContainEqual({
        provide: port,
        useExisting: SellpiaInventoryFreshnessService,
      });
    }
    expect(Reflect.getMetadata(EXPORTS_KEY, InventoryFreshnessRuntimeModule) ?? [])
      .toEqual([
        SELLPIA_INVENTORY_FRESHNESS_PORT,
        SELLPIA_INVENTORY_FRESHNESS_GATE_PORT,
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
    expect(Reflect.getMetadata(PATH_KEY, SellpiaInventoryImportController)).toBe('inventory/sellpia-sync');
    expect(Reflect.getMetadata(PATH_KEY, SellpiaInventoryFreshnessController)).toBe('inventory/sellpia-freshness');
    expect(Reflect.getMetadata(PATH_KEY, WarehousesController)).toBe('warehouses');
    expect(Reflect.getMetadata(PATH_KEY, TransfersController)).toBe('stock-transfers');
    expect(Reflect.getMetadata(PATH_KEY, CoupangShipmentsController)).toBe('coupang-shipments');
  });
});
