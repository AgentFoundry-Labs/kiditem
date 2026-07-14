import { beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
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
    const onRunStarted = vi.fn();
    mockedSend
      .mockResolvedValueOnce({
        success: true,
        capabilities: {
          sourcing1688TrendCollector: true,
          browserCollectionSessions: true,
        },
      })
      .mockResolvedValueOnce({ success: true, runId: 'run-1', status: 'running' })
      .mockResolvedValueOnce({
        success: true,
        runId: 'run-1',
        status: 'completed',
        collected: 18,
        businessDate: '2026-07-13',
        errors: [],
      });

    await expect(collect1688TrendsFromChrome(
      [' 文具 ', '文具', '儿童玩具'],
      onRunStarted,
    ))
      .resolves.toEqual({
        runId: 'run-1',
        collected: 18,
        businessDate: '2026-07-13',
        errors: [],
      });
    expect(onRunStarted).toHaveBeenCalledWith('run-1');

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
      .mockResolvedValueOnce({
        success: true,
        capabilities: {
          sourcing1688TrendCollector: true,
          browserCollectionSessions: true,
        },
      })
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
        runId: 'run-2',
        message: '1688 검색 슬라이더 검증 필요',
      });
  });

  it('requires reloading an older sourcing extension', async () => {
    mockedSend.mockResolvedValueOnce({ success: true, capabilities: {} });

    await expect(collect1688TrendsFromChrome(['文具']))
      .rejects.toMatchObject({ code: 'extension_reload_required' });
  });

  it('requires the generic browser collection-session capability', async () => {
    mockedSend.mockResolvedValueOnce({
      success: true,
      capabilities: { sourcing1688TrendCollector: true },
    });

    await expect(collect1688TrendsFromChrome(['文具']))
      .rejects.toMatchObject({ code: 'extension_reload_required' });
  });

  it('wires generic run controls and personal missing-extension alerts in the trend section', () => {
    const source = fs.readFileSync(
      path.resolve(
        'src/app/(sourcing-ai)/sourcing-ai/market/components/TrendCollectionSection.tsx',
      ),
      'utf8',
    );

    expect(source).toContain('useBrowserCollectionSession');
    expect(source).toContain('BrowserCollectionRunControls');
    expect(source).toContain("recordMissingBrowserCollection('sourcing.1688_trend'");
  });
});
