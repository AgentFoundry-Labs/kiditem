import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const webSrc = path.resolve(import.meta.dirname, '../../..');
const repoRoot = path.resolve(webSrc, '../../..');

const retiredFiles = [
  'app/(inventory)/inventory-hub/components/InventoryHubWorkspace.tsx',
  'app/(inventory)/inventory-hub/components/InventoryHubWorkspace.spec.tsx',
  'app/(inventory)/stock-ops/components/ZeroItems.tsx',
  'app/(inventory)/stock-ops/components/MappingAttention.tsx',
];

const survivingConsumers = [
  'app/(inventory)/inventory-hub/page.tsx',
  'app/(inventory)/inventory-hub/page.spec.tsx',
  'app/(inventory)/inventory-hub/components/InventoryOperationWorkspaces.tsx',
  'app/(inventory)/inventory-hub/components/InventoryOperationWorkspaces.spec.tsx',
  'app/(inventory)/stock-ops/components/ImportFreshness.tsx',
  'app/(inventory)/stock-ops/components/OutOfStock.tsx',
  'app/(inventory)/stock-ops/components/StockProjectionPagination.spec.tsx',
];

const liveLinkConsumers = [
  'apps/web/src/app/(analytics)/dashboard/page.tsx',
  'apps/web/src/app/(analytics)/dashboard/components/DashboardSidePanel.tsx',
  'apps/server/src/automation/domain/policy/action-seeds.ts',
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
        /ZeroItems|MappingAttention|InventoryAttentionWorkspace|InventoryHubWorkspace/,
      );
    }
  });

  it('stops publishing the retired Sellpia-zero deep link from live code', () => {
    for (const relativePath of liveLinkConsumers) {
      const source = readFileSync(path.join(repoRoot, relativePath), 'utf8');
      expect(source, relativePath).not.toContain('/stock-ops?tab=sellpia-zero');
      expect(source, relativePath).toContain('/inventory-hub?tab=status');
    }
  });
});
