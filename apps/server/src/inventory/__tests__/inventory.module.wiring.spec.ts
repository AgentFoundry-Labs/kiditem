import 'reflect-metadata';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { InventoryModule } from '../inventory.module';
import { InventoryAssetsController } from '../adapter/in/http/inventory-assets.controller';
import { InventoryItemsController } from '../adapter/in/http/inventory-items.controller';
import { InventoryStockMutationsController } from '../adapter/in/http/inventory-stock-mutations.controller';
import { CoupangShipmentsController } from '../adapter/in/http/coupang-shipments.controller';
import { InventoryTransactionsController } from '../adapter/in/http/inventory-transactions.controller';
import { UnshippedController } from '../adapter/in/http/unshipped.controller';
import { WarehousesController } from '../adapter/in/http/warehouses.controller';
import { TransfersController } from '../adapter/in/http/transfers.controller';
import { AuditsController } from '../adapter/in/http/audits.controller';
import { PickingController } from '../adapter/in/http/picking.controller';
import { RocketInventoryController } from '../adapter/in/http/rocket-inventory.controller';
import { SellpiaReceiptBatchController } from '../adapter/in/http/sellpia-receipt-batch.controller';
import { SellpiaInventoryImportController } from '../adapter/in/http/sellpia-inventory-import.controller';
import { InventoryService } from '../application/service/inventory.service';
import { InventorySkuReadService } from '../application/service/inventory-sku-read.service';
import { SellpiaInventoryImportService } from '../application/service/sellpia-inventory-import.service';
import { SellpiaReceiptBatchService } from '../application/service/sellpia-receipt-batch.service';
import { UnshippedService } from '../application/service/unshipped.service';
import { WarehousesService } from '../application/service/warehouses.service';
import { TransfersService } from '../application/service/transfers.service';
import { AuditsService } from '../application/service/audits.service';
import { PickingService } from '../application/service/picking.service';
import { InventoryQueryRepositoryAdapter } from '../adapter/out/repository/inventory-query.repository.adapter';
import { InventoryRepositoryAdapter } from '../adapter/out/repository/inventory.repository.adapter';
import { InventorySkuImportRepositoryAdapter } from '../adapter/out/repository/inventory-sku-import.repository.adapter';
import { InventorySkuReadRepositoryAdapter } from '../adapter/out/repository/inventory-sku-read.repository.adapter';
import { SellpiaReceiptBatchRepositoryAdapter } from '../adapter/out/repository/sellpia-receipt-batch.repository.adapter';
import { WarehousesRepositoryAdapter } from '../adapter/out/repository/warehouses.repository.adapter';
import { TransfersRepositoryAdapter } from '../adapter/out/repository/transfers.repository.adapter';
import { AuditsRepositoryAdapter } from '../adapter/out/repository/audits.repository.adapter';
import { PickingRepositoryAdapter } from '../adapter/out/repository/picking.repository.adapter';
import { ConfirmedOrdersRepositoryAdapter } from '../adapter/out/repository/confirmed-orders.repository.adapter';
import { BundleStockAdapter } from '../adapter/out/products/bundle-stock.adapter';
import { INVENTORY_PORT } from '../application/port/in/stock/inventory.port';
import { INVENTORY_SKU_READ_PORT } from '../application/port/in/stock/inventory-sku-read.port';
import { SELLPIA_INVENTORY_IMPORT_PORT } from '../application/port/in/stock/sellpia-inventory-import.port';
import { SELLPIA_RECEIPT_BATCH_PORT } from '../application/port/in/stock/sellpia-receipt-batch.port';
import { INVENTORY_SKU_IMPORT_REPOSITORY_PORT } from '../application/port/out/repository/inventory-sku-import.repository.port';
import { INVENTORY_SKU_READ_REPOSITORY_PORT } from '../application/port/out/repository/inventory-sku-read.repository.port';
import { SELLPIA_RECEIPT_BATCH_REPOSITORY_PORT } from '../application/port/out/repository/sellpia-receipt-batch.repository.port';
import {
  CreateSellpiaReceiptBatchDto,
  MarkSellpiaReceiptBatchUploadedDto,
} from '../adapter/in/http/dto/sellpia-receipt-batch.dto';

// NestJS @Module / @Controller metadata keys (stable across Nest 10/11).
const IMPORTS_KEY = 'imports';
const CONTROLLERS_KEY = 'controllers';
const PROVIDERS_KEY = 'providers';
const EXPORTS_KEY = 'exports';
const PATH_KEY = 'path';
const INVENTORY_ROOT = path.resolve(__dirname, '..');

