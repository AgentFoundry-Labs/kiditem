import 'reflect-metadata';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CoupangShipmentsController } from '../adapter/in/http/coupang-shipments.controller';
import { InventorySkuSnapshotController } from '../adapter/in/http/inventory-sku-snapshot.controller';
import { PickingController } from '../adapter/in/http/picking.controller';
import { SellpiaInventoryImportController } from '../adapter/in/http/sellpia-inventory-import.controller';
import { SellpiaInventoryFreshnessController } from '../adapter/in/http/sellpia-inventory-freshness.controller';
import { SellpiaReceiptBatchController } from '../adapter/in/http/sellpia-receipt-batch.controller';
import { TransfersController } from '../adapter/in/http/transfers.controller';
import { UnshippedController } from '../adapter/in/http/unshipped.controller';
import { WarehousesController } from '../adapter/in/http/warehouses.controller';
import { ConfirmedOrdersRepositoryAdapter } from '../adapter/out/repository/confirmed-orders.repository.adapter';
import { ConfirmedChannelComponentReferenceRepositoryAdapter } from '../adapter/out/repository/confirmed-channel-component-reference.repository.adapter';
import { SellpiaImportRunRepositoryAdapter } from '../adapter/out/repository/sellpia-import-run.repository.adapter';
import { SellpiaSnapshotPublicationRepositoryAdapter } from '../adapter/out/repository/sellpia-snapshot-publication.repository.adapter';
import { SellpiaInventoryFreshnessRepositoryAdapter } from '../adapter/out/repository/sellpia-inventory-freshness.repository.adapter';
import { InventorySkuSnapshotListRepositoryAdapter } from '../adapter/out/repository/inventory-sku-snapshot-list.repository.adapter';
import { InventoryCommitmentRepositoryAdapter } from '../adapter/out/repository/inventory-commitment.repository.adapter';
import { SellpiaInventorySkuReadRepositoryAdapter } from '../adapter/out/repository/sellpia-inventory-sku-read.repository.adapter';
import { PickingRepositoryAdapter } from '../adapter/out/repository/picking.repository.adapter';
import { SellpiaReceiptBatchRepositoryAdapter } from '../adapter/out/repository/sellpia-receipt-batch.repository.adapter';
import { TransfersRepositoryAdapter } from '../adapter/out/repository/transfers.repository.adapter';
import { UnshippedRepositoryAdapter } from '../adapter/out/repository/unshipped.repository.adapter';
import { WarehousesRepositoryAdapter } from '../adapter/out/repository/warehouses.repository.adapter';
import { INVENTORY_SKU_SNAPSHOT_LIST_PORT } from '../application/port/in/stock/inventory-sku-snapshot-list.port';
import { INVENTORY_AVAILABILITY_PORT } from '../application/port/in/stock/inventory-availability.port';
import { INVENTORY_COMMITMENT_PORT } from '../application/port/in/stock/inventory-commitment.port';
import { SELLPIA_INVENTORY_SKU_READ_PORT } from '../application/port/in/stock/sellpia-inventory-sku-read.port';
import { SELLPIA_INVENTORY_IMPORT_PORT } from '../application/port/in/stock/sellpia-inventory-import.port';
import { SELLPIA_RECEIPT_BATCH_PORT } from '../application/port/in/stock/sellpia-receipt-batch.port';
import { SELLPIA_INVENTORY_FRESHNESS_PORT } from '../application/port/in/stock/sellpia-inventory-freshness.port';
import { SELLPIA_INVENTORY_FRESHNESS_GATE_PORT } from '../application/port/in/stock/sellpia-inventory-freshness-gate.port';
import { SELLPIA_INVENTORY_REFRESH_REQUEST_PORT } from '../application/port/in/stock/sellpia-inventory-refresh-request.port';
import { CONFIRMED_CHANNEL_COMPONENT_REFERENCE_PORT } from '../application/port/out/cross-domain/confirmed-channel-component-reference.port';
import { SELLPIA_IMPORT_RUN_REPOSITORY_PORT } from '../application/port/out/repository/sellpia-import-run.repository.port';
import { SELLPIA_SNAPSHOT_PUBLICATION_REPOSITORY_PORT } from '../application/port/out/repository/sellpia-snapshot-publication.repository.port';
import { INVENTORY_SKU_SNAPSHOT_LIST_REPOSITORY_PORT } from '../application/port/out/repository/inventory-sku-snapshot-list.repository.port';
import { INVENTORY_COMMITMENT_REPOSITORY_PORT } from '../application/port/out/repository/inventory-commitment.repository.port';
import { SELLPIA_INVENTORY_SKU_READ_REPOSITORY_PORT } from '../application/port/out/repository/sellpia-inventory-sku-read.repository.port';
import { SELLPIA_RECEIPT_BATCH_REPOSITORY_PORT } from '../application/port/out/repository/sellpia-receipt-batch.repository.port';
import { SELLPIA_INVENTORY_FRESHNESS_REPOSITORY_PORT } from '../application/port/out/repository/sellpia-inventory-freshness.repository.port';
import { InventorySkuSnapshotListService } from '../application/service/inventory-sku-snapshot-list.service';
import { InventoryCommitmentService } from '../application/service/inventory-commitment.service';
import { SellpiaInventorySkuReadService } from '../application/service/sellpia-inventory-sku-read.service';
import { PickingService } from '../application/service/picking.service';
import { SellpiaInventoryImportService } from '../application/service/sellpia-inventory-import.service';
import { SellpiaInventoryFileValidator } from '../application/service/sellpia-inventory-file.validator';
import { SellpiaReceiptBatchService } from '../application/service/sellpia-receipt-batch.service';
import { SellpiaInventoryFreshnessService } from '../application/service/sellpia-inventory-freshness.service';
import { TransfersService } from '../application/service/transfers.service';
import { UnshippedService } from '../application/service/unshipped.service';
import { WarehousesService } from '../application/service/warehouses.service';
import { InventoryModule } from '../inventory.module';

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
] as const;

