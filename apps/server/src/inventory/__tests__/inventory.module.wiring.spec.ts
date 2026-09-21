import 'reflect-metadata';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PrismaModule } from '../../prisma/prisma.module';
import { ProductCollectionRuntimeModule } from '../../products/product-collection-runtime.module';
import { RocketWorkbookProgressRepositoryAdapter } from '../adapter/out/persistence/rocket-workbook-progress.repository.adapter';
import { TransfersRepositoryAdapter } from '../adapter/out/persistence/transfers.repository.adapter';
import { WarehousesRepositoryAdapter } from '../adapter/out/persistence/warehouses.repository.adapter';
import { ROCKET_WORKBOOK_PROGRESS_PORT } from '../application/port/in/stock/rocket-workbook-progress.port';
import { TRANSFERS_PORT, WAREHOUSES_PORT } from '../application/port/in/warehouse';
import { ROCKET_WORKBOOK_PROGRESS_REPOSITORY_PORT } from '../application/port/out/persistence/rocket-workbook-progress.repository.port';
import { TRANSFERS_REPOSITORY_PORT } from '../application/port/out/persistence/transfers.repository.port';
import { WAREHOUSES_REPOSITORY_PORT } from '../application/port/out/persistence/warehouses.repository.port';
import { RocketWorkbookProgressService } from '../application/usecase/rocket-workbook-progress.service';
import { TransfersService } from '../application/usecase/transfers.service';
import { WarehousesService } from '../application/usecase/warehouses.service';
import { TransfersController } from '../adapter/in/web/transfers.controller';
import { WarehousesController } from '../adapter/in/web/warehouses.controller';
import { InventoryModule } from '../inventory.module';

const IMPORTS_KEY = 'imports';
const CONTROLLERS_KEY = 'controllers';
const PROVIDERS_KEY = 'providers';
const EXPORTS_KEY = 'exports';
const PATH_KEY = 'path';

describe('InventoryModule capability wiring', () => {
  it('imports Products source runtime alongside Prisma', () => {
    expect(Reflect.getMetadata(IMPORTS_KEY, InventoryModule) ?? [])
      .toEqual([PrismaModule, ProductCollectionRuntimeModule]);
  });

  it('mounts only warehouse and stock-transfer controllers', () => {
    expect(Reflect.getMetadata(CONTROLLERS_KEY, InventoryModule) ?? [])
      .toEqual([WarehousesController, TransfersController]);
    expect(Reflect.getMetadata(PATH_KEY, WarehousesController)).toBe('warehouses');
    expect(Reflect.getMetadata(PATH_KEY, TransfersController)).toBe('stock-transfers');
  });

  it('binds retained Inventory repositories and use cases', () => {
    const providers: unknown[] = Reflect.getMetadata(PROVIDERS_KEY, InventoryModule) ?? [];
    expect(providers).toEqual(expect.arrayContaining([
      RocketWorkbookProgressRepositoryAdapter,
      TransfersRepositoryAdapter,
      WarehousesRepositoryAdapter,
      RocketWorkbookProgressService,
      TransfersService,
      WarehousesService,
      { provide: ROCKET_WORKBOOK_PROGRESS_REPOSITORY_PORT, useExisting: RocketWorkbookProgressRepositoryAdapter },
      { provide: TRANSFERS_REPOSITORY_PORT, useExisting: TransfersRepositoryAdapter },
      { provide: WAREHOUSES_REPOSITORY_PORT, useExisting: WarehousesRepositoryAdapter },
      { provide: ROCKET_WORKBOOK_PROGRESS_PORT, useExisting: RocketWorkbookProgressService },
      { provide: TRANSFERS_PORT, useExisting: TransfersService },
      { provide: WAREHOUSES_PORT, useExisting: WarehousesService },
    ]));
  });

  it('exports only the retained Rocket progress capability', () => {
    expect(Reflect.getMetadata(EXPORTS_KEY, InventoryModule) ?? [])
      .toEqual([ROCKET_WORKBOOK_PROGRESS_PORT]);
  });

  it('does not retain the previous Inventory source runtime files', () => {
    const root = path.resolve(__dirname, '..');
    const obsolete = [
      'inventory-freshness-runtime.module.ts',
      'adapter/out/persistence/sellpia-snapshot-publication.repository.adapter.ts',
      'application/usecase/sellpia-inventory-import.service.ts',
      'application/usecase/inventory-sku-export.service.ts',
    ];
    expect(obsolete.filter((file) => existsSync(path.join(root, file)))).toEqual([]);
  });
});
