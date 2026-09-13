import { createElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api-error';
import {
  beginSellpiaInventorySourceAttempt,
  getSellpiaInventoryEnvironmentKey,
  readActiveSellpiaInventoryAttempt,
  readSellpiaInventorySourceAttempt,
  rememberActiveSellpiaInventoryAttempt,
  sellpiaInventorySourceAttemptStorageKey,
  startSellpiaInventoryBrowser,
  SellpiaInventorySourceAttemptSchema,
  type SellpiaInventorySourceAttempt,
  useSellpiaInventorySourceOwner,
} from './sellpia-inventory-source-owner';

const api = vi.hoisted(() => ({
  getParsed: vi.fn(),
  post: vi.fn(),
}));
const extension = vi.hoisted(() => ({
  detect: vi.fn(),
  send: vi.fn(),
  transfer: vi.fn(),
}));
const freshness = vi.hoisted(() => ({ getState: vi.fn() }));
const auth = vi.hoisted(() => ({ organizationId: 'org-1' as string | null }));

vi.mock('@/lib/api-client', () => ({ apiClient: api }));
vi.mock('@/lib/extension-bridge', () => ({
  detectOrderCollectionExtensionRuntime: extension.detect,
  sendToExtension: extension.send,
}));
vi.mock('@/lib/extension-auth', () => ({ transferExtensionAuthTo: extension.transfer }));
vi.mock('@/lib/sellpia-inventory-freshness-api', () => ({
  sellpiaInventoryFreshnessApi: {
    getState: freshness.getState,
    confirmSourceBinding: vi.fn(),
  },
}));
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: auth.organizationId ? { organizationId: auth.organizationId } : null }),
}));

const ATTEMPT_ID = '11111111-1111-4111-8111-111111111111';
const NEXT_ATTEMPT_ID = '33333333-3333-4333-8333-333333333333';
const ATTEMPT_TOKEN = '22222222-2222-4222-8222-222222222222';
const OLD_KEY = '44444444-4444-4444-8444-444444444444';
const NEW_KEY = '55555555-5555-4555-8555-555555555555';
const FILE_HASH = 'a'.repeat(64);

function attempt(
  state: 'RUNNING' | 'COMPLETE' | 'FAILED' = 'RUNNING',
  patch: Record<string, unknown> = {},
) {
  return {
    attemptId: ATTEMPT_ID,
    attemptToken: ATTEMPT_TOKEN,
    generation: '7',
    state,
    plan: {
      sourceType: 'sellpia_inventory',
      parserVersion: 'sellpia-inventory-v1',
      scope: 'inventory',
      trigger: 'manual_request',
      sourceOrigin: 'https://kiditem.sellpia.com',
      sourceAccountKey: 'kiditem',
      generation: '7',
    },
    expiresAt: '2099-01-01T00:00:00.000Z',
    actualCutoffAt: null,
    fileName: null,
    fileHash: null,
    contentChecksum: null,
    rowCount: 0,
    errorCode: null,
    errorMessage: null,
    ...patch,
  };
}

function renderOwner({ enabled = true }: { enabled?: boolean } = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const rendered = renderHook(() => useSellpiaInventorySourceOwner({ enabled }), {
    wrapper: ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client }, children),
  });
  return { ...rendered, client };
}

