import { beforeEach, describe, expect, it, vi } from 'vitest';
import { collectSellpiaProductProfitFromExtension } from './sellpia-product-sales-collection';

const bridge = vi.hoisted(() => ({
  detectOrderCollectionExtensionId: vi.fn(),
  sendToExtension: vi.fn(),
}));

vi.mock('@/lib/extension-bridge', () => bridge);

describe('Sellpia product-profit extension bridge', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejects a responding extension that lacks the authoritative profit capability', async () => {
    bridge.detectOrderCollectionExtensionId
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce('legacy-extension');

    await expect(collectSellpiaProductProfitFromExtension()).rejects.toThrow(
      '최신 확장프로그램',
    );
    expect(bridge.detectOrderCollectionExtensionId).toHaveBeenNthCalledWith(
      1,
      1_200,
      'collectSellpiaProductProfitEvidenceV1',
    );
    expect(bridge.sendToExtension).not.toHaveBeenCalled();
  });

  it('tells the operator to reload KidItem after reloading the extension', async () => {
    bridge.detectOrderCollectionExtensionId.mockResolvedValue(null);

    await expect(collectSellpiaProductProfitFromExtension()).rejects.toThrow(
      '현재 KidItem 화면도 새로고침',
    );
  });

  it('forwards one payload-level range and only the months actually returned by Sellpia', async () => {
    bridge.detectOrderCollectionExtensionId.mockResolvedValue('current-extension');
    bridge.sendToExtension.mockResolvedValue({
      success: true,
      payload: {
        range: { from: '2025-05-26', to: '2026-06-30' },
        provenance: {
          source: 'sellpia_stat_prd_profit',
          costBasis: 'ORDER_TIME_SUPPLY_COST',
          vatIncluded: true,
        },
        products: [{
          productCode: 'SKU-1', optionCode: '', productName: '상품', salePrice: 1000, buyPrice: 500,
          months: [{ yearMonth: '2026-06', orderQty: 2, orderAmount: 2000, inQty: 0, inAmount: 1000 }],
        }],
      },
    });

    await expect(collectSellpiaProductProfitFromExtension()).resolves.toMatchObject({
      range: { from: '2025-05-26', to: '2026-06-30' },
      products: [expect.objectContaining({ months: [{ yearMonth: '2026-06', orderQty: 2, orderAmount: 2000, inQty: 0, inAmount: 1000 }] })],
    });
    expect(bridge.sendToExtension).toHaveBeenCalledWith(
      'current-extension', { action: 'collectSellpiaProductProfit' }, 120_000,
    );
  });
});
