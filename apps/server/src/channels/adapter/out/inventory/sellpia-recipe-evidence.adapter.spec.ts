import { describe, expect, it, vi } from 'vitest';
import { SellpiaRecipeEvidenceAdapter } from './sellpia-recipe-evidence.adapter';

describe('SellpiaRecipeEvidenceAdapter', () => {
  it('delegates exact and active matching inventory reads', async () => {
    const inventory = {
      findByIds: vi.fn().mockResolvedValue([
        { sellpiaInventorySkuId: 'sku-1', code: 'SP-1', name: 'Name', optionName: null, barcode: '001234567890' },
        { sellpiaInventorySkuId: 'sku-2', code: 'SP-2', name: 'Inactive', optionName: null, barcode: null },
      ]),
      findByCodes: vi.fn().mockResolvedValue([{ sellpiaInventorySkuId: 'sku-1', code: 'SP-1', name: 'Name', optionName: null, barcode: '001234567890' }]),
      findByNormalizedBarcodes: vi.fn().mockResolvedValue([{ sellpiaInventorySkuId: 'sku-1', code: 'SP-1', name: 'Name', optionName: null, barcode: '001234567890' }]),
      findByNormalizedNames: vi.fn().mockResolvedValue([]),
      listActiveForMatching: vi.fn().mockResolvedValue([]),
    };
    const availability = {
      findBySkuIds: vi.fn().mockImplementation((input: { sellpiaInventorySkuIds: string[] }) =>
        Promise.resolve({
          snapshot: { collected: true, generation: '1', verifiedAt: new Date().toISOString() },
          items: input.sellpiaInventorySkuIds.flatMap((id) => id === 'sku-1'
            ? [{ sellpiaInventorySkuId: id, currentStock: 3, generation: '1' }]
            : []),
        })),
    };
    const adapter = new SellpiaRecipeEvidenceAdapter(
      inventory as never,
      availability as never,
    );
    await expect(adapter.findByIds('org-1', ['sku-1', 'sku-2'])).resolves.toEqual([
      {
        sellpiaInventorySkuId: 'sku-1', code: 'SP-1', name: 'Name', optionName: null,
        barcode: '001234567890', currentStock: 3,
      },
      {
        sellpiaInventorySkuId: 'sku-2', code: 'SP-2', name: 'Inactive', optionName: null,
        barcode: null, currentStock: null,
      },
    ]);
    await expect(adapter.findByCodes('org-1', ['SP-1'])).resolves.toEqual([{
      sellpiaInventorySkuId: 'sku-1', code: 'SP-1', name: 'Name', optionName: null, barcode: '001234567890', currentStock: 3,
    }]);
    await adapter.findByNormalizedBarcodes('org-1', ['001234567890']);
    await adapter.findByNormalizedNames('org-1', ['name']);
    await adapter.listActiveForMatching('org-1');
    expect(inventory.findByIds).toHaveBeenCalledWith('org-1', ['sku-1', 'sku-2']);
    expect(inventory.findByCodes).toHaveBeenCalledWith('org-1', ['SP-1']);
    expect(inventory.findByNormalizedBarcodes).toHaveBeenCalledWith('org-1', ['001234567890']);
    expect(inventory.findByNormalizedNames).toHaveBeenCalledWith('org-1', ['name']);
    expect(inventory.listActiveForMatching).toHaveBeenCalledWith('org-1');
  });

  it('keeps an active identity when its published stock fact is missing', async () => {
    const adapter = new SellpiaRecipeEvidenceAdapter({
      findByIds: vi.fn().mockResolvedValue([{
        sellpiaInventorySkuId: 'sku-1',
        code: 'SP-1',
        name: 'Name',
        optionName: null,
        barcode: null,
      }]),
    } as never, {
      findBySkuIds: vi.fn().mockResolvedValue({
        snapshot: { collected: false, generation: null, verifiedAt: null },
        items: [],
      }),
    } as never);

    await expect(adapter.findByIds('org-1', ['sku-1'])).resolves.toEqual([{
      sellpiaInventorySkuId: 'sku-1',
      code: 'SP-1',
      name: 'Name',
      optionName: null,
      barcode: null,
      currentStock: null,
    }]);
  });
});
