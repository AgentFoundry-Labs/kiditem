import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import { InventoryModule } from '../inventory.module';
import { InventoryController } from '../adapter/in/http/inventory.controller';
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
import { INVENTORY_PORT } from '../application/port/in/inventory.port';

// NestJS @Module / @Controller metadata keys (stable across Nest 10/11).
const IMPORTS_KEY = 'imports';
const CONTROLLERS_KEY = 'controllers';
const PROVIDERS_KEY = 'providers';
const EXPORTS_KEY = 'exports';
const PATH_KEY = 'path';

// Architecture-guard companion to inventory.architecture.spec.ts and the
// dev:server boot check listed in the inventory CLAUDE.md verification gate.
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
        InventoryController,
        UnshippedController,
        WarehousesController,
        TransfersController,
        AuditsController,
        PickingController,
      ]),
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
    expect(Reflect.getMetadata(PATH_KEY, InventoryController)).toBe('inventory');
    expect(Reflect.getMetadata(PATH_KEY, UnshippedController)).toBe('unshipped');
    expect(Reflect.getMetadata(PATH_KEY, WarehousesController)).toBe('warehouses');
    expect(Reflect.getMetadata(PATH_KEY, TransfersController)).toBe('stock-transfers');
    expect(Reflect.getMetadata(PATH_KEY, AuditsController)).toBe('stock-audits');
    expect(Reflect.getMetadata(PATH_KEY, PickingController)).toBe('picking');
  });
});
