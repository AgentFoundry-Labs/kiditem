import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const webSrc = path.resolve(import.meta.dirname, '../..');

const formerConsumers = [
  'components/providers/SellpiaInventorySyncProvider.tsx',
  'app/(inventory)/inventory-hub/page.tsx',
  'app/(catalog)/product-hub/matching/page.tsx',
  'app/(orders)/order-collection/components/OrderCollectionWorkspace.tsx',
];

describe('retired shared Sellpia drawer', () => {
  it('removes the drawer components and every former status entry point', () => {
    expect(existsSync(path.join(webSrc, 'components/sellpia-inventory'))).toBe(false);

    for (const relativePath of formerConsumers) {
      const source = readFileSync(path.join(webSrc, relativePath), 'utf8');
      expect(source).not.toMatch(
        /SellpiaFreshnessDrawer|SellpiaInventorySyncContext|SellpiaWorkspaceFreshnessStatus/,
      );
    }
  });

  it('keeps direct source-owner refresh after removing the drawer', () => {
    const productOutflow = readFileSync(
      path.join(webSrc, 'app/(inventory)/stock-ops/components/ProductOutflow.tsx'),
      'utf8',
    );
    const syncAction = readFileSync(
      path.join(webSrc, 'app/(inventory)/_shared/SellpiaSyncAction.tsx'),
      'utf8',
    );
    const coordinator = readFileSync(
      path.join(webSrc, 'components/providers/SellpiaInventorySyncProvider.tsx'),
      'utf8',
    );
    const sourceOwner = readFileSync(
      path.join(webSrc, 'app/(inventory)/_shared/sellpia-inventory-source-owner.ts'),
      'utf8',
    );

    expect(productOutflow).toContain(
      "import { SellpiaSyncAction } from '../../_shared/SellpiaSyncAction';",
    );
    expect(productOutflow).toContain('<SellpiaSyncAction compact showStatus />');
    expect(syncAction).toContain('onStart={() => control.start()}');
    expect(sourceOwner).toContain('collectSellpiaInventory');
    expect(sourceOwner).not.toContain('startSellpiaInventoryRefreshAction');
    expect(syncAction).toContain('startLabel="셀피아 재고 동기화"');
    expect(coordinator).toContain('useSellpiaInventoryCollection');
    expect(coordinator).not.toContain('collectSellpiaInventory');
    expect(coordinator).not.toContain('collectSellpiaProductProfitFromExtension');
  });
});
