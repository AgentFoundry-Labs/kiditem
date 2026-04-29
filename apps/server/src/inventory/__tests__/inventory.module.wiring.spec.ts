import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import { InventoryModule } from '../inventory.module';
import { WarehousesModule } from '../warehouses/warehouses.module';
import { StockTransfersModule } from '../stock-transfers/stock-transfers.module';
import { StockAuditsModule } from '../stock-audits/stock-audits.module';
import { PickingModule } from '../picking/picking.module';
import { InventoryController } from '../controllers/inventory.controller';
import { UnshippedController } from '../controllers/unshipped.controller';
import { WarehousesController } from '../warehouses/warehouses.controller';
import { StockTransfersController } from '../stock-transfers/stock-transfers.controller';
import { StockAuditsController } from '../stock-audits/stock-audits.controller';
import { PickingController } from '../picking/picking.controller';

// NestJS @Module() metadata key. Stable across Nest 10/11.
const IMPORTS_KEY = 'imports';
// NestJS @Controller() route-prefix metadata key. Stable across Nest 10/11.
const PATH_KEY = 'path';

describe('InventoryModule capability wiring', () => {
  it('imports the four capability modules — they must NOT be re-imported in AppModule', () => {
    const imports: unknown[] = Reflect.getMetadata(IMPORTS_KEY, InventoryModule) ?? [];
    expect(imports).toContain(WarehousesModule);
    expect(imports).toContain(StockTransfersModule);
    expect(imports).toContain(StockAuditsModule);
    expect(imports).toContain(PickingModule);
  });

  it('keeps the public /api route shape for inventory + capability controllers', () => {
    expect(Reflect.getMetadata(PATH_KEY, InventoryController)).toBe('inventory');
    expect(Reflect.getMetadata(PATH_KEY, UnshippedController)).toBe('unshipped');
    expect(Reflect.getMetadata(PATH_KEY, WarehousesController)).toBe('warehouses');
    expect(Reflect.getMetadata(PATH_KEY, StockTransfersController)).toBe('stock-transfers');
    expect(Reflect.getMetadata(PATH_KEY, StockAuditsController)).toBe('stock-audits');
    expect(Reflect.getMetadata(PATH_KEY, PickingController)).toBe('picking');
  });
});
