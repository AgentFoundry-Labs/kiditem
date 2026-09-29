import { beforeEach, describe, expect, it, vi } from 'vitest';

const bridge = vi.hoisted(() => ({
  detectOrderCollectionExtensionId: vi.fn(),
  sendToExtension: vi.fn(),
}));
vi.mock('@/lib/extension-bridge', () => bridge);

import { clearCoupangCookiesViaExtension } from '../coupang-cookie-recovery';

describe('clearCoupangCookiesViaExtension (Rocket and shipment screens)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    bridge.detectOrderCollectionExtensionId.mockResolvedValue('ext');
  });

  it('finds the extension by the new runtime shipment capability and returns the cleared count', async () => {
    bridge.sendToExtension.mockResolvedValue({ success: true, cleared: 4, total: 9 });
    await expect(clearCoupangCookiesViaExtension()).resolves.toBe(4);
    expect(bridge.detectOrderCollectionExtensionId).toHaveBeenCalledWith(1200, 'coupangShipmentActionsV1');
  });

  it('sends the shared clear message and rejects an answer outside the contract', async () => {
    bridge.sendToExtension.mockResolvedValue({ success: true, cleared: 4 });
    await expect(clearCoupangCookiesViaExtension()).rejects.toThrow('확장 답이 약속한 모양과 다릅니다');
    expect(bridge.sendToExtension).toHaveBeenCalledWith('ext', { action: 'clearCoupangCookies' }, 30000);
  });
});