describe('InventoryModule authoritative capability wiring', () => {
  it('imports only Prisma infrastructure', () => {
    expect(Reflect.getMetadata(IMPORTS_KEY, InventoryModule) ?? []).toHaveLength(1);
  });

  it('mounts only snapshot/import and record-only capability controllers', () => {
    const controllers: unknown[] = Reflect.getMetadata(CONTROLLERS_KEY, InventoryModule) ?? [];
    expect(new Set(controllers)).toEqual(new Set([
      InventorySkuSnapshotController,
      SellpiaInventoryImportController,
      SellpiaInventoryFreshnessController,
      SellpiaReceiptBatchController,
      UnshippedController,
      WarehousesController,
      TransfersController,
      PickingController,
      CoupangShipmentsController,
    ]));
  });

  it('declares retained repositories and services', () => {
    const providers: unknown[] = Reflect.getMetadata(PROVIDERS_KEY, InventoryModule) ?? [];
    for (const provider of [
      SellpiaImportRunRepositoryAdapter,
      SellpiaSnapshotPublicationRepositoryAdapter,
      ConfirmedChannelComponentReferenceRepositoryAdapter,
      SellpiaInventoryFreshnessRepositoryAdapter,
      InventorySkuSnapshotListRepositoryAdapter,
      InventoryCommitmentRepositoryAdapter,
      SellpiaInventorySkuReadRepositoryAdapter,
      SellpiaReceiptBatchRepositoryAdapter,
      UnshippedRepositoryAdapter,
      WarehousesRepositoryAdapter,
      TransfersRepositoryAdapter,
      PickingRepositoryAdapter,
      ConfirmedOrdersRepositoryAdapter,
      InventorySkuSnapshotListService,
      InventoryCommitmentService,
      SellpiaInventorySkuReadService,
      SellpiaInventoryImportService,
      SellpiaInventoryFileValidator,
      SellpiaInventoryFreshnessService,
      SellpiaReceiptBatchService,
      UnshippedService,
      WarehousesService,
      TransfersService,
      PickingService,
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

  it('binds and exports common availability and commitment ownership', () => {
    const providers: unknown[] = Reflect.getMetadata(PROVIDERS_KEY, InventoryModule) ?? [];
    expect(providers).toContainEqual({
      provide: INVENTORY_COMMITMENT_REPOSITORY_PORT,
      useExisting: InventoryCommitmentRepositoryAdapter,
    });
    for (const port of [INVENTORY_AVAILABILITY_PORT, INVENTORY_COMMITMENT_PORT]) {
      expect(providers).toContainEqual({
        provide: port,
        useExisting: InventoryCommitmentService,
      });
    }
  });

  it('keeps the Sellpia importer and receipt tracker isolated', () => {
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
    expect(providers).toContainEqual({
      provide: SELLPIA_RECEIPT_BATCH_PORT,
      useExisting: SellpiaReceiptBatchService,
    });
    expect(providers).toContainEqual({
      provide: SELLPIA_RECEIPT_BATCH_REPOSITORY_PORT,
      useExisting: SellpiaReceiptBatchRepositoryAdapter,
    });
  });

  it('binds freshness ownership and exports only the cross-domain refresh and gate ports', () => {
    const providers: unknown[] = Reflect.getMetadata(PROVIDERS_KEY, InventoryModule) ?? [];
    expect(providers).toContainEqual({
      provide: SELLPIA_INVENTORY_FRESHNESS_REPOSITORY_PORT,
      useExisting: SellpiaInventoryFreshnessRepositoryAdapter,
    });
    for (const port of [
      SELLPIA_INVENTORY_FRESHNESS_PORT,
      SELLPIA_INVENTORY_REFRESH_REQUEST_PORT,
      SELLPIA_INVENTORY_FRESHNESS_GATE_PORT,
    ]) {
      expect(providers).toContainEqual({
        provide: port,
        useExisting: SellpiaInventoryFreshnessService,
      });
    }
    expect(Reflect.getMetadata(EXPORTS_KEY, InventoryModule) ?? []).toEqual([
      SELLPIA_INVENTORY_SKU_READ_PORT,
      SELLPIA_INVENTORY_REFRESH_REQUEST_PORT,
      SELLPIA_INVENTORY_FRESHNESS_GATE_PORT,
      INVENTORY_AVAILABILITY_PORT,
      INVENTORY_COMMITMENT_PORT,
    ]);
  });

  it('has no executable legacy inventory runtime', () => {
    expect(FORBIDDEN_LEGACY_FILES.filter((file) =>
      existsSync(path.join(INVENTORY_ROOT, file)))).toEqual([]);
  });

  it('preserves the public routes that remain truthful', () => {
    expect(Reflect.getMetadata(PATH_KEY, InventorySkuSnapshotController)).toBe('inventory');
    expect(Reflect.getMetadata(PATH_KEY, SellpiaInventoryImportController)).toBe('inventory/sellpia-sync');
    expect(Reflect.getMetadata(PATH_KEY, SellpiaInventoryFreshnessController)).toBe('inventory/sellpia-freshness');
    expect(Reflect.getMetadata(PATH_KEY, SellpiaReceiptBatchController)).toBe('inventory/sellpia-receipt-batches');
    expect(Reflect.getMetadata(PATH_KEY, UnshippedController)).toBe('unshipped');
    expect(Reflect.getMetadata(PATH_KEY, WarehousesController)).toBe('warehouses');
    expect(Reflect.getMetadata(PATH_KEY, TransfersController)).toBe('stock-transfers');
    expect(Reflect.getMetadata(PATH_KEY, PickingController)).toBe('picking');
    expect(Reflect.getMetadata(PATH_KEY, CoupangShipmentsController)).toBe('coupang-shipments');
  });
});
