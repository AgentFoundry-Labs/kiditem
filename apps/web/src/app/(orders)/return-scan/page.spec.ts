import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const webRoot = process.cwd().endsWith('/apps/web')
  ? process.cwd()
  : resolve(process.cwd(), 'apps/web');

describe('/return-scan Sellpia snapshot identity', () => {
  it('maps the physical Sellpia inventory SKU id into the local scan result', () => {
    const source = readFileSync(
      resolve(webRoot, 'src/app/(orders)/return-scan/page.tsx'),
      'utf8',
    );

    expect(source).toContain('id: item.sellpiaInventorySkuId');
    expect(source).not.toContain('item.masterProductId');
  });
});
