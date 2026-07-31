import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const webSrc = path.resolve(import.meta.dirname, '../..');

const formerConsumers = [
  'components/providers/SellpiaInventorySyncProvider.tsx',
  'app/(inventory)/inventory-hub/page.tsx',
  'app/(catalog)/product-hub/matching/page.tsx',
  'app/(supply)/purchase-orders/components/RocketPurchasePreviewSection.tsx',
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

  it('keeps direct refresh and background collection after removing the drawer', () => {
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

    expect(productOutflow).toContain(
      "import { SellpiaSyncAction } from '../../_shared/SellpiaSyncAction';",
    );
    expect(productOutflow).toContain('<SellpiaSyncAction compact showStatus />');
    expect(syncAction).toContain(
      "state?.status === 'failed' ? 'retry' : 'manual_request'",
    );
    expect(syncAction).toContain('aria-label="셀피아 동기화"');
    expect(coordinator).toContain('collectSellpiaInventory');
    expect(coordinator).toContain('collectSellpiaProductProfitFromExtension');
  });
});
