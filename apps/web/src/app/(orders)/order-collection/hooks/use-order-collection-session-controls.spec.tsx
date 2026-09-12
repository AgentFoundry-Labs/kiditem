import type { ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api-error';

const mocks = vi.hoisted(() => ({
  begin: vi.fn(),
  detectExtensionStatus: vi.fn(),
  fail: vi.fn(),
  readActive: vi.fn(),
  readAttempt: vi.fn(),
  readControl: vi.fn(),
  sendToExtension: vi.fn(),
  remember: vi.fn(),
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { organizationId: 'org-1' } }),
}));
vi.mock('@/lib/extension-bridge', () => ({
  sendToExtension: mocks.sendToExtension,
}));
vi.mock('../lib/order-collection-source-owner', async () => {
  const actual = await vi.importActual('../lib/order-collection-source-owner');
  return {
    ...actual,
    beginOrderCollectionSourceAttempt: mocks.begin,
    failOrderCollectionSourceAttempt: mocks.fail,
    readActiveOrderCollectionAttempt: mocks.readActive,
    readOrderCollectionSourceAttempt: mocks.readAttempt,
    readOrderCollectionSourceAttemptControl: mocks.readControl,
    rememberActiveOrderCollectionAttempt: mocks.remember,
  };
});
vi.mock('../lib/order-collection-extension', () => ({
  detectOrderCollectionSessionExtensionStatus: mocks.detectExtensionStatus,
  orderCollectionExtensionUnavailableMessage: (status: { status: string }) =>
    status.status === 'incompatible'
      ? '설치된 주문 수집 확장이 호환되지 않습니다.'
      : '주문 수집 확장 프로그램을 찾지 못했습니다.',
}));

import { useOrderCollectionSessionControls } from './use-order-collection-session-controls';
import type { OrderCollectionMallAccount } from '../lib/order-mall-account-api';

const ATTEMPT_ID = '22222222-2222-4222-8222-222222222222';
const TOKEN = '33333333-3333-4333-8333-333333333333';
const IDEMPOTENCY_KEY = '44444444-4444-4444-8444-444444444444';
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

const plan = {
  sourceType: 'order_collection_mall' as const,
  parserVersion: 'order-collection-v1',
  mallKey: 'kidsnote',
  mallName: '키즈노트',
  channelAccountId: 'channel-1',
  collectionDate: '2026-09-10',
  collectionMode: 'browser' as const,
  selectionMode: 'manual' as const,
};

function attempt(state: 'RUNNING' | 'COMPLETE' | 'FAILED' = 'RUNNING') {
  return {
    attemptId: ATTEMPT_ID,
    sourceImportRunId: ATTEMPT_ID,
    state,
    plan,
    expiresAt: '2026-09-07T12:00:00.000Z',
    artifactId: state === 'COMPLETE' ? '55555555-5555-4555-8555-555555555555' : null,
    errorCode: state === 'FAILED' ? 'COLLECTION_FAILED' : null,
    errorMessage: state === 'FAILED' ? '이전 수집 실패' : null,
  };
}

function control() {
  return { ...attempt(), attemptToken: TOKEN };
}

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={new QueryClient()}>
      {children}
    </QueryClientProvider>
  );
}

