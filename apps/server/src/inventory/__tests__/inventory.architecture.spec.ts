import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ProductCollectionRuntimeModule } from '../../products/product-collection-runtime.module';
import { InventoryModule } from '../inventory.module';

const REPO_ROOT = path.resolve(__dirname, '../../../../..');
const INVENTORY_ROOT = path.resolve(__dirname, '..');

function rg(args: string): string[] {
  try {
    return execSync(`rg ${args}`, { cwd: REPO_ROOT, encoding: 'utf8' })
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
  } catch (error: unknown) {
    if ((error as { status?: number }).status === 1) return [];
    throw error;
  }
}

describe('Inventory architecture contract', () => {
  it('keeps source collection and current stock in Products', () => {
    const imports: unknown[] = Reflect.getMetadata('imports', InventoryModule) ?? [];
    expect(imports).toContain(ProductCollectionRuntimeModule);
    expect(imports).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'InventoryFreshnessRuntimeModule' }),
    ]));
  });

  it('does not retain Inventory source controllers, writers, or export services', () => {
    const obsolete = [
      'adapter/in/web/inventory-sku-snapshot.controller.ts',
      'adapter/in/web/sellpia-inventory-freshness.controller.ts',
      'adapter/in/web/sellpia-inventory-source.controller.ts',
      'adapter/out/persistence/inventory-sku-snapshot-list.repository.adapter.ts',
      'adapter/out/persistence/sellpia-import-run.repository.adapter.ts',
      'adapter/out/persistence/sellpia-inventory-freshness.repository.adapter.ts',
      'adapter/out/persistence/sellpia-snapshot-publication.repository.adapter.ts',
      'application/usecase/inventory-sku-export.service.ts',
      'application/usecase/inventory-sku-snapshot-list.service.ts',
      'application/usecase/sellpia-inventory-import.service.ts',
    ];
    expect(obsolete.filter((file) => existsSync(path.join(INVENTORY_ROOT, file)))).toEqual([]);
  });

  it('does not retain the deleted Inventory source lock', () => {
    expect(existsSync(path.join(
      INVENTORY_ROOT,
      'adapter/out/persistence/transaction/sellpia-inventory-lock.ts',
    ))).toBe(false);
  });

  it('does not leave source-related public ports in Inventory', () => {
    const sourcePortHits = rg(
      "--type ts --files apps/server/src/inventory/application/port --glob '**/*sellpia*' --glob '**/*snapshot*' --glob '**/*availability*' --glob '**/*transactional*' --glob '!**/rocket-workbook-progress*'",
    );
    expect(sourcePortHits).toEqual([]);
  });

  it('keeps Prisma and source implementation out of Inventory application code', () => {
    const hits = rg(
      "--type ts --files-with-matches '@prisma/client|Prisma\\.|sellpiaInventorySku|SELLPIA_INVENTORY' apps/server/src/inventory/application --glob '!**/__tests__/**'",
    );
    expect(hits).toEqual([]);
  });

  it('retains only the warehouse, transfer and Rocket progress implementation lanes', () => {
    const files = rg('--type ts --files apps/server/src/inventory --glob "!**/__tests__/**"')
      .map((file) => path.relative(REPO_ROOT, path.resolve(REPO_ROOT, file)))
      .filter((file) => !file.endsWith('CLAUDE.md'));
    const allowedPrefixes = [
      'apps/server/src/inventory/adapter/in/web/',
      'apps/server/src/inventory/adapter/out/persistence/transfers',
      'apps/server/src/inventory/adapter/out/persistence/warehouses',
      'apps/server/src/inventory/adapter/out/persistence/rocket-workbook-progress',
      'apps/server/src/inventory/application/exception/',
      'apps/server/src/inventory/application/port/in/warehouse/',
      'apps/server/src/inventory/application/port/in/stock/index.ts',
      'apps/server/src/inventory/application/port/in/stock/rocket-workbook-progress',
      'apps/server/src/inventory/application/port/out/cross-domain/index.ts',
      'apps/server/src/inventory/application/port/out/persistence/index.ts',
      'apps/server/src/inventory/application/port/out/persistence/transfers',
      'apps/server/src/inventory/application/port/out/persistence/warehouses',
      'apps/server/src/inventory/application/port/out/persistence/rocket-workbook-progress',
      'apps/server/src/inventory/application/usecase/transfers',
      'apps/server/src/inventory/application/usecase/warehouses',
      'apps/server/src/inventory/application/usecase/rocket-workbook-progress',
      'apps/server/src/inventory/inventory.module.ts',
    ];
    expect(files.filter((file) => !allowedPrefixes.some((prefix) => file.startsWith(prefix)))).toEqual([]);
  });
});
