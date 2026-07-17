import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const inventoryRoot = path.resolve(import.meta.dirname);

describe('legacy inventory and outbound route renderers', () => {
  it.each([
    ['inventory/page.tsx', 'InventoryWorkspace'],
    ['unshipped-items/page.tsx', 'UnshippedItemsWorkspace'],
    ['outbound/page.tsx', 'OutboundWorkspace'],
  ])('%s renders its former independent workspace', (relativePath, workspace) => {
    const source = readFileSync(path.join(inventoryRoot, relativePath), 'utf8');

    expect(source).toContain(workspace);
    expect(source).not.toContain('resolveOperationsRedirect');
    expect(source).not.toContain('redirect(');
  });
});
