import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import { InventoryModule } from '../inventory.module';
import { InventoryController } from '../adapter/in/http/inventory.controller';
import { UnshippedController } from '../adapter/in/http/unshipped.controller';
import { WarehousesController } from '../adapter/in/http/warehouses.controller';
import { StockTransfersController } from '../adapter/in/http/stock-transfers.controller';
import { StockAuditsController } from '../adapter/in/http/stock-audits.controller';
import { PickingController } from '../adapter/in/http/picking.controller';
import { InventoryApplicationService } from '../application/service/inventory-application.service';
import { UnshippedQueryService } from '../application/service/unshipped-query.service';
import { WarehousesApplicationService } from '../application/service/warehouses-application.service';
import { StockTransfersApplicationService } from '../application/service/stock-transfers-application.service';
import { StockAuditsApplicationService } from '../application/service/stock-audits-application.service';
import { PickingApplicationService } from '../application/service/picking-application.service';
import { InventoryQuery } from '../adapter/out/prisma/inventory.query';
import { InventoryPersistence } from '../adapter/out/prisma/inventory.persistence';
import { UnshippedQuery } from '../adapter/out/prisma/unshipped.query';
import { WarehousesPersistence } from '../adapter/out/prisma/warehouses.persistence';
import { StockTransfersPersistence } from '../adapter/out/prisma/stock-transfers.persistence';
import { StockAuditsPersistence } from '../adapter/out/prisma/stock-audits.persistence';
import { PickingPersistence } from '../adapter/out/prisma/picking.persistence';

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
        StockTransfersController,
        StockAuditsController,
        PickingController,
      ]),
    );
  });

  it('declares every persistence + query adapter as a provider', () => {
    const providers: unknown[] = Reflect.getMetadata(PROVIDERS_KEY, InventoryModule) ?? [];
    for (const cls of [
      InventoryQuery,
      InventoryPersistence,
      UnshippedQuery,
      WarehousesPersistence,
      StockTransfersPersistence,
      StockAuditsPersistence,
      PickingPersistence,
    ]) {
      expect(providers).toContain(cls);
    }
  });

  it('declares every application service as a provider', () => {
    const providers: unknown[] = Reflect.getMetadata(PROVIDERS_KEY, InventoryModule) ?? [];
    for (const cls of [
      InventoryApplicationService,
      UnshippedQueryService,
      WarehousesApplicationService,
      StockTransfersApplicationService,
      StockAuditsApplicationService,
      PickingApplicationService,
    ]) {
      expect(providers).toContain(cls);
    }
  });

  it('exports only InventoryApplicationService for cross-module consumers', () => {
    const exports_: unknown[] = Reflect.getMetadata(EXPORTS_KEY, InventoryModule) ?? [];
    expect(exports_).toEqual([InventoryApplicationService]);
  });

  it('keeps public /api route prefixes for inventory + every capability', () => {
    expect(Reflect.getMetadata(PATH_KEY, InventoryController)).toBe('inventory');
    expect(Reflect.getMetadata(PATH_KEY, UnshippedController)).toBe('unshipped');
    expect(Reflect.getMetadata(PATH_KEY, WarehousesController)).toBe('warehouses');
    expect(Reflect.getMetadata(PATH_KEY, StockTransfersController)).toBe('stock-transfers');
    expect(Reflect.getMetadata(PATH_KEY, StockAuditsController)).toBe('stock-audits');
    expect(Reflect.getMetadata(PATH_KEY, PickingController)).toBe('picking');
  });
});