const LEGACY_SELLPIA_FILES = [
  'adapter/in/http/sellpia-sync.controller.ts',
  'adapter/in/http/sellpia-sync.controller.spec.ts',
  'adapter/in/http/dto/sellpia-sync.dto.ts',
  'application/port/in/stock/sellpia-sync.port.ts',
  'application/port/out/repository/sellpia-sync.repository.port.ts',
  'application/service/sellpia-sync.service.ts',
  'application/service/sellpia-sync.service.spec.ts',
  'application/service/sellpia-workbook.parser.ts',
  'application/service/sellpia-workbook.parser.spec.ts',
  'adapter/out/repository/sellpia-sync.repository.adapter.ts',
  'adapter/out/repository/sellpia-sync.repository.adapter.spec.ts',
  '__tests__/sellpia-sync.repository.pg.integration.spec.ts',
  'domain/policy/sellpia-adjustment-recommendation.ts',
  'domain/policy/__tests__/sellpia-adjustment-recommendation.spec.ts',
] as const;

const INVENTORY_HTTP_CONTROLLER_FILES = [
  ['InventoryItemsController', 'inventory-items.controller.ts'],
  ['InventoryTransactionsController', 'inventory-transactions.controller.ts'],
  ['InventoryStockMutationsController', 'inventory-stock-mutations.controller.ts'],
  ['InventoryAssetsController', 'inventory-assets.controller.ts'],
] as const;

