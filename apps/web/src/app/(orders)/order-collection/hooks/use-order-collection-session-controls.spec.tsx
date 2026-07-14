import type { BrowserCollectionSessionView } from '@kiditem/shared/browser-collection-session';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  detectExtension: vi.fn(),
  recordMissing: vi.fn(),
  useSession: vi.fn(),
}));

vi.mock('@/hooks/useBrowserCollectionSession', () => ({
  useBrowserCollectionSession: mocks.useSession,
}));
vi.mock('@/lib/browser-collection-session', () => ({
  recordMissingBrowserCollection: mocks.recordMissing,
}));
vi.mock('../lib/order-collection-extension', () => ({
  detectOrderCollectionSessionExtension: mocks.detectExtension,
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

    expect(run).toEqual({ runId: RUN_ID, extensionId: 'order-extension' });
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
    });
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
