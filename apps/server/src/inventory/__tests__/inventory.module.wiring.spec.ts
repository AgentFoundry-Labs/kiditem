import 'reflect-metadata';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { InventoryModule } from '../inventory.module';
import { InventoryAssetsController } from '../adapter/in/http/inventory-assets.controller';
import { InventoryItemsController } from '../adapter/in/http/inventory-items.controller';
import { InventoryStockMutationsController } from '../adapter/in/http/inventory-stock-mutations.controller';
import { InventoryTransactionsController } from '../adapter/in/http/inventory-transactions.controller';
import { UnshippedController } from '../adapter/in/http/unshipped.controller';
import { WarehousesController } from '../adapter/in/http/warehouses.controller';
import { TransfersController } from '../adapter/in/http/transfers.controller';
import { AuditsController } from '../adapter/in/http/audits.controller';
import { PickingController } from '../adapter/in/http/picking.controller';
import { InventoryService } from '../application/service/inventory.service';
import { UnshippedService } from '../application/service/unshipped.service';
import { WarehousesService } from '../application/service/warehouses.service';
import { TransfersService } from '../application/service/transfers.service';
import { AuditsService } from '../application/service/audits.service';
import { PickingService } from '../application/service/picking.service';
import { InventoryQueryRepositoryAdapter } from '../adapter/out/repository/inventory-query.repository.adapter';
import { InventoryRepositoryAdapter } from '../adapter/out/repository/inventory.repository.adapter';
import { WarehousesRepositoryAdapter } from '../adapter/out/repository/warehouses.repository.adapter';
import { TransfersRepositoryAdapter } from '../adapter/out/repository/transfers.repository.adapter';
import { AuditsRepositoryAdapter } from '../adapter/out/repository/audits.repository.adapter';
import { PickingRepositoryAdapter } from '../adapter/out/repository/picking.repository.adapter';
import { ConfirmedOrdersRepositoryAdapter } from '../adapter/out/repository/confirmed-orders.repository.adapter';
import { BundleStockAdapter } from '../adapter/out/products/bundle-stock.adapter';
import { INVENTORY_PORT } from '../application/port/in/stock/inventory.port';

// NestJS @Module / @Controller metadata keys (stable across Nest 10/11).
const IMPORTS_KEY = 'imports';
const CONTROLLERS_KEY = 'controllers';
const PROVIDERS_KEY = 'providers';
const EXPORTS_KEY = 'exports';
const PATH_KEY = 'path';
const INVENTORY_ROOT = path.resolve(__dirname, '..');

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
      BundleStockAdapter,
    ]) {
      expect(providers).toContain(cls);
    }
  });

  it('declares every application service as a provider', () => {
    const providers: unknown[] = Reflect.getMetadata(PROVIDERS_KEY, InventoryModule) ?? [];
    for (const cls of [
      InventoryService,
      UnshippedService,
      WarehousesService,
      TransfersService,
      AuditsService,
      PickingService,
    ]) {
      expect(providers).toContain(cls);
    }
  });

  it('exports only INVENTORY_PORT for cross-module consumers', () => {
    const exports_: unknown[] = Reflect.getMetadata(EXPORTS_KEY, InventoryModule) ?? [];
    expect(exports_).toEqual([INVENTORY_PORT]);
  });

  it('keeps public /api route prefixes for inventory + every capability', () => {
    expect(Reflect.getMetadata(PATH_KEY, InventoryTransactionsController)).toBe('inventory');
    expect(Reflect.getMetadata(PATH_KEY, InventoryAssetsController)).toBe('inventory');
    expect(Reflect.getMetadata(PATH_KEY, InventoryItemsController)).toBe('inventory');
    expect(Reflect.getMetadata(PATH_KEY, InventoryStockMutationsController)).toBe('inventory');
    expect(Reflect.getMetadata(PATH_KEY, UnshippedController)).toBe('unshipped');
    expect(Reflect.getMetadata(PATH_KEY, WarehousesController)).toBe('warehouses');
    expect(Reflect.getMetadata(PATH_KEY, TransfersController)).toBe('stock-transfers');
    expect(Reflect.getMetadata(PATH_KEY, AuditsController)).toBe('stock-audits');
    expect(Reflect.getMetadata(PATH_KEY, PickingController)).toBe('picking');
  });
});
