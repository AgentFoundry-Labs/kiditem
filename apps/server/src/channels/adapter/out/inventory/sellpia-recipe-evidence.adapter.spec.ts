import { describe, expect, it, vi } from 'vitest';
import { SellpiaRecipeEvidenceAdapter } from './sellpia-recipe-evidence.adapter';

describe('SellpiaRecipeEvidenceAdapter', () => {
  it('delegates exact and active matching inventory reads', async () => {
    const inventory = {
      findByCodes: vi.fn().mockResolvedValue([{ sellpiaInventorySkuId: 'sku-1', code: 'SP-1', name: 'Name', optionName: null, barcode: '001234567890', currentStock: 3 }]),
      findByNormalizedBarcodes: vi.fn().mockResolvedValue([{ sellpiaInventorySkuId: 'sku-1', code: 'SP-1', name: 'Name', optionName: null, barcode: '001234567890', currentStock: 3 }]),
      findByNormalizedNames: vi.fn().mockResolvedValue([]),
      listActiveForMatching: vi.fn().mockResolvedValue([]),
    };
    const adapter = new SellpiaRecipeEvidenceAdapter(inventory as never);
    await expect(adapter.findByCodes('org-1', ['SP-1'])).resolves.toEqual([{
      sellpiaInventorySkuId: 'sku-1', code: 'SP-1', name: 'Name', optionName: null, barcode: '001234567890', currentStock: 3,
    }]);
    await adapter.findByNormalizedBarcodes('org-1', ['001234567890']);
    await adapter.findByNormalizedNames('org-1', ['name']);
    await adapter.listActiveForMatching('org-1');
    expect(inventory.findByCodes).toHaveBeenCalledWith('org-1', ['SP-1']);
    expect(inventory.findByNormalizedBarcodes).toHaveBeenCalledWith('org-1', ['001234567890']);
    expect(inventory.findByNormalizedNames).toHaveBeenCalledWith('org-1', ['name']);
    expect(inventory.listActiveForMatching).toHaveBeenCalledWith('org-1');
  });
});
