import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  detectExtensionId,
  isChromeExtensionRuntimeAvailable,
  sendToExtension,
} from '@/lib/extension-bridge';
import { startCoupangCatalogBrowser } from './coupang-catalog-import';

vi.mock('@/lib/extension-bridge', () => ({
  detectExtensionId: vi.fn(),
  isChromeExtensionRuntimeAvailable: vi.fn(),
  sendToExtension: vi.fn(),
}));

const ACCOUNT_ID = '00000000-0000-4000-8000-000000000001';
const RUN_ID = '00000000-0000-4000-8000-000000000002';

describe('startCoupangCatalogBrowser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isChromeExtensionRuntimeAvailable).mockReturnValue(true);
    vi.mocked(detectExtensionId).mockResolvedValue('extension-id');
    vi.mocked(sendToExtension)
      .mockResolvedValueOnce({
        success: true,
        capabilities: { coupangCatalogSnapshot: true },
      })
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: true, started: true });
  });

  it('syncs the current session token before starting the durable server run', async () => {
    await expect(startCoupangCatalogBrowser({
      channelAccountId: ACCOUNT_ID,
      runId: RUN_ID,
      accessToken: 'session-token',
    })).resolves.toBe('extension-id');

    expect(sendToExtension).toHaveBeenNthCalledWith(
      2,
      'extension-id',
      { action: 'setAuthToken', token: 'session-token' },
    );
    expect(sendToExtension).toHaveBeenNthCalledWith(
      3,
      'extension-id',
      {
        action: 'startCoupangCatalogImport',
        channelAccountId: ACCOUNT_ID,
        runId: RUN_ID,
      },
    );
  });

  it('rejects old extension builds without the snapshot capability', async () => {
    vi.mocked(sendToExtension).mockReset().mockResolvedValueOnce({
      success: true,
      capabilities: {},
    });

    await expect(startCoupangCatalogBrowser({
      channelAccountId: ACCOUNT_ID,
      runId: RUN_ID,
      accessToken: 'session-token',
    })).rejects.toThrow('새로고침');
  });
});
