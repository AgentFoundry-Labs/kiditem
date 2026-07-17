import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('SupplierHubPage', () => {
  it('preserves the former detailed purchases tab', () => {
    const source = readFileSync(path.join(import.meta.dirname, 'page.tsx'), 'utf8');

    expect(source).toContain('SupplierPurchases');
    expect(source).toContain("id: 'purchases'");
    expect(source).toContain("label: '상세 구매'");
  });
});
