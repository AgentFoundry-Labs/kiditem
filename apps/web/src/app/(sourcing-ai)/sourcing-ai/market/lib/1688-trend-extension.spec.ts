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
const TWENTY_KEYWORDS = Array.from({ length: 20 }, (_, index) => `关键词-${index + 1}`);

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
      15_000,
    );
  });

  it('waits past the extension auth-token refresh window so the login reason reaches the operator', async () => {
    // 확장은 run 을 만들기 전에 최대 10초(AUTH_REFRESH_TIMEOUT_MS)까지 KidItem
    // 토큰을 기다린다. 웹이 그보다 먼저 끊으면 "로그인 후 다시 시도" 라는 실제
    // 사유가 버려지고 원인 불명의 "응답 시간 초과"만 남는다.
    const extensionAuthRefreshTimeoutMs = Number(
      /AUTH_REFRESH_TIMEOUT_MS\s*=\s*([\d_]+)/
        .exec(
          fs.readFileSync(
            path.resolve('../../extensions/product-scraper/background.js'),
            'utf8',
          ),
        )?.[1]
        .replace(/_/g, ''),
    );
    expect(extensionAuthRefreshTimeoutMs).toBeGreaterThan(0);

    mockedSend
      .mockResolvedValueOnce({
        success: true,
        capabilities: {
          sourcing1688TrendCollector: true,
          browserCollectionSessions: true,
        },
      })
      .mockResolvedValueOnce({
        success: false,
        error: 'KidItem 웹 앱에서 로그인 후 다시 시도해주세요.',
      });

    await expect(collect1688TrendsFromChrome(['文具'])).rejects.toMatchObject({
      code: 'collection_failed',
      message: 'KidItem 웹 앱에서 로그인 후 다시 시도해주세요.',
    });

    const startTimeoutMs = mockedSend.mock.calls[1][2] as number;
    expect(startTimeoutMs).toBeGreaterThan(extensionAuthRefreshTimeoutMs);
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

  it('keeps waiting while the extension still reports progress past the old two-minute deadline', async () => {
    // 확장은 키워드를 순차로 훑고 하나당 최악 70초까지 쓴다. 키워드가 많으면
    // 정상 수집도 2분을 넘기므로, 전진 중이면 끊지 않아야 한다.
    vi.useFakeTimers();
    try {
      mockedSend
        .mockResolvedValueOnce({
          success: true,
          capabilities: {
            sourcing1688TrendCollector: true,
            browserCollectionSessions: true,
          },
        })
        .mockResolvedValueOnce({ success: true, runId: 'run-slow', status: 'running' });
      let polls = 0;
      mockedSend.mockImplementation(async (_id: string, message: any) => {
        if (message?.action !== 'get1688TrendCollectionStatus') return { success: true };
        polls += 1;
        if (polls >= 200) {
          return {
            success: true,
            runId: 'run-slow',
            status: 'completed',
            collected: 40,
            businessDate: '2026-07-24',
            errors: [],
          };
        }
        return {
          success: true,
          runId: 'run-slow',
          status: 'running',
          currentKeywordIndex: Math.floor(polls / 10),
          totalKeywords: 20,
          collected: polls,
        };
      });

      const promise = collect1688TrendsFromChrome(TWENTY_KEYWORDS);
      const assertion = expect(promise).resolves.toMatchObject({
        runId: 'run-slow',
        collected: 40,
      });
      await vi.advanceTimersByTimeAsync(220_000);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not cancel a progressing 20-keyword run after the old fifteen-minute hard limit', async () => {
    vi.useFakeTimers();
    try {
      mockedSend
        .mockResolvedValueOnce({
          success: true,
          capabilities: {
            sourcing1688TrendCollector: true,
            browserCollectionSessions: true,
          },
        })
        .mockResolvedValueOnce({ success: true, runId: 'run-very-slow', status: 'running' });
      let polls = 0;
      const completionPoll = 16 * 60 + 10;
      mockedSend.mockImplementation(async (_id: string, message: any) => {
        if (message?.action !== 'get1688TrendCollectionStatus') return { success: true };
        polls += 1;
        if (polls >= completionPoll) {
          return {
            success: true,
            runId: 'run-very-slow',
            status: 'completed',
            collected: 320,
            businessDate: '2026-07-24',
            errors: [],
          };
        }
        const currentKeywordIndex = Math.min(19, Math.floor((polls - 1) / 60));
        return {
          success: true,
          runId: 'run-very-slow',
          status: 'running',
          currentKeywordIndex,
          totalKeywords: 20,
          collected: currentKeywordIndex * 16,
        };
      });

      const promise = collect1688TrendsFromChrome(TWENTY_KEYWORDS);
      const assertion = expect(promise).resolves.toMatchObject({
        runId: 'run-very-slow',
        collected: 320,
      });
      await vi.advanceTimersByTimeAsync(17 * 60_000);
      await assertion;

      expect(mockedSend.mock.calls).not.toContainEqual([
        'sourcing-extension',
        { action: 'cancel1688TrendCollection', runId: 'run-very-slow' },
        8_000,
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('fails only once the extension stops making progress', async () => {
    vi.useFakeTimers();
    try {
      mockedSend
        .mockResolvedValueOnce({
          success: true,
          capabilities: {
            sourcing1688TrendCollector: true,
            browserCollectionSessions: true,
          },
        })
        .mockResolvedValueOnce({ success: true, runId: 'run-stall', status: 'running' });
      mockedSend.mockImplementation(async (_id: string, message: any) => {
        if (message?.action !== 'get1688TrendCollectionStatus') return { success: true };
        // 같은 지점에서 멈춘 상태만 반복 = 정체.
        return {
          success: true,
          runId: 'run-stall',
          status: 'running',
          currentKeywordIndex: 3,
          totalKeywords: 13,
          collected: 6,
        };
      });

      const promise = collect1688TrendsFromChrome(['文具']);
      const assertion = expect(promise).rejects.toMatchObject({
        code: 'collection_timeout',
        runId: 'run-stall',
        message: expect.stringContaining('4/13 키워드에서 멈춤'),
      });
      await vi.advanceTimersByTimeAsync(100_000);
      await assertion;
      expect(mockedSend.mock.calls.filter(([, message]) => (
        (message as { action?: string }).action === 'cancel1688TrendCollection'
      ))).toEqual([
        [
          'sourcing-extension',
          { action: 'cancel1688TrendCollection', runId: 'run-stall' },
          8_000,
        ],
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('stops only the web observer on abort and leaves the extension run alive', async () => {
    vi.useFakeTimers();
    try {
      mockedSend
        .mockResolvedValueOnce({
          success: true,
          capabilities: {
            sourcing1688TrendCollector: true,
            browserCollectionSessions: true,
          },
        })
        .mockResolvedValueOnce({ success: true, runId: 'run-detached', status: 'running' });
      mockedSend.mockImplementation(async (_id: string, message: any) => {
        if (message?.action !== 'get1688TrendCollectionStatus') return { success: true };
        return {
          success: true,
          runId: 'run-detached',
          status: 'running',
          currentKeywordIndex: 0,
          totalKeywords: 1,
          collected: 0,
        };
      });

      const controller = new AbortController();
      const promise = collect1688TrendsFromChrome(
        ['文具'],
        undefined,
        controller.signal,
      );
      const assertion = expect(promise).rejects.toMatchObject({
        code: 'collection_aborted',
        runId: 'run-detached',
      });
      await vi.advanceTimersByTimeAsync(1_000);
      controller.abort();
      await vi.runAllTimersAsync();

      await assertion;
      expect(mockedSend.mock.calls.some(([, message]) => (
        (message as { action?: string }).action === 'cancel1688TrendCollection'
      ))).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('wires generic run controls and personal missing-extension alerts in the trend section', () => {
    const source = fs.readFileSync(
      path.resolve(
        'src/app/(sourcing-ai)/sourcing-ai/market/components/TrendCollectionSection.tsx',
      ),
      'utf8',
    );

    expect(source).toContain('useBrowserCollectionSession');
    expect(source).toContain('enabled: !collectMutation.isPending');
    expect(source).toContain('BrowserCollectionRunControls');
    expect(source).toContain("recordMissingBrowserCollection('sourcing.1688_trend'");
    expect(source).not.toContain('최대 2분');
  });
});