describe('useOrderCollectionSessionControls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState({}, '', '/order-collection');
    mocks.readActive.mockReturnValue({ attemptId: null, idempotencyKey: null });
    mocks.begin.mockResolvedValue(control());
    mocks.readAttempt.mockResolvedValue(attempt());
    mocks.readControl.mockResolvedValue(control());
    mocks.detectExtensionStatus.mockResolvedValue({
      status: 'ready', extensionId: 'order-extension', version: '0.1.90',
    });
    mocks.fail.mockResolvedValue({ ...attempt(), state: 'FAILED' });
    mocks.sendToExtension.mockResolvedValue({ ok: true });
  });

  it('persists idempotency before begin and forwards the owner permit to extension', async () => {
    const { result } = renderHook(
      () => useOrderCollectionSessionControls([account]),
      { wrapper },
    );

    let run;
    await act(async () => {
      run = await result.current.prepareRun(account);
    });

    expect(mocks.remember).toHaveBeenCalledWith(
      'org-1',
      expect.objectContaining({ attemptId: null, idempotencyKey: expect.any(String) }),
      expect.any(String),
    );
    expect(mocks.begin).toHaveBeenCalledWith(
      expect.any(String),
      {
        mallKey: 'kidsnote',
        collectionDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        collectionMode: 'browser',
        selectionMode: 'manual',
      },
    );
    expect(run).toMatchObject({
      attemptId: ATTEMPT_ID,
      attemptToken: TOKEN,
      extensionId: 'order-extension',
    });
  });

  it('starts manual-upload owner attempts without extension admission', async () => {
    mocks.begin.mockResolvedValue({
      ...control(),
      plan: { ...plan, collectionDate: null, collectionMode: 'manual-upload', selectionMode: undefined },
    });
    const { result } = renderHook(
      () => useOrderCollectionSessionControls([account]),
      { wrapper },
    );

    let run;
    await act(async () => {
      run = await result.current.prepareManualUploadRun(account);
    });

    expect(mocks.begin).toHaveBeenCalledWith(
      expect.any(String),
      { mallKey: 'kidsnote', collectionDate: null, collectionMode: 'manual-upload' },
    );
    expect(mocks.detectExtensionStatus).not.toHaveBeenCalled();
    expect(run).toMatchObject({ attemptId: ATTEMPT_ID, attemptToken: TOKEN });
    expect(run).not.toHaveProperty('extensionId');
  });

  it('replays a persisted idempotency key after a lost begin response', async () => {
    const admitted = {
      collectionDate: '2026-09-09',
      selectionMode: 'automatic' as const,
      seenRowKeys: ['frozen-row'],
    };
    mocks.readActive
      .mockReturnValueOnce({ attemptId: null, idempotencyKey: IDEMPOTENCY_KEY })
      .mockReturnValue({ attemptId: null, idempotencyKey: IDEMPOTENCY_KEY, ...admitted });
    mocks.begin
      .mockRejectedValueOnce(new ApiError(0, 'network_error', 'network lost'))
      .mockResolvedValueOnce(control());
    const { result } = renderHook(
      () => useOrderCollectionSessionControls([account]),
      { wrapper },
    );

    await expect(act(async () => result.current.prepareRun(account, undefined, undefined, {
      collectionDate: '2026-09-10',
      selectionMode: 'automatic',
      seenRowKeys: ['new-row'],
    }))).rejects.toThrow('network lost');
    await act(async () => {
      await result.current.prepareRun(account, undefined, undefined, {
        collectionDate: '2026-09-10',
        selectionMode: 'automatic',
        seenRowKeys: ['new-row'],
      });
    });

    expect(mocks.begin.mock.calls[0][0]).toBe(IDEMPOTENCY_KEY);
    expect(mocks.begin.mock.calls[1][0]).toBe(IDEMPOTENCY_KEY);
    expect(mocks.begin.mock.calls[1][1]).toMatchObject({
      collectionDate: admitted.collectionDate,
      selectionMode: admitted.selectionMode,
      seenRowKeys: admitted.seenRowKeys,
    });
  });

  it('reads public owner state on reload and only gets the permit on explicit resume', async () => {
    mocks.readActive.mockReturnValue({ attemptId: ATTEMPT_ID, idempotencyKey: IDEMPOTENCY_KEY });
    const { result } = renderHook(
      () => useOrderCollectionSessionControls([account]),
      { wrapper },
    );

    // Mount/reload performs only the public owner read; no extension/provider IO.
    expect(mocks.detectExtensionStatus).not.toHaveBeenCalled();
    await act(async () => {
      await result.current.prepareRun(account);
    });

    expect(mocks.readAttempt).toHaveBeenCalledWith(ATTEMPT_ID);
    expect(mocks.readControl).toHaveBeenCalledWith(ATTEMPT_ID);
    expect(mocks.begin).not.toHaveBeenCalled();
    expect(mocks.detectExtensionStatus).toHaveBeenCalledTimes(1);
  });

  it('clears a stale foreign attempt only on explicit start and creates a new owner attempt', async () => {
    mocks.readActive.mockReturnValue({ attemptId: ATTEMPT_ID, idempotencyKey: IDEMPOTENCY_KEY });
    mocks.readAttempt.mockRejectedValue(new ApiError(404, 'NOT_FOUND', 'missing'));
    await act(async () => {
      renderHook(() => useOrderCollectionSessionControls([account]), { wrapper });
    });
    expect(mocks.begin).not.toHaveBeenCalled();

    const { result } = renderHook(
      () => useOrderCollectionSessionControls([account]),
      { wrapper },
    );
    await act(async () => {
      await result.current.prepareRun(account);
    });
    expect(mocks.begin).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ mallKey: 'kidsnote' }),
    );
    expect(mocks.remember).toHaveBeenCalledWith(
      'org-1',
      { attemptId: null, idempotencyKey: null },
      expect.any(String),
    );
  });

  it('starts a fresh attempt after a failed previous owner state', async () => {
    mocks.readActive.mockReturnValue({ attemptId: ATTEMPT_ID, idempotencyKey: IDEMPOTENCY_KEY });
    mocks.readAttempt.mockResolvedValue(attempt('FAILED'));
    const { result } = renderHook(
      () => useOrderCollectionSessionControls([account]),
      { wrapper },
    );
    await act(async () => {
      await result.current.prepareRun(account);
    });
    expect(mocks.begin).toHaveBeenCalledTimes(1);
    expect(mocks.begin.mock.calls[0][0]).not.toBe(IDEMPOTENCY_KEY);
  });

  it('cancels extension progress and fences the owner failure with attemptId/token', async () => {
    const { result } = renderHook(
      () => useOrderCollectionSessionControls([account]),
      { wrapper },
    );
    await act(async () => {
      await result.current.prepareRun(account);
    });
    await act(async () => {
      await result.current.cancelRun(account);
    });
    expect(mocks.sendToExtension).toHaveBeenCalledWith(
      'order-extension',
      { action: 'cancelCollectionSession', attemptId: ATTEMPT_ID },
    );
    expect(mocks.fail).toHaveBeenCalledWith(
      expect.objectContaining({ attemptId: ATTEMPT_ID, attemptToken: TOKEN }),
      expect.objectContaining({ code: 'USER_CANCELLED' }),
    );
  });
});
