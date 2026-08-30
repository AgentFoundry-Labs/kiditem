import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  detectExtensionId,
  isChromeExtensionRuntimeAvailable,
  sendToExtension,
} from '@/lib/extension-bridge';
import { startCoupangCatalogBrowser } from './coupang-catalog-import';

const transferExtensionAuthToMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/extension-bridge', () => ({
  detectExtensionId: vi.fn(),
  isChromeExtensionRuntimeAvailable: vi.fn(),
  sendToExtension: vi.fn(),
}));

vi.mock('@/lib/extension-auth', () => ({
  transferExtensionAuthTo: (...args: unknown[]) => transferExtensionAuthToMock(...args),
}));

const ACCOUNT_ID = '00000000-0000-4000-8000-000000000001';
const RUN_ID = '00000000-0000-4000-8000-000000000002';

describe('startCoupangCatalogBrowser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isChromeExtensionRuntimeAvailable).mockReturnValue(true);
    vi.mocked(detectExtensionId).mockResolvedValue('extension-id');
    transferExtensionAuthToMock.mockReset();
    transferExtensionAuthToMock.mockResolvedValue(undefined);
    vi.mocked(sendToExtension)
      .mockResolvedValueOnce({
        success: true,
        version: '1.2.33',
        capabilities: {
          coupangCatalogSnapshot: true,
          browserCollectionSessions: true,
        },
      })
      .mockResolvedValueOnce({ success: true, started: true });
  });

  it('uses the explicit extension auth handoff before starting the durable server run', async () => {
    await expect(startCoupangCatalogBrowser({
      channelAccountId: ACCOUNT_ID,
      runId: RUN_ID,
    })).resolves.toBe('extension-id');

    expect(transferExtensionAuthToMock).toHaveBeenCalledWith('extension-id');
    expect(sendToExtension).toHaveBeenNthCalledWith(
      2,
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
    })).rejects.toThrow('새로고침');
  });
});
