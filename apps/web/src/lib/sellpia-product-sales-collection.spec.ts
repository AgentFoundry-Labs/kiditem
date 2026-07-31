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
});
