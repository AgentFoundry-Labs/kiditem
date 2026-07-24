import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const inventoryRoot = path.resolve(import.meta.dirname);

describe('inventory route contracts', () => {
  it('/inventory keeps its operator workspace instead of redirecting', () => {
    const source = readFileSync(path.join(inventoryRoot, 'inventory/page.tsx'), 'utf8');

    expect(source).toContain('InventoryWorkspace');
    expect(source).not.toContain('redirect(');
  });

  it.each(['outbound', 'unshipped-items', 'warehouses'])(
    '/%s has no source subtree',
    (route) => {
      expect(existsSync(path.join(inventoryRoot, route))).toBe(false);
    },
  );
});
