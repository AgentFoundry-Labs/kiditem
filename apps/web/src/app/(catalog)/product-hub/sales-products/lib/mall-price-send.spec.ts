import { beforeEach, describe, expect, it, vi } from 'vitest';

const bridge = vi.hoisted(() => ({
  detectOrderCollectionExtensionId: vi.fn(),
  detectOrderCollectionExtensionRuntime: vi.fn(),
  sendToExtension: vi.fn(),
}));
vi.mock('@/lib/extension-bridge', () => bridge);

import { canSendMallPrice, sendMallPrice } from './mall-price-send';

describe('sendMallPrice', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    bridge.detectOrderCollectionExtensionId.mockResolvedValue('ext');
    bridge.detectOrderCollectionExtensionRuntime.mockResolvedValue({ status: 'ready' });
  });

  it('sends only price-capable malls through the extension and returns what the mall confirmed', async () => {
    bridge.sendToExtension.mockResolvedValue({
      success: true, sent: 1, failed: 0, confirmed: 1, warnings: [],
      results: [{ code: '779522307', before: 2220, after: 2500, confirmed: true }],
    });
    const result = await sendMallPrice('kakao', [{ code: '779522307', price: 2500 }]);
    expect(bridge.sendToExtension).toHaveBeenCalledWith(
      'ext',
      { action: 'sendMallPrice', mallKey: 'kakao', items: [{ code: '779522307', price: 2500 }] },
      expect.any(Number),
    );
    expect(result.results[0]).toMatchObject({ after: 2500, confirmed: true });
    expect(canSendMallPrice('domeggook')).toBe(false);
    await expect(sendMallPrice('domeggook', [{ code: '1', price: 1000 }])).rejects.toThrow('아직 가격을 보낼 수 없습니다');
  });

  it('refuses an extension that does not know price sends', async () => {
    bridge.detectOrderCollectionExtensionRuntime.mockResolvedValue({ status: 'incompatible', version: '1.2.23' });
    await expect(sendMallPrice('kakao', [{ code: '1', price: 1000 }])).rejects.toThrow('1.2.23');
    expect(bridge.sendToExtension).not.toHaveBeenCalled();
  });
});