// Architecture-guard companion to inventory.architecture.spec.ts and the
// dev:server boot check listed in the inventory AGENTS.md verification gate.
// This spec freezes only the @Module()/@Controller() metadata so a missing
// provider, a stray legacy controller, or an accidental route rename fails
// here at vitest time before reaching dev:server boot.
describe('InventoryModule capability wiring', () => {
  it('imports nothing capability-shaped beyond Prisma + Products', () => {
    const imports: unknown[] = Reflect.getMetadata(IMPORTS_KEY, InventoryModule) ?? [];
    expect(imports).toHaveLength(2);
  });

  it('mounts every capability controller from adapter/in/http', () => {
    const controllers: unknown[] = Reflect.getMetadata(CONTROLLERS_KEY, InventoryModule) ?? [];
    expect(new Set(controllers)).toEqual(
      new Set([
        InventoryTransactionsController,
        InventoryAssetsController,
        InventoryItemsController,
        InventoryStockMutationsController,
        CoupangShipmentsController,
        RocketInventoryController,
        SellpiaInventoryImportController,
        SellpiaReceiptBatchController,
        UnshippedController,
        WarehousesController,
        TransfersController,
        AuditsController,
        PickingController,
      ]),
    );
  });

  it('splits /api/inventory HTTP routes by route family', () => {
    const moduleSource = readFileSync(path.join(INVENTORY_ROOT, 'inventory.module.ts'), 'utf8');

    for (const [className, fileName] of INVENTORY_HTTP_CONTROLLER_FILES) {
      expect(
        existsSync(path.join(INVENTORY_ROOT, 'adapter/in/http', fileName)),
        `${fileName} should own a route family under /api/inventory`,
      ).toBe(true);
      expect(moduleSource).toContain(className);
    }
  });

  it('registers static /api/inventory GET families before item id routes', () => {
    const controllers: unknown[] = Reflect.getMetadata(CONTROLLERS_KEY, InventoryModule) ?? [];
    expect(controllers.indexOf(InventoryTransactionsController)).toBeLessThan(
      controllers.indexOf(InventoryItemsController),
    );
    expect(controllers.indexOf(InventoryAssetsController)).toBeLessThan(
      controllers.indexOf(InventoryItemsController),
    );
  });

  it('declares every repository adapter as a provider', () => {
    const providers: unknown[] = Reflect.getMetadata(PROVIDERS_KEY, InventoryModule) ?? [];
    for (const cls of [
      InventoryQueryRepositoryAdapter,
      InventoryRepositoryAdapter,
      WarehousesRepositoryAdapter,
      TransfersRepositoryAdapter,
      AuditsRepositoryAdapter,
      PickingRepositoryAdapter,
      ConfirmedOrdersRepositoryAdapter,
      InventorySkuImportRepositoryAdapter,
      InventorySkuReadRepositoryAdapter,
      SellpiaReceiptBatchRepositoryAdapter,
      BundleStockAdapter,
    ]) {
      expect(providers).toContain(cls);
    }
  });

  it('declares every application service as a provider', () => {
    const providers: unknown[] = Reflect.getMetadata(PROVIDERS_KEY, InventoryModule) ?? [];
    for (const cls of [
      InventoryService,
      InventorySkuReadService,
      SellpiaInventoryImportService,
      SellpiaReceiptBatchService,
      UnshippedService,
      WarehousesService,
      TransfersService,
      AuditsService,
      PickingService,
    ]) {
      expect(providers).toContain(cls);
    }
  });

  it('exports only stock mutation and InventorySku matching read capabilities', () => {
    const exports_: unknown[] = Reflect.getMetadata(EXPORTS_KEY, InventoryModule) ?? [];
    expect(exports_).toEqual([INVENTORY_PORT, INVENTORY_SKU_READ_PORT]);
  });

  it('binds the InventorySku read capability through its owner repository', () => {
    const providers: unknown[] = Reflect.getMetadata(PROVIDERS_KEY, InventoryModule) ?? [];
    expect(providers).toContainEqual({
      provide: INVENTORY_SKU_READ_REPOSITORY_PORT,
      useExisting: InventorySkuReadRepositoryAdapter,
    });
    expect(providers).toContainEqual({
      provide: INVENTORY_SKU_READ_PORT,
      useExisting: InventorySkuReadService,
    });
  });

  it('binds the Sellpia import and receipt ports to their isolated implementations', () => {
    const providers: unknown[] = Reflect.getMetadata(PROVIDERS_KEY, InventoryModule) ?? [];
    expect(providers).toContainEqual({
      provide: SELLPIA_INVENTORY_IMPORT_PORT,
      useExisting: SellpiaInventoryImportService,
    });
    expect(providers).toContainEqual({
      provide: INVENTORY_SKU_IMPORT_REPOSITORY_PORT,
      useExisting: InventorySkuImportRepositoryAdapter,
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

  it('deletes every executable legacy Sellpia adjustment path', () => {
    const moduleSource = readFileSync(path.join(INVENTORY_ROOT, 'inventory.module.ts'), 'utf8');
    for (const relativePath of LEGACY_SELLPIA_FILES) {
      expect(existsSync(path.join(INVENTORY_ROOT, relativePath)), relativePath).toBe(false);
    }
    expect(moduleSource).not.toMatch(/SellpiaSync|SELLPIA_SYNC|ProductOptionProvision/);
    expect(Object.getOwnPropertyNames(SellpiaInventoryImportController.prototype))
      .toEqual(['constructor', 'importWorkbook']);
  });

  it('keeps receipt DTOs and wiring isolated from stock mutation dependencies', () => {
    expect(CreateSellpiaReceiptBatchDto).toBeTypeOf('function');
    expect(MarkSellpiaReceiptBatchUploadedDto).toBeTypeOf('function');

    const controllerSource = readFileSync(
      path.join(INVENTORY_ROOT, 'adapter/in/http/sellpia-receipt-batch.controller.ts'),
      'utf8',
    );
    const serviceSource = readFileSync(
      path.join(INVENTORY_ROOT, 'application/service/sellpia-receipt-batch.service.ts'),
      'utf8',
    );
    expect(controllerSource).toContain('SELLPIA_RECEIPT_BATCH_PORT');
    expect(controllerSource).not.toContain('SELLPIA_SYNC_PORT');
    expect(serviceSource).not.toMatch(
      /InventoryRepository|BundleStock|ProductOption|Rocket|InventorySkuImport|SellpiaInventory/,
    );
    expect(SellpiaReceiptBatchService.length).toBe(1);
  });

  it('keeps public /api route prefixes for inventory + every capability', () => {
    expect(Reflect.getMetadata(PATH_KEY, InventoryTransactionsController)).toBe('inventory');
    expect(Reflect.getMetadata(PATH_KEY, InventoryAssetsController)).toBe('inventory');
    expect(Reflect.getMetadata(PATH_KEY, InventoryItemsController)).toBe('inventory');
    expect(Reflect.getMetadata(PATH_KEY, InventoryStockMutationsController)).toBe('inventory');
    expect(Reflect.getMetadata(PATH_KEY, CoupangShipmentsController)).toBe('coupang-shipments');
    expect(Reflect.getMetadata(PATH_KEY, RocketInventoryController)).toBe('inventory/rocket');
    expect(Reflect.getMetadata(PATH_KEY, SellpiaInventoryImportController)).toBe('inventory/sellpia-sync');
    expect(Reflect.getMetadata(PATH_KEY, SellpiaReceiptBatchController)).toBe('inventory/sellpia-receipt-batches');
    expect(Reflect.getMetadata(PATH_KEY, UnshippedController)).toBe('unshipped');
    expect(Reflect.getMetadata(PATH_KEY, WarehousesController)).toBe('warehouses');
    expect(Reflect.getMetadata(PATH_KEY, TransfersController)).toBe('stock-transfers');
    expect(Reflect.getMetadata(PATH_KEY, AuditsController)).toBe('stock-audits');
    expect(Reflect.getMetadata(PATH_KEY, PickingController)).toBe('picking');
  });
});
