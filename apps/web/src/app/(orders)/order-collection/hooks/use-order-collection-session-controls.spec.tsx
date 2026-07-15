import type { BrowserCollectionSessionView } from '@kiditem/shared/browser-collection-session';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  detectExtension: vi.fn(),
  finalizeSession: vi.fn(),
  recordMissing: vi.fn(),
  sendControl: vi.fn(),
  syncAlert: vi.fn(),
  updateCache: vi.fn(),
  useSession: vi.fn(),
}));

vi.mock('@/hooks/useBrowserCollectionSession', () => ({
  useBrowserCollectionSession: mocks.useSession,
}));
vi.mock('@/lib/browser-collection-session', () => ({
  recordMissingBrowserCollection: mocks.recordMissing,
  sendBrowserCollectionControl: mocks.sendControl,
  syncBrowserCollectionAlert: mocks.syncAlert,
  updateBrowserCollectionSessionCache: mocks.updateCache,
}));
vi.mock('../lib/order-collection-extension', () => ({
  detectOrderCollectionSessionExtension: mocks.detectExtension,
  finalizeOrderCollectionSession: mocks.finalizeSession,
}));

import { useOrderCollectionSessionControls } from './use-order-collection-session-controls';
import type { OrderCollectionMallAccount } from '../lib/order-mall-account-api';

const RUN_ID = '22222222-2222-4222-8222-222222222222';
const account: OrderCollectionMallAccount = {
  key: 'kidsnote',
  name: '키즈노트',
  configured: true,
  enabled: true,
  loginId: 'operator',
  hasPassword: true,
  siteUrl: 'https://shop.kidsnote.com',
  memo: null,
  passwordUpdatedAt: null,
  updatedAt: null,
};

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={new QueryClient()}>
      {children}
    </QueryClientProvider>
  );
}

function attentionSession(
  mallKey: string,
  date: string | null = null,
): BrowserCollectionSessionView {
  return {
    runId: RUN_ID,
    producer: 'orders.mall',
    classification: 'background_preferred',
    status: 'attention_required',
    attempt: 1,
    restartStrategy: 'web',
    progress: { current: 0, total: 0, completed: 0, failed: 0, label: null },
    inputIdentity: { mallKey, date },
    attention: {
      reason: 'marketplace_login',
      message: '로그인이 필요합니다.',
      canOpenTab: true,
    },
    startedAt: 1,
    updatedAt: 2,
    finishedAt: null,
  };
}

