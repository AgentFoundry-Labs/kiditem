import { describe, expect, it, vi } from 'vitest';
import { SellpiaRecipeEvidenceAdapter } from './sellpia-recipe-evidence.adapter';

describe('SellpiaRecipeEvidenceAdapter', () => {
  it('delegates batched read-only code and normalized-name queries without barcode access', async () => {
    const inventory = {
      findByCodes: vi.fn().mockResolvedValue([{ sellpiaInventorySkuId: 'sku-1', code: 'SP-1', name: 'Name', optionName: null, currentStock: 3 }]),
      findByNormalizedNames: vi.fn().mockResolvedValue([]),
    };
    const adapter = new SellpiaRecipeEvidenceAdapter(inventory as never);
    await expect(adapter.findByCodes('org-1', ['SP-1'])).resolves.toEqual([{
      sellpiaInventorySkuId: 'sku-1', code: 'SP-1', name: 'Name', optionName: null, currentStock: 3,
    }]);
    await adapter.findByNormalizedNames('org-1', ['name']);
    expect(inventory.findByCodes).toHaveBeenCalledWith('org-1', ['SP-1']);
    expect(inventory.findByNormalizedNames).toHaveBeenCalledWith('org-1', ['name']);
  });
});
