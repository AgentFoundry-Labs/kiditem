import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const webRoot = process.cwd().endsWith('/apps/web')
  ? process.cwd()
  : resolve(process.cwd(), 'apps/web');

describe('order inventory read-model boundary', () => {
  it('uses backend ChannelSku availability and no ProductOption reorder projection', () => {
    const componentSource = readFileSync(
      resolve(webRoot, 'src/app/(orders)/order-status-hub/components/OrderInventory.tsx'),
      'utf8',
    );
    const apiSource = readFileSync(
      resolve(webRoot, 'src/app/(orders)/order-status-hub/lib/orders-api.ts'),
      'utf8',
    );
    const source = `${componentSource}\n${apiSource}`;

    expect(source).toContain('/api/channels/sku-availability');
    expect(source).not.toContain("@/app/(inventory)/_shared/inventory-api");
    expect(source).not.toContain('queryKeys.inventory');
    expect(source).not.toContain('safetyStock');
    expect(source).not.toContain('reorderPoint');
    expect(componentSource).toContain('<Pagination');
  });
});
