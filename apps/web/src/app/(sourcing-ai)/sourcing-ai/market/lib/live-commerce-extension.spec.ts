import { beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  detectSourcingExtensionId,
  isChromeExtensionRuntimeAvailable,
  sendToExtension,
} from '@/lib/extension-bridge';
import {
  collectLiveCommerceFromChrome,
  fetchLiveCommerceExtensionReadiness,
  LIVE_COMMERCE_EXTENSION_MIN_VERSION,
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
    mockedSend.mockResolvedValueOnce({
      success: true,
      version: '2.2.1',
      capabilities: {
        sourcingLiveCommerceCollector: true,
        browserCollectionSessions: true,
      },
    });

    await expect(fetchLiveCommerceExtensionReadiness()).resolves.toEqual({
      configured: false,
      message: 'chrome://extensions에서 확장 새로고침 필요',
    });
    expect(LIVE_COMMERCE_EXTENSION_MIN_VERSION).toBe('2.2.2');
  });

  it('reports readiness when the live-commerce capability is advertised', async () => {
    mockedSend.mockResolvedValueOnce({
      success: true,
      version: '2.2.2',
      capabilities: {
        sourcingLiveCommerceCollector: true,
        browserCollectionSessions: true,
      },
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
        version: '2.2.2',
        capabilities: {
          sourcingLiveCommerceCollector: true,
          browserCollectionSessions: true,
        },
      })
      .mockResolvedValueOnce({
        success: true,
        runId: '00000000-0000-4000-8000-000000000123',
        source: 'douyin',
        broadcastCount: 1,
        productCount: 12,
        businessDate: '2026-07-14',
      });

    await expect(collectLiveCommerceFromChrome(' https://live.douyin.com/123456 '))
      .resolves.toEqual({
        runId: '00000000-0000-4000-8000-000000000123',
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

  it('requires the generic browser collection-session capability', async () => {
    mockedSend.mockResolvedValueOnce({
      success: true,
      version: '2.2.2',
      capabilities: { sourcingLiveCommerceCollector: true },
    });

    await expect(collectLiveCommerceFromChrome('https://live.douyin.com/123'))
      .rejects.toMatchObject({ code: 'extension_reload_required' });
  });

  it('preserves the attention run id from the extension response', async () => {
    mockedSend
      .mockResolvedValueOnce({
        success: true,
        version: '2.2.2',
        capabilities: {
          sourcingLiveCommerceCollector: true,
          browserCollectionSessions: true,
        },
      })
      .mockResolvedValueOnce({
        success: false,
        runId: '00000000-0000-4000-8000-000000000124',
        status: 'attention_required',
        error: '로그인이 필요합니다.',
      });

    await expect(collectLiveCommerceFromChrome('https://live.douyin.com/123'))
      .rejects.toMatchObject({
        code: 'attention_required',
        runId: '00000000-0000-4000-8000-000000000124',
      });
  });

  it('surfaces cancellation distinctly so the UI does not show a failure toast', async () => {
    mockedSend
      .mockResolvedValueOnce({
        success: true,
        version: '2.2.2',
        capabilities: {
          sourcingLiveCommerceCollector: true,
          browserCollectionSessions: true,
        },
      })
      .mockResolvedValueOnce({
        success: false,
        runId: '00000000-0000-4000-8000-000000000125',
        status: 'cancelled',
      });

    await expect(collectLiveCommerceFromChrome('https://live.douyin.com/123'))
      .rejects.toMatchObject({
        code: 'collection_cancelled',
        runId: '00000000-0000-4000-8000-000000000125',
      });

    const source = fs.readFileSync(
      path.resolve(
        'src/app/(sourcing-ai)/sourcing-ai/market/components/LiveCommerceSection.tsx',
      ),
      'utf8',
    );
    expect(source).toContain("error.code === 'collection_cancelled'");
  });

  it('passes the existing run id when the user restarts from the beginning', async () => {
    mockedSend
      .mockResolvedValueOnce({
        success: true,
        version: '2.2.2',
        capabilities: {
          sourcingLiveCommerceCollector: true,
          browserCollectionSessions: true,
        },
      })
      .mockResolvedValueOnce({
        success: false,
        runId: '00000000-0000-4000-8000-000000000124',
        status: 'attention_required',
        error: '로그인이 필요합니다.',
      });

    await expect(
      collectLiveCommerceFromChrome(
        'https://live.douyin.com/123',
        '00000000-0000-4000-8000-000000000124',
      ),
    ).rejects.toMatchObject({ code: 'attention_required' });

    expect(mockedSend).toHaveBeenNthCalledWith(
      2,
      'sourcing-extension',
      {
        action: 'collectLiveCommerceUrl',
        url: 'https://live.douyin.com/123',
        runId: '00000000-0000-4000-8000-000000000124',
      },
      90_000,
    );
  });

  it('wires generic run controls, web restart, and personal missing-extension alerts', () => {
    const source = fs.readFileSync(
      path.resolve(
        'src/app/(sourcing-ai)/sourcing-ai/market/components/LiveCommerceSection.tsx',
      ),
      'utf8',
    );

    expect(source).toContain('useBrowserCollectionSession');
    expect(source).toContain('BrowserCollectionRunControls');
    expect(source).toContain("recordMissingBrowserCollection('sourcing.live_commerce'");
    expect(source).toContain('onWebRestart');
  });
});
