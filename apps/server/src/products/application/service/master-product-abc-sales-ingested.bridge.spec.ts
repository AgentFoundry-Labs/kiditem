import { describe, expect, it, vi } from 'vitest';
import { MasterProductAbcSalesIngestedBridge } from './master-product-abc-sales-ingested.bridge';

describe('MasterProductAbcSalesIngestedBridge', () => {
  it('awaits recalculation for the event organization', async () => {
    const abc = { recalculate: vi.fn().mockResolvedValue({ changedProductCount: 0 }) };
    const bridge = new MasterProductAbcSalesIngestedBridge(abc as never);

    await bridge.onSellpiaProductSalesIngested({
      organizationId: '00000000-0000-4000-8000-000000000001',
    });

    expect(abc.recalculate).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000001');
  });
});
