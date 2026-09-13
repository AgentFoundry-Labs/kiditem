import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const webSrc = path.resolve(import.meta.dirname, '../../..');
const repoRoot = path.resolve(webSrc, '../../..');

const retiredFiles = [
  'app/(inventory)/inventory-hub/components/InventoryHubWorkspace.tsx',
  'app/(inventory)/inventory-hub/components/InventoryHubWorkspace.spec.tsx',
  'app/(inventory)/inventory-hub/components/InventoryOperationWorkspaces.tsx',
  'app/(inventory)/inventory-hub/components/InventoryOperationWorkspaces.spec.tsx',
  'app/(inventory)/inventory-hub/components/ChannelAvailability.tsx',
  'app/(inventory)/inventory-hub/components/SellpiaInventoryWorkspace.tsx',
  'app/(inventory)/inventory-hub/components/SellpiaInventoryWorkspace.spec.tsx',
  'app/(inventory)/inventory-hub/components/SellpiaInventoryFilters.tsx',
  'app/(inventory)/inventory-hub/components/SellpiaInventoryTable.tsx',
  'app/(inventory)/inventory/components/InventoryFilterTabs.tsx',
  'app/(inventory)/stock-ops/components/ZeroItems.tsx',
  'app/(inventory)/stock-ops/components/MappingAttention.tsx',
  'app/(inventory)/stock-ops/components/ImportFreshness.tsx',
  'app/(inventory)/stock-ops/components/ImportFreshness.spec.tsx',
];

const survivingConsumers = [
  'app/(inventory)/inventory-hub/page.tsx',
  'app/(inventory)/inventory-hub/page.spec.tsx',
  'app/(inventory)/inventory-hub/components/InventoryWorkspace.tsx',
  'app/(inventory)/inventory-hub/components/InventoryWorkspace.spec.tsx',
  'app/(inventory)/stock-ops/components/OutOfStock.tsx',
  'app/(inventory)/stock-ops/components/StockProjectionPagination.spec.tsx',
];

const liveLinkConsumers = [
  'apps/web/src/app/(inventory)/stock-ops/page.tsx',
  'apps/web/src/components/RebuildReadinessBanner.tsx',
  // The dashboard's inventory link moved out of the page and into the warning
  // table that renders the 셀피아 재고 0 row. The rule is unchanged — only the
  // canonical workspace is linked — so the guard follows the link.
  'apps/web/src/app/(analytics)/dashboard/components/DashboardWarningTable.tsx',
  // DashboardSidePanel left this list: it linked to the inventory workspace only
  // through a fallback keyed on `type: 'stock_low'`, an alert type nothing
  // writes. The source owner names the destination now, so the panel links
  // nowhere of its own.
];

describe('retired inventory checks workspace', () => {
  it('removes the checks-only components and legacy workspace', () => {
    for (const relativePath of retiredFiles) {
      expect(existsSync(path.join(webSrc, relativePath)), relativePath).toBe(false);
    }
  });

  it('leaves no checks-only imports or render paths in surviving inventory code', () => {
    for (const relativePath of survivingConsumers) {
      const source = readFileSync(path.join(webSrc, relativePath), 'utf8');
      expect(source, relativePath).not.toMatch(
        /ZeroItems|MappingAttention|InventoryAttentionWorkspace|InventoryHubWorkspace|SellpiaInventoryWorkspace|SellpiaSyncWorkspace|RocketInventoryWorkspace|ImportFreshness|ChannelAvailability/,
      );
    }
  });

  it('publishes only the canonical inventory workspace from live code', () => {
    for (const relativePath of liveLinkConsumers) {
      const source = readFileSync(path.join(repoRoot, relativePath), 'utf8');
      expect(source, relativePath).not.toContain('/stock-ops?tab=sellpia-zero');
      expect(source, relativePath).not.toContain('/inventory-hub?tab=');
      expect(source, relativePath).toContain('/inventory-hub');
    }
  });
});