function freshnessState(
  status: 'fresh' | 'refresh_required' | 'syncing' | 'failed' = 'refresh_required',
  patch: Record<string, unknown> = {},
) {
  return {
    status,
    sourceBinding: {
      origin: 'https://kiditem.sellpia.com',
      accountKey: 'kiditem',
      confirmed: true,
    },
    lastVerifiedAt: '2026-08-01T00:30:00.000Z',
    expiresAt: null,
    requestedGeneration: '7',
    verifiedGeneration: '7',
    refreshRequestedAt: null,
    refreshReason: null,
    requestedSyncScope: 'inventory',
    syncNotBefore: null,
    activeSync: null,
    lastAttempt: status === 'failed'
      ? {
          attemptedAt: '2026-08-01T01:00:00.000Z',
          status: 'failed',
          trigger: 'retry',
          scope: 'inventory',
          errorCode: 'sellpia_network_failed',
          errorMessage: 'Sellpia is unavailable.',
        }
      : null,
    ...patch,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  auth.organizationId = 'org-1';
  freshness.getState.mockResolvedValue(freshnessState());
  extension.detect.mockResolvedValue({ status: 'ready', extensionId: 'sellpia-extension', version: '1' });
  extension.transfer.mockResolvedValue(undefined);
  extension.send.mockResolvedValue({ success: true });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Sellpia inventory source-owner transport', () => {
  it('posts the inventory scope and dispatches the exact attemptId action', async () => {
    const started = attempt('RUNNING', { fileHash: FILE_HASH });
    api.post.mockResolvedValue(started);
    api.getParsed.mockResolvedValue(started);

    await expect(beginSellpiaInventorySourceAttempt(NEW_KEY, 'manual_request'))
      .resolves.toEqual(started);
    expect(api.post).toHaveBeenCalledWith(
      '/api/inventory/sellpia-source/attempts',
      { scope: 'inventory', trigger: 'manual_request' },
      { headers: { 'Idempotency-Key': NEW_KEY } },
    );

    await startSellpiaInventoryBrowser('sellpia-extension', ATTEMPT_ID);
    expect(extension.send).toHaveBeenCalledWith(
      'sellpia-extension',
      { action: 'collectSellpiaInventory', attemptId: ATTEMPT_ID },
      190_000,
    );
  });

  it('accepts the purchase-preflight trigger on the source-owner path', async () => {
    const started = attempt();
    api.post.mockResolvedValue(started);

    await expect(beginSellpiaInventorySourceAttempt(NEW_KEY, 'purchase_preflight'))
      .resolves.toEqual(started);
    expect(api.post).toHaveBeenCalledWith(
      '/api/inventory/sellpia-source/attempts',
      { scope: 'inventory', trigger: 'purchase_preflight' },
      { headers: { 'Idempotency-Key': expect.any(String) } },
    );
  });

  it('persists the begin key before a lost begin response and reuses it on explicit retry', async () => {
    const started = attempt();
    api.post.mockRejectedValueOnce(new Error('begin response lost')).mockResolvedValueOnce(started);
    api.getParsed.mockResolvedValue(started);
    const owner = renderOwner();

    await waitFor(() => expect(freshness.getState).toHaveBeenCalled());
    await act(async () => {
      await expect(owner.result.current.start()).rejects.toThrow('begin response lost');
    });
    const pending = readActiveSellpiaInventoryAttempt('org-1');
    expect(pending).toEqual({
      attemptId: null,
      idempotencyKey: expect.any(String),
      trigger: 'manual_request',
    });

    await act(async () => {
      await owner.result.current.start();
    });
    const beginKeys = api.post.mock.calls.map((call) =>
      new Headers(call[2]?.headers).get('Idempotency-Key'));
    expect(beginKeys).toHaveLength(2);
    expect(beginKeys[0]).toBe(beginKeys[1]);
    expect(extension.send).toHaveBeenCalledWith(
      'sellpia-extension',
      { action: 'collectSellpiaInventory', attemptId: ATTEMPT_ID },
      190_000,
    );
    owner.unmount();
    owner.client.clear();
  });

  it('resends an existing running attempt after a lost extension dispatch', async () => {
    rememberActiveSellpiaInventoryAttempt('org-1', {
      attemptId: ATTEMPT_ID,
      idempotencyKey: OLD_KEY,
      trigger: 'manual_request',
    });
    api.getParsed.mockImplementation((
      _path: string,
      schema: typeof SellpiaInventorySourceAttemptSchema,
    ) => Promise.resolve(schema.parse(attempt('RUNNING', { fileHash: FILE_HASH }))));
    extension.send
      .mockRejectedValueOnce(new Error('extension response lost'))
      .mockResolvedValueOnce({ success: true });
    const owner = renderOwner();

    await waitFor(() => expect(api.getParsed).toHaveBeenCalledWith(
      `/api/inventory/sellpia-source/attempts/${ATTEMPT_ID}`,
      expect.anything(),
    ));
    await act(async () => {
      await expect(owner.result.current.start()).rejects.toThrow('extension response lost');
    });
    await act(async () => {
      await expect(owner.result.current.start()).resolves.toMatchObject({
        attemptId: ATTEMPT_ID,
        state: 'RUNNING',
        fileHash: FILE_HASH,
      });
    });

    expect(api.post).not.toHaveBeenCalled();
    expect(extension.send).toHaveBeenCalledTimes(2);
    expect(extension.send).toHaveBeenLastCalledWith(
      'sellpia-extension',
      { action: 'collectSellpiaInventory', attemptId: ATTEMPT_ID },
      190_000,
    );
    owner.unmount();
    owner.client.clear();
  });

  it('returns the authoritative terminal state after resuming a persisted running attempt', async () => {
    rememberActiveSellpiaInventoryAttempt('org-1', {
      attemptId: ATTEMPT_ID,
      idempotencyKey: OLD_KEY,
      trigger: 'manual_request',
    });
    const running = attempt('RUNNING', { fileHash: FILE_HASH });
    const complete = attempt('COMPLETE', {
      actualCutoffAt: '2026-08-02T00:00:00.000Z',
      contentChecksum: FILE_HASH,
    });
    let readCount = 0;
    api.getParsed.mockImplementation(() => {
      readCount += 1;
      return Promise.resolve(readCount >= 3 ? complete : running);
    });
    const owner = renderOwner();
    const invalidateSpy = vi.spyOn(owner.client, 'invalidateQueries');

    await waitFor(() => expect(api.getParsed).toHaveBeenCalledTimes(1));
    await act(async () => {
      await expect(owner.result.current.start()).resolves.toMatchObject({
        attemptId: ATTEMPT_ID,
        state: 'COMPLETE',
        actualCutoffAt: '2026-08-02T00:00:00.000Z',
      });
    });

    expect(extension.send).toHaveBeenCalledWith(
      'sellpia-extension',
      { action: 'collectSellpiaInventory', attemptId: ATTEMPT_ID },
      190_000,
    );
    await waitFor(() => expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['channelProductMappings'],
    }));
    expect(owner.result.current.attempt).toMatchObject({ state: 'COMPLETE' });
    owner.unmount();
    owner.client.clear();
  });

  it('keeps a resumed start busy and blocks re-admission until the authoritative read settles', async () => {
    rememberActiveSellpiaInventoryAttempt('org-1', {
      attemptId: ATTEMPT_ID,
      idempotencyKey: OLD_KEY,
      trigger: 'manual_request',
    });
    const running = attempt('RUNNING', { fileHash: FILE_HASH });
    const complete = attempt('COMPLETE', {
      actualCutoffAt: '2026-08-02T00:00:00.000Z',
      contentChecksum: FILE_HASH,
    });
    let resolveAuthoritative!: (value: SellpiaInventorySourceAttempt) => void;
    const authoritativeRead = new Promise<SellpiaInventorySourceAttempt>((resolve) => {
      resolveAuthoritative = resolve;
    });
    let readCount = 0;
    api.getParsed.mockImplementation(() => {
      readCount += 1;
      return readCount >= 3 ? authoritativeRead : Promise.resolve(running);
    });
    const owner = renderOwner();

    await waitFor(() => expect(api.getParsed).toHaveBeenCalledTimes(1));
    let startPromise!: Promise<SellpiaInventorySourceAttempt>;
    await act(async () => {
      startPromise = owner.result.current.start();
    });
    await waitFor(() => expect(extension.send).toHaveBeenCalledTimes(1));
    expect(owner.result.current.isStarting).toBe(true);
    await act(async () => {
      await expect(owner.result.current.start()).rejects.toThrow(
        '셀피아 재고 수집이 이미 시작되었습니다.',
      );
    });

    resolveAuthoritative(complete);
    await act(async () => {
      await expect(startPromise).resolves.toMatchObject({
        attemptId: ATTEMPT_ID,
        state: 'COMPLETE',
      });
    });
    expect(owner.result.current.isStarting).toBe(false);
    owner.unmount();
    owner.client.clear();
  });

  it('does not treat a post-dispatch not-found read as a stale persisted attempt', async () => {
    rememberActiveSellpiaInventoryAttempt('org-1', {
      attemptId: ATTEMPT_ID,
      idempotencyKey: OLD_KEY,
      trigger: 'manual_request',
    });
    const running = attempt('RUNNING', { fileHash: FILE_HASH });
    const notFound = new ApiError(404, 'SELLPIA_INVENTORY_ATTEMPT_NOT_FOUND', 'not found');
    let readCount = 0;
    api.getParsed.mockImplementation(() => {
      readCount += 1;
      return readCount >= 3 ? Promise.reject(notFound) : Promise.resolve(running);
    });
    const owner = renderOwner();

    await waitFor(() => expect(api.getParsed).toHaveBeenCalledTimes(1));
    await act(async () => {
      await expect(owner.result.current.start()).rejects.toBe(notFound);
    });

    expect(api.post).not.toHaveBeenCalled();
    expect(extension.send).toHaveBeenCalledTimes(1);
    expect(readActiveSellpiaInventoryAttempt('org-1')).toEqual({
      attemptId: ATTEMPT_ID,
      idempotencyKey: OLD_KEY,
      trigger: 'manual_request',
    });
    owner.unmount();
    owner.client.clear();
  });

  it('reads and caches the authoritative terminal state for a fresh begin when consumers are disabled', async () => {
    const started = attempt('RUNNING');
    const complete = attempt('COMPLETE', {
      actualCutoffAt: '2026-08-02T00:00:00.000Z',
      contentChecksum: FILE_HASH,
    });
    api.post.mockResolvedValue(started);
    api.getParsed.mockResolvedValue(complete);
    const owner = renderOwner({ enabled: false });
    const invalidateSpy = vi.spyOn(owner.client, 'invalidateQueries');

    await act(async () => {
      await expect(owner.result.current.start('manual_request')).resolves.toMatchObject({
        attemptId: ATTEMPT_ID,
        state: 'COMPLETE',
      });
    });

    expect(api.getParsed).toHaveBeenCalledWith(
      `/api/inventory/sellpia-source/attempts/${ATTEMPT_ID}`,
      expect.anything(),
    );
    expect(owner.result.current.attempt).toMatchObject({ state: 'COMPLETE' });
    await waitFor(() => expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['channelProductMappings'],
    }));
    owner.unmount();
    owner.client.clear();
  });

  it('returns the owner failure after browser completion instead of the initial running state', async () => {
    const started = attempt('RUNNING');
    const failed = attempt('FAILED', {
      errorCode: 'sellpia_network_failed',
      errorMessage: 'Sellpia is unavailable.',
    });
    api.post.mockResolvedValue(started);
    api.getParsed.mockResolvedValue(failed);
    const owner = renderOwner({ enabled: false });

    await act(async () => {
      await expect(owner.result.current.start('manual_request')).resolves.toMatchObject({
        attemptId: ATTEMPT_ID,
        state: 'FAILED',
        errorCode: 'sellpia_network_failed',
        errorMessage: 'Sellpia is unavailable.',
      });
    });
    expect(owner.result.current.attempt).toMatchObject({
      state: 'FAILED',
      errorMessage: 'Sellpia is unavailable.',
    });
    owner.unmount();
    owner.client.clear();
  });

  it('preserves RUNNING when the owner has not reached a terminal state', async () => {
    const started = attempt('RUNNING');
    api.post.mockResolvedValue(started);
    api.getParsed.mockResolvedValue(started);
    const owner = renderOwner({ enabled: false });

    await act(async () => {
      await expect(owner.result.current.start('manual_request')).resolves.toMatchObject({
        attemptId: ATTEMPT_ID,
        state: 'RUNNING',
      });
    });
    expect(owner.result.current.attempt).toMatchObject({ state: 'RUNNING' });
    owner.unmount();
    owner.client.clear();
  });

  it('reuses the pending trigger with the same idempotency key after an uncertain begin', async () => {
    const started = attempt();
    api.post.mockRejectedValueOnce(new Error('begin response lost')).mockResolvedValueOnce(started);
    api.getParsed.mockResolvedValue(started);
    const owner = renderOwner();

    await waitFor(() => expect(freshness.getState).toHaveBeenCalled());
    await act(async () => {
      await expect(owner.result.current.start('purchase_preflight'))
        .rejects.toThrow('begin response lost');
    });
    const pending = readActiveSellpiaInventoryAttempt('org-1');
    expect(pending).toMatchObject({ trigger: 'purchase_preflight' });

    await act(async () => {
      await owner.result.current.start('purchase_preflight');
    });
    expect(api.post.mock.calls[0]?.[1]).toEqual(api.post.mock.calls[1]?.[1]);
    expect(api.post.mock.calls[0]?.[1]).toEqual({
      scope: 'inventory',
      trigger: 'purchase_preflight',
    });
    owner.unmount();
    owner.client.clear();
  });

  it('reloads by reading the persisted owner attempt without dispatching provider work', async () => {
    rememberActiveSellpiaInventoryAttempt('org-1', {
      attemptId: ATTEMPT_ID,
      idempotencyKey: OLD_KEY,
    });
    const failed = attempt('FAILED', {
      errorCode: 'sellpia_network_failed',
      errorMessage: 'Sellpia is unavailable.',
    });
    freshness.getState.mockResolvedValue(freshnessState('failed'));
    api.getParsed.mockResolvedValue(failed);
    const owner = renderOwner();

    await waitFor(() => expect(api.getParsed).toHaveBeenCalledWith(
      `/api/inventory/sellpia-source/attempts/${ATTEMPT_ID}`,
      expect.anything(),
    ));
    await waitFor(() => expect(owner.result.current.state).toMatchObject({
      status: 'failed',
      lastVerifiedAt: '2026-08-01T00:30:00.000Z',
    }));
    expect(extension.detect).not.toHaveBeenCalled();
    expect(extension.send).not.toHaveBeenCalled();
    expect(owner.result.current).not.toHaveProperty('latestComplete');
    owner.unmount();
    owner.client.clear();
  });

  it('uses canonical freshness instead of an older local failed attempt', async () => {
    rememberActiveSellpiaInventoryAttempt('org-1', {
      attemptId: ATTEMPT_ID,
      idempotencyKey: OLD_KEY,
    });
    api.getParsed.mockResolvedValue(attempt('FAILED', {
      errorCode: 'sellpia_network_failed',
      errorMessage: 'Old failure should not mask a newer publication.',
    }));
    freshness.getState.mockResolvedValue(freshnessState('fresh', {
      verifiedGeneration: '8',
      requestedGeneration: '8',
      lastVerifiedAt: '2026-08-02T00:30:00.000Z',
    }));
    const owner = renderOwner();

    await waitFor(() => expect(owner.result.current.state).toMatchObject({
      status: 'fresh',
      lastVerifiedAt: '2026-08-02T00:30:00.000Z',
      errorMessage: null,
      sourceBindingConfirmed: true,
    }));
    owner.unmount();
    owner.client.clear();
  });

  it('refreshes canonical freshness after a terminal failed attempt without clearing projections', async () => {
    rememberActiveSellpiaInventoryAttempt('org-1', {
      attemptId: ATTEMPT_ID,
      idempotencyKey: OLD_KEY,
    });
    const failed = attempt('FAILED', {
      errorCode: 'sellpia_network_failed',
      errorMessage: 'Sellpia is unavailable.',
    });
    freshness.getState.mockResolvedValue(freshnessState('failed'));
    api.getParsed.mockResolvedValue(failed);
    const owner = renderOwner();
    const invalidateSpy = vi.spyOn(owner.client, 'invalidateQueries');

    await waitFor(() => expect(owner.result.current.state).toMatchObject({ status: 'failed' }));
    await waitFor(() => expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['inventory', 'sellpia-freshness', 'org-1'],
    }));
    expect(invalidateSpy).not.toHaveBeenCalledWith({
      queryKey: ['channelProductMappings'],
    });
    owner.unmount();
    owner.client.clear();
  });

  it('invalidates all snapshot consumers when another owner publishes a newer generation', async () => {
    freshness.getState.mockResolvedValue(freshnessState('fresh', { verifiedGeneration: '7' }));
    const owner = renderOwner();
    const invalidateSpy = vi.spyOn(owner.client, 'invalidateQueries');

    await waitFor(() => expect(owner.result.current.state?.lastVerifiedAt).toBe(
      '2026-08-01T00:30:00.000Z',
    ));
    owner.client.setQueryData(
      ['inventory', 'sellpia-freshness', 'org-1'],
      freshnessState('fresh', { verifiedGeneration: '8' }),
    );

    await waitFor(() => expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['channelProductMappings'],
    }));
    owner.unmount();
    owner.client.clear();
  });

  it('invalidates cached consumers for a completed attempt observed on first mount', async () => {
    rememberActiveSellpiaInventoryAttempt('org-1', {
      attemptId: ATTEMPT_ID,
      idempotencyKey: OLD_KEY,
    });
    api.getParsed.mockResolvedValue(attempt('COMPLETE'));
    freshness.getState.mockResolvedValue(freshnessState('fresh', {
      verifiedGeneration: '8',
      requestedGeneration: '8',
    }));
    const owner = renderOwner();
    const invalidateSpy = vi.spyOn(owner.client, 'invalidateQueries');

    await waitFor(() => expect(owner.result.current.attempt?.state).toBe('COMPLETE'));
    await waitFor(() => expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['channelProductMappings'],
    }));
    owner.unmount();
    owner.client.clear();
  });

  it('drops a stale persisted ID only on explicit retry and creates a fresh key', async () => {
    rememberActiveSellpiaInventoryAttempt('org-1', {
      attemptId: ATTEMPT_ID,
      idempotencyKey: OLD_KEY,
    });
    const notFound = new ApiError(404, 'SELLPIA_INVENTORY_ATTEMPT_NOT_FOUND', 'not found');
    const next = { ...attempt(), attemptId: NEXT_ATTEMPT_ID };
    api.getParsed
      .mockRejectedValueOnce(notFound)
      .mockRejectedValueOnce(notFound)
      .mockResolvedValue(next);
    api.post.mockResolvedValue(next);
    const owner = renderOwner();

    await waitFor(() => expect(api.getParsed).toHaveBeenCalledTimes(1));
    expect(extension.detect).not.toHaveBeenCalled();
    await act(async () => {
      await owner.result.current.start();
    });

    const beginKey = new Headers(api.post.mock.calls[0]?.[2]?.headers)
      .get('Idempotency-Key');
    expect(beginKey).not.toBe(OLD_KEY);
    expect(beginKey).toEqual(expect.any(String));
    expect(extension.send).toHaveBeenCalledWith(
      'sellpia-extension',
      { action: 'collectSellpiaInventory', attemptId: NEXT_ATTEMPT_ID },
      190_000,
    );
    owner.unmount();
    owner.client.clear();
  });
});

