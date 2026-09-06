import { beforeEach, expect, it, vi } from 'vitest';
import { getCoupangCatalogBrowserStatus, startCoupangCatalogBrowser } from './coupang-catalog-extension';

const bridge = vi.hoisted(() => ({
  detectExtensionId: vi.fn(),
  isChromeExtensionRuntimeAvailable: vi.fn(),
  sendToExtension: vi.fn(),
  transferExtensionAuthTo: vi.fn(),
}));
vi.mock('./extension-bridge', () => bridge);
vi.mock('./extension-auth', () => bridge);

const permit = {
  attemptId: '11111111-1111-4111-8111-111111111111',
  attemptToken: '22222222-2222-4222-8222-222222222222',
  state: 'RUNNING' as const,
  expiresAt: '2030-01-02T00:00:00.000Z',
  plan: {
    collectorVersion: 'wing-inventory-v1',
    listUrl: 'https://wing.coupang.com/tenants/seller-web/vendor-inventory/list',
    detailUrl: 'https://wing.coupang.com/tenants/seller-web/vendor-inventory/modify',
    channelAccountId: '33333333-3333-4333-8333-333333333333',
    vendorId: 'A00000000',
    publicationRevision: '0',
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  bridge.isChromeExtensionRuntimeAvailable.mockReturnValue(true);
  bridge.detectExtensionId.mockResolvedValue('extension-id');
  bridge.transferExtensionAuthTo.mockResolvedValue(undefined);
  bridge.sendToExtension.mockResolvedValue({
    success: true,
    version: '99.0.0',
    capabilities: {
      coupangCatalogSnapshot: true,
      coupangCatalogSourceAttempts: true,
      browserCollectionSessions: true,
    },
  });
});

it('hands the exact owner permit to the authenticated extension without a generic run identity', async () => {
  await expect(startCoupangCatalogBrowser({ permit })).resolves.toBe('extension-id');
  expect(bridge.transferExtensionAuthTo).toHaveBeenCalledWith('extension-id');
  expect(bridge.sendToExtension).toHaveBeenLastCalledWith('extension-id', {
    action: 'startCoupangCatalogImport', permit,
  });
});

it('rejects an extension without the catalog attempt contract before handing off auth or work', async () => {
  bridge.sendToExtension.mockResolvedValue({
    version: '99.0.0',
    capabilities: { coupangCatalogSnapshot: true, browserCollectionSessions: true },
  });
  await expect(startCoupangCatalogBrowser({ permit })).rejects.toThrow('새로고침');
  expect(bridge.sendToExtension).toHaveBeenCalledTimes(1);
  expect(bridge.transferExtensionAuthTo).not.toHaveBeenCalled();
});

it('reads only the requested attempt local activity and rejects another attempt response', async () => {
  bridge.sendToExtension.mockResolvedValue({ attemptId: permit.attemptId, active: false, attention: null });
  await expect(getCoupangCatalogBrowserStatus('extension-id', permit.attemptId))
    .resolves.toEqual({ attemptId: permit.attemptId, active: false, attention: null });
  expect(bridge.sendToExtension).toHaveBeenLastCalledWith('extension-id', {
    action: 'getCoupangCatalogImportStatus', attemptId: permit.attemptId,
  });
  bridge.sendToExtension.mockResolvedValue({ attemptId: permit.attemptToken, active: true, attention: null });
  await expect(getCoupangCatalogBrowserStatus('extension-id', permit.attemptId)).rejects.toThrow('일치');
});
