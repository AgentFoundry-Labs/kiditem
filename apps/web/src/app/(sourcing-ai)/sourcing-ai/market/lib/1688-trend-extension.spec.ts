import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  detectSourcingExtensionId,
  isChromeExtensionRuntimeAvailable,
  sendToExtension,
} from '@/lib/extension-bridge';
import {
  collect1688TrendsFromChrome,
  TrendExtensionError,
} from './1688-trend-extension';

vi.mock('@/lib/extension-bridge', () => ({
  detectSourcingExtensionId: vi.fn(),
  isChromeExtensionRuntimeAvailable: vi.fn(),
  sendToExtension: vi.fn(),
}));

const mockedDetectExtension = vi.mocked(detectSourcingExtensionId);
const mockedRuntimeAvailable = vi.mocked(isChromeExtensionRuntimeAvailable);
const mockedSend = vi.mocked(sendToExtension);

describe('1688 trend Chrome extension bridge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedRuntimeAvailable.mockReturnValue(true);
    mockedDetectExtension.mockResolvedValue('sourcing-extension');
  });

  it('starts one deduplicated keyword batch and returns the persisted count', async () => {
    mockedSend
      .mockResolvedValueOnce({ success: true, capabilities: { sourcing1688TrendCollector: true } })
      .mockResolvedValueOnce({ success: true, runId: 'run-1', status: 'running' })
      .mockResolvedValueOnce({
        success: true,
        runId: 'run-1',
        status: 'completed',
        collected: 18,
        businessDate: '2026-07-13',
        errors: [],
      });

    await expect(collect1688TrendsFromChrome([' 文具 ', '文具', '儿童玩具']))
      .resolves.toEqual({ collected: 18, businessDate: '2026-07-13', errors: [] });

    expect(mockedSend).toHaveBeenNthCalledWith(
      2,
      'sourcing-extension',
      {
        action: 'start1688TrendCollection',
        keywords: ['文具', '儿童玩具'],
        maxResultsPerKeyword: 20,
      },
      8_000,
    );
  });

  it('explains that the app and logged-in 1688 session must use the same Chrome', async () => {
    mockedRuntimeAvailable.mockReturnValue(false);

    await expect(collect1688TrendsFromChrome(['文具']))
      .rejects.toMatchObject({ code: 'chrome_required' });
    expect(mockedDetectExtension).not.toHaveBeenCalled();
  });

  it('surfaces search-level slider verification without falling back silently', async () => {
    mockedSend
      .mockResolvedValueOnce({ success: true, capabilities: { sourcing1688TrendCollector: true } })
      .mockResolvedValueOnce({ success: true, runId: 'run-2', status: 'running' })
      .mockResolvedValueOnce({
        success: true,
        runId: 'run-2',
        status: 'verification_required',
        error: '1688 검색 슬라이더 검증 필요',
      });

    await expect(collect1688TrendsFromChrome(['文具']))
      .rejects.toMatchObject({
        code: 'verification_required',
        message: '1688 검색 슬라이더 검증 필요',
      });
  });

  it('requires reloading an older sourcing extension', async () => {
    mockedSend.mockResolvedValueOnce({ success: true, capabilities: {} });

    await expect(collect1688TrendsFromChrome(['文具']))
      .rejects.toMatchObject({ code: 'extension_reload_required' });
  });
});
