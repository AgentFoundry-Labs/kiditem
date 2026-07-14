import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  detectSourcingExtensionId,
  isChromeExtensionRuntimeAvailable,
  sendToExtension,
} from '@/lib/extension-bridge';
import {
  collectLiveCommerceFromChrome,
  fetchLiveCommerceExtensionReadiness,
} from './live-commerce-extension';

vi.mock('@/lib/extension-bridge', () => ({
  detectSourcingExtensionId: vi.fn(),
  isChromeExtensionRuntimeAvailable: vi.fn(),
  sendToExtension: vi.fn(),
}));

const mockedDetectExtension = vi.mocked(detectSourcingExtensionId);
const mockedRuntimeAvailable = vi.mocked(isChromeExtensionRuntimeAvailable);
const mockedSend = vi.mocked(sendToExtension);

describe('live-commerce Chrome extension bridge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedRuntimeAvailable.mockReturnValue(true);
    mockedDetectExtension.mockResolvedValue('sourcing-extension');
  });

  it('reports that an older extension must be reloaded before collection', async () => {
    mockedSend.mockResolvedValueOnce({ success: true, capabilities: {} });

    await expect(fetchLiveCommerceExtensionReadiness()).resolves.toEqual({
      configured: false,
      message: 'chrome://extensions에서 확장 새로고침 필요',
    });
  });

  it('reports readiness when the live-commerce capability is advertised', async () => {
    mockedSend.mockResolvedValueOnce({
      success: true,
      capabilities: { sourcingLiveCommerceCollector: true },
    });

    await expect(fetchLiveCommerceExtensionReadiness()).resolves.toEqual({
      configured: true,
      message: '방송 URL 수집 준비 완료',
    });
  });

  it('collects one Douyin URL and returns the persisted snapshot counts', async () => {
    mockedSend
      .mockResolvedValueOnce({
        success: true,
        capabilities: { sourcingLiveCommerceCollector: true },
      })
      .mockResolvedValueOnce({
        success: true,
        source: 'douyin',
        broadcastCount: 1,
        productCount: 12,
        businessDate: '2026-07-14',
      });

    await expect(collectLiveCommerceFromChrome(' https://live.douyin.com/123456 '))
      .resolves.toEqual({
        source: 'douyin',
        broadcastCount: 1,
        productCount: 12,
        businessDate: '2026-07-14',
      });
    expect(mockedSend).toHaveBeenNthCalledWith(
      2,
      'sourcing-extension',
      { action: 'collectLiveCommerceUrl', url: 'https://live.douyin.com/123456' },
      90_000,
    );
  });
});