describe('useOrderCollectionSessionControls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState({}, '', '/order-collection');
    mocks.useSession.mockReturnValue({ data: null });
    mocks.recordMissing.mockImplementation(async (_producer, _identity, runId) => ({ runId }));
    mocks.syncAlert.mockResolvedValue(undefined);
    mocks.updateCache.mockReturnValue(true);
  });

  it('keeps the page run id when the extension is missing', async () => {
    mocks.detectExtension.mockResolvedValue(null);
    const { result } = renderHook(
      () => useOrderCollectionSessionControls([account]),
      { wrapper },
    );

    let run;
    await act(async () => {
      run = await result.current.prepareRun(account, RUN_ID);
    });

    expect(run).toBeNull();
    expect(mocks.recordMissing).toHaveBeenCalledWith(
      'orders.mall',
      { mallKey: 'kidsnote' },
      RUN_ID,
    );
    expect(mocks.useSession).toHaveBeenLastCalledWith(RUN_ID);
  });

  it('returns a session-capable extension bound to the requested run', async () => {
    mocks.detectExtension.mockResolvedValue('order-extension');
    const { result } = renderHook(
      () => useOrderCollectionSessionControls([account]),
      { wrapper },
    );

    let run;
    await act(async () => {
      run = await result.current.prepareRun(account, RUN_ID);
    });

    expect(run).toEqual({
      runId: RUN_ID,
      extensionId: 'order-extension',
      signal: expect.any(AbortSignal),
    });
    expect(mocks.recordMissing).not.toHaveBeenCalled();
  });

  it('preserves the original collection date on a same-run restart', async () => {
    mocks.detectExtension.mockResolvedValue('order-extension');
    mocks.useSession.mockReturnValue({
      data: attentionSession('kidsnote', '2026-07-14'),
    });
    const { result } = renderHook(
      () => useOrderCollectionSessionControls([account]),
      { wrapper },
    );

    let run;
    await act(async () => {
      run = await result.current.prepareRun(account, RUN_ID);
    });

    expect(run).toEqual({
      runId: RUN_ID,
      extensionId: 'order-extension',
      date: '2026-07-14',
      signal: expect.any(AbortSignal),
    });
  });

  it('aborts backend work and cancels the matching extension session', async () => {
    const cancelled = {
      ...attentionSession('kidsnote'),
      status: 'cancelled' as const,
      attention: null,
      finishedAt: 3,
    };
    mocks.detectExtension.mockResolvedValue('order-extension');
    mocks.sendControl.mockResolvedValue(cancelled);
    const { result } = renderHook(
      () => useOrderCollectionSessionControls([account]),
      { wrapper },
    );

    let run: Awaited<ReturnType<typeof result.current.prepareRun>> | undefined;
    await act(async () => {
      run = await result.current.prepareRun(account, RUN_ID);
    });
    expect(run?.signal?.aborted).toBe(false);

    await act(async () => {
      await result.current.cancelRun(account);
    });

    expect(run?.signal?.aborted).toBe(true);
    expect(mocks.sendControl).toHaveBeenCalledWith(RUN_ID, 'cancelCollectionSession');
    expect(mocks.updateCache).toHaveBeenCalledWith(expect.anything(), cancelled);
    expect(mocks.syncAlert).toHaveBeenCalledWith(cancelled);
    expect(result.current.cancellingKeys).toContain(account.key);

    act(() => result.current.releaseRun(account.key, RUN_ID));
    expect(result.current.cancellingKeys).not.toContain(account.key);
  });

  it('finalizes conversion failure and syncs the personal alert', async () => {
    const failed = {
      ...attentionSession('kidsnote'),
      status: 'failed' as const,
      attention: null,
      progress: {
        current: 2,
        total: 2,
        completed: 1,
        failed: 1,
        label: '파일 생성 실패',
      },
      finishedAt: 3,
    };
    mocks.detectExtension.mockResolvedValue('order-extension');
    mocks.finalizeSession.mockResolvedValue(failed);
    const { result } = renderHook(
      () => useOrderCollectionSessionControls([account]),
      { wrapper },
    );

    let run: Awaited<ReturnType<typeof result.current.prepareRun>> | undefined;
    await act(async () => {
      run = await result.current.prepareRun(account, RUN_ID);
    });
    await act(async () => {
      await result.current.finalizeRun(
        run!,
        'failed',
        '파일 생성 실패',
      );
    });

    expect(mocks.finalizeSession).toHaveBeenCalledWith(
      run,
      'failed',
      '파일 생성 실패',
    );
    expect(mocks.updateCache).toHaveBeenCalledWith(expect.anything(), failed);
    expect(mocks.syncAlert).toHaveBeenCalledWith(failed);
  });

  it('keeps cancellation successful when personal-alert syncing is temporarily unavailable', async () => {
    const cancelled = {
      ...attentionSession('kidsnote'),
      status: 'cancelled' as const,
      attention: null,
      finishedAt: 3,
    };
    mocks.detectExtension.mockResolvedValue('order-extension');
    mocks.sendControl.mockResolvedValue(cancelled);
    mocks.syncAlert.mockRejectedValue(new Error('alerts unavailable'));
    const { result } = renderHook(
      () => useOrderCollectionSessionControls([account]),
      { wrapper },
    );

    await act(async () => {
      await result.current.prepareRun(account, RUN_ID);
    });

    await expect(act(async () => {
      await result.current.cancelRun(account);
    })).resolves.toBeUndefined();

    expect(result.current.cancellingKeys).toContain(account.key);
  });

  it('maps only configured route accounts to same-run restart', () => {
    mocks.useSession.mockReturnValue({ data: attentionSession('coupang-rocket') });
    const { result, rerender } = renderHook(
      () => useOrderCollectionSessionControls([account]),
      { wrapper },
    );

    expect(result.current.restartAccount).toBeNull();
    expect(result.current.webRestartUnavailableMessage).toMatch(/원래 실행 화면/);

    mocks.useSession.mockReturnValue({ data: attentionSession('kidsnote') });
    rerender();
    expect(result.current.restartAccount).toEqual(account);
    expect(result.current.webRestartUnavailableMessage).toBeUndefined();
  });
});