describe('Sellpia inventory attempt persistence scope', () => {
  it('keeps organization and environment correlations independent', () => {
    const local = 'http://localhost:3000';
    const office = 'http://kiditem-office';
    rememberActiveSellpiaInventoryAttempt('org-1', {
      attemptId: ATTEMPT_ID,
      idempotencyKey: OLD_KEY,
    }, local);
    rememberActiveSellpiaInventoryAttempt('org-2', {
      attemptId: NEXT_ATTEMPT_ID,
      idempotencyKey: NEW_KEY,
    }, local);
    rememberActiveSellpiaInventoryAttempt('org-1', {
      attemptId: NEXT_ATTEMPT_ID,
      idempotencyKey: NEW_KEY,
    }, office);

    expect(readActiveSellpiaInventoryAttempt('org-1', local)).toEqual({
      attemptId: ATTEMPT_ID,
      idempotencyKey: OLD_KEY,
    });
    expect(readActiveSellpiaInventoryAttempt('org-2', local)).toEqual({
      attemptId: NEXT_ATTEMPT_ID,
      idempotencyKey: NEW_KEY,
    });
    expect(readActiveSellpiaInventoryAttempt('org-1', office)).toEqual({
      attemptId: NEXT_ATTEMPT_ID,
      idempotencyKey: NEW_KEY,
    });
    expect(sellpiaInventorySourceAttemptStorageKey('org-1', local))
      .not.toBe(sellpiaInventorySourceAttemptStorageKey('org-1', office));
    expect(getSellpiaInventoryEnvironmentKey()).toBe(window.location.origin);
  });
});
