import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('SupplierHubPage', () => {
  it('does not duplicate the canonical supplier-filtered purchase-order workspace', () => {
    const source = readFileSync(path.join(import.meta.dirname, 'page.tsx'), 'utf8');

    expect(source).not.toContain('SupplierPurchases');
    expect(source).not.toContain("id: 'purchases'");
    expect(source).not.toContain("label: '상세 구매'");
  });
});
