import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  begin: vi.fn(),
  detectExtensionStatus: vi.fn(),
  fail: vi.fn(),
  post: vi.fn(),
  readActive: vi.fn(),
  readAttempt: vi.fn(),
  sendToExtension: vi.fn(),
  remember: vi.fn(),
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { organizationId: 'org-1' } }),
}));
vi.mock('@/lib/extension-bridge', () => ({
  sendToExtension: mocks.sendToExtension,
}));
vi.mock('@/lib/api-client', () => ({
  apiClient: { get: vi.fn(), getParsed: vi.fn(), post: mocks.post },
}));
vi.mock('../lib/order-collection-source-owner', async () => {
  const actual = await vi.importActual('../lib/order-collection-source-owner');
  return {
    ...actual,
    beginOrderCollectionSourceAttempt: mocks.begin,
    failOrderCollectionSourceAttempt: mocks.fail,
    readActiveOrderCollectionAttempt: mocks.readActive,
    readOrderCollectionSourceAttempt: mocks.readAttempt,
    rememberActiveOrderCollectionAttempt: mocks.remember,
  };
});
vi.mock('../lib/order-collection-extension', async (importOriginal) => ({
  OrderCollectionExtensionUnavailableError: (
    await importOriginal<typeof import('../lib/order-collection-extension')>()
  ).OrderCollectionExtensionUnavailableError,
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
    coverageStartDate: null,
    coverageEndDate: null,
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

/**
 * Admission, the refusal of a second start and the operator stop belong to the
 * shared collection control (KID-189). What stays here is the mall procedure
 * around an attempt the owner already admitted.
 */
describe('useOrderCollectionSessionControls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState({}, '', '/order-collection');
    mocks.readActive.mockReturnValue({ attemptId: null, idempotencyKey: null });
    mocks.begin.mockResolvedValue(control());
    mocks.readAttempt.mockResolvedValue(attempt());
    mocks.post.mockResolvedValue({});
    mocks.detectExtensionStatus.mockResolvedValue({
      status: 'ready', extensionId: 'order-extension', version: '0.1.90',
    });
    mocks.fail.mockResolvedValue({ ...attempt(), state: 'FAILED' });
    mocks.sendToExtension.mockResolvedValue({ ok: true });
  });

  it('turns an admitted attempt into a run carrying the owner permit, without reading it again', () => {
    const { result } = renderHook(
      () => useOrderCollectionSessionControls([account]),
      { wrapper },
    );

    const run = result.current.activateOwnerRun(account, control(), 'order-extension');

    expect(run).toMatchObject({
      attemptId: ATTEMPT_ID,
      attemptToken: TOKEN,
      extensionId: 'order-extension',
      date: '2026-09-10',
      serverOwned: true,
    });
  });

  it('starts manual-upload owner attempts without extension admission', async () => {
    mocks.begin.mockResolvedValue({
      ...control(),
      plan: { ...plan, collectionMode: 'manual-upload', collectionDate: null },
    });
    const { result } = renderHook(
      () => useOrderCollectionSessionControls([account]),
      { wrapper },
    );

    let run: Awaited<ReturnType<typeof result.current.prepareManualUploadRun>> | undefined;
    await act(async () => {
      run = await result.current.prepareManualUploadRun(account);
    });

    expect(mocks.begin).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ mallKey: account.key, collectionMode: 'manual-upload' }),
    );
    expect(mocks.detectExtensionStatus).not.toHaveBeenCalled();
    expect(run).toMatchObject({ attemptId: ATTEMPT_ID, attemptToken: TOKEN });
    expect(run?.extensionId).toBeUndefined();
    expect(run?.serverOwned).toBeUndefined();
  });

  it('reads only the public owner projection on reload, never the fence token', async () => {
    mocks.readActive.mockReturnValue({ attemptId: ATTEMPT_ID, idempotencyKey: null });
    const { result } = renderHook(
      () => useOrderCollectionSessionControls([account]),
      { wrapper },
    );

    await waitFor(() => expect(result.current.restartAccount).toEqual(account));
    expect(mocks.readAttempt).toHaveBeenCalledWith(ATTEMPT_ID);
  });

  it('stops an attempt this browser opened through the owner cancel route, not a fenced fail', async () => {
    const { result } = renderHook(
      () => useOrderCollectionSessionControls([account]),
      { wrapper },
    );
    act(() => {
      result.current.activateOwnerRun(account, control(), 'order-extension');
    });

    let stopped: boolean | undefined;
    await act(async () => {
      stopped = await result.current.cancelRun(account);
    });

    expect(stopped).toBe(true);
    expect(mocks.sendToExtension).toHaveBeenCalledWith(
      'order-extension',
      { action: 'cancelCollectionSession', attemptId: ATTEMPT_ID },
    );
    expect(mocks.post).toHaveBeenCalledWith(
      `/api/orders/collection/attempts/${ATTEMPT_ID}/cancel`,
    );
    expect(mocks.fail).not.toHaveBeenCalled();
  });

  /** KID-191. 서버가 중단을 받지 못했으면 중단됐다고 답하지 않는다. */
  it('reports a stop the owner refused instead of answering that it stopped', async () => {
    mocks.post.mockRejectedValue(new Error('owner unreachable'));
    const { result } = renderHook(
      () => useOrderCollectionSessionControls([account]),
      { wrapper },
    );
    act(() => {
      result.current.activateOwnerRun(account, control(), 'order-extension');
    });

    await act(async () => {
      await expect(result.current.cancelRun(account)).rejects.toThrow('owner unreachable');
    });
  });

  it('ends this browser procedure when the shared control stops the attempt', async () => {
    const { result } = renderHook(
      () => useOrderCollectionSessionControls([account]),
      { wrapper },
    );
    let run: ReturnType<typeof result.current.activateOwnerRun> | undefined;
    act(() => {
      run = result.current.activateOwnerRun(account, control(), 'order-extension');
    });

    act(() => {
      result.current.abortLocalRun(ATTEMPT_ID);
    });

    expect(run?.signal?.aborted).toBe(true);
  });
});
