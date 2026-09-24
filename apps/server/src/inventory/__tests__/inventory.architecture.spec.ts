import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ProductCollectionRuntimeModule } from '../../products/product-collection-runtime.module';
import { importFromPattern, scanSource } from '../../test-helpers/architecture-rg';
import { InventoryModule } from '../inventory.module';

const INVENTORY_ROOT = path.resolve(__dirname, '..');

/** Every production file of the owner (or of one sub-root), relative to the owner root. */
function inventoryFiles(root = INVENTORY_ROOT): string[] {
  return [...scanSource({ roots: [root], relativeTo: INVENTORY_ROOT }).hits];
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
    const sourcePortHits = inventoryFiles(path.join(INVENTORY_ROOT, 'application/port')).filter((file) => {
      const name = path.basename(file);
      return /sellpia|snapshot|availability|transactional/.test(name) && !name.startsWith('rocket-workbook-progress');
    });
    expect(sourcePortHits).toEqual([]);
  });

  it('keeps Prisma and source implementation out of Inventory application code', () => {
    const application = path.join(INVENTORY_ROOT, 'application');
    const prismaImports = scanSource({
      roots: [application],
      pattern: importFromPattern('@prisma/client'),
      relativeTo: INVENTORY_ROOT,
    }).hits;
    const sourceReads = scanSource({
      roots: [application],
      pattern: 'sellpiaInventorySku|SELLPIA_INVENTORY',
      relativeTo: INVENTORY_ROOT,
    }).hits;
    expect([...prismaImports, ...sourceReads]).toEqual([]);
  });

  it('retains only the warehouse, transfer and Rocket progress implementation lanes', () => {
    const files = inventoryFiles();
    const allowedPrefixes = [
      'adapter/in/web/',
      'adapter/out/persistence/transfers',
      'adapter/out/persistence/warehouses',
      'adapter/out/persistence/rocket-workbook-progress',
      'application/exception/',
      'application/port/in/warehouse/',
      'application/port/in/stock/index.ts',
      'application/port/in/stock/rocket-workbook-progress',
      'application/port/out/cross-domain/index.ts',
      'application/port/out/persistence/index.ts',
      'application/port/out/persistence/transfers',
      'application/port/out/persistence/warehouses',
      'application/port/out/persistence/rocket-workbook-progress',
      'application/usecase/transfers',
      'application/usecase/warehouses',
      'application/usecase/rocket-workbook-progress',
      'inventory.module.ts',
    ];
    expect(files.filter((file) => !allowedPrefixes.some((prefix) => file.startsWith(prefix)))).toEqual([]);
  });
});
