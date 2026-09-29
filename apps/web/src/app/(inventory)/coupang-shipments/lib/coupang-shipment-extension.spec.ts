import { beforeEach, describe, expect, it, vi } from 'vitest';

const bridge = vi.hoisted(() => ({
  detectOrderCollectionExtensionId: vi.fn(),
  sendToExtension: vi.fn(),
}));
vi.mock('@/lib/extension-bridge', () => bridge);

import {
  clearCoupangCookiesViaExtension,
  openCoupangShipmentPageViaExtension,
} from './coupang-shipment-extension';
import { COUPANG_SHIPMENT_PAGE_URL } from './coupang-shipment-files';

describe('Coupang shipment extension actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    bridge.detectOrderCollectionExtensionId.mockResolvedValue('ext');
  });

  it('opens the shipment page through the new runtime shipment capability', async () => {
    bridge.sendToExtension.mockResolvedValue({ success: true, tabId: 7, url: COUPANG_SHIPMENT_PAGE_URL });
    await expect(openCoupangShipmentPageViaExtension()).resolves.toBe(COUPANG_SHIPMENT_PAGE_URL);
    expect(bridge.detectOrderCollectionExtensionId).toHaveBeenCalledWith(1200, 'coupangShipmentActionsV1');
  });

  it('clears cookies through the new runtime shipment capability', async () => {
    bridge.sendToExtension.mockResolvedValue({ success: true, cleared: 3, total: 5 });
    await expect(clearCoupangCookiesViaExtension()).resolves.toBe(3);
    expect(bridge.detectOrderCollectionExtensionId).toHaveBeenCalledWith(1200, 'coupangShipmentActionsV1');
  });
});
