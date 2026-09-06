import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { queryKeys } from '@/lib/query-keys';
import { useCoupangCatalogImport } from './useCoupangCatalogImport';

const ACCOUNT_ID = '00000000-0000-4000-8000-000000000001';
const ATTEMPT_ID = '00000000-0000-4000-8000-000000000002';
const KEY = '00000000-0000-4000-8000-000000000003';
const TOKEN = '00000000-0000-4000-8000-000000000004';
const STORAGE_KEY = 'kiditem:coupang-catalog-import:active-attempt';
const permit = {
  attemptId: ATTEMPT_ID, attemptToken: TOKEN, state: 'RUNNING',
  expiresAt: '2030-01-01T00:00:00.000Z',
  plan: {
    channelAccountId: ACCOUNT_ID, collectorVersion: 'wing-inventory-v1', vendorId: 'A001',
    listUrl: 'https://wing.coupang.com/list', detailUrl: 'https://wing.coupang.com/detail', publicationRevision: '0',
  },
};
const owner = {
  attemptId: ATTEMPT_ID, channelAccountId: ACCOUNT_ID, idempotencyKey: KEY,
  state: 'RUNNING', plan: permit.plan, expiresAt: permit.expiresAt,
  phase: 'hydration', collectorVersion: permit.plan.collectorVersion,
  progress: { publishedProducts: 0 }, error: null,
};
const mocks = vi.hoisted(() => ({
  begin: vi.fn(), read: vi.fn(), fail: vi.fn(), startBrowser: vi.fn(),
  getBrowserStatus: vi.fn(), detect: vi.fn(), send: vi.fn(), syncAlert: vi.fn(),
}));
vi.mock('@/lib/extension-bridge', () => ({ detectExtensionId: mocks.detect, sendToExtension: mocks.send }));
vi.mock('@/lib/browser-collection-session', () => ({ syncBrowserCollectionAlert: mocks.syncAlert }));
vi.mock('@/lib/coupang-catalog-extension', () => ({
  startCoupangCatalogBrowser: mocks.startBrowser,
  getCoupangCatalogBrowserStatus: mocks.getBrowserStatus,
}));
vi.mock('../lib/channel-listings-api', () => ({
  channelListingsApi: {
    startCoupangCatalogCollection: mocks.begin,
    getCoupangCatalogCollection: mocks.read,
    failCoupangCatalogCollection: mocks.fail,
  },
}));
function setup(linkedAttemptId: string | null = null) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) =>
    <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const view = renderHook(() => useCoupangCatalogImport(ACCOUNT_ID, linkedAttemptId), { wrapper });
  return { ...view, client };
}
beforeEach(() => {
  localStorage.clear();
  vi.resetAllMocks();
  mocks.begin.mockResolvedValue(permit);
  mocks.read.mockResolvedValue(owner);
  mocks.startBrowser.mockResolvedValue('extension-id');
  mocks.detect.mockResolvedValue('extension-id');
  mocks.getBrowserStatus.mockResolvedValue({ attemptId: ATTEMPT_ID, active: true, attention: null });
  mocks.fail.mockResolvedValue(undefined);
});

it('hands off the exact permit and persists correlation without caching the token', async () => {
  const { result, client } = setup();
  await act(async () => { await result.current.start(); });
  expect(mocks.startBrowser).toHaveBeenCalledWith({ permit });
  expect(mocks.begin).toHaveBeenCalledWith(ACCOUNT_ID, { collectorVersion: 'wing-inventory-v1' }, expect.any(String));
  expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual({
    channelAccountId: ACCOUNT_ID, attemptId: ATTEMPT_ID, idempotencyKey: mocks.begin.mock.calls[0][2],
  });
  expect(JSON.stringify(client.getQueryCache().getAll().map((q) => q.state.data))).not.toContain(TOKEN);
  expect(mocks.syncAlert).not.toHaveBeenCalled();
});

it('uses a new key only for an explicit start after a known terminal owner', async () => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ channelAccountId: ACCOUNT_ID, attemptId: ATTEMPT_ID, idempotencyKey: KEY }));
  mocks.read.mockResolvedValue({ ...owner, state: 'FAILED' });
  const nextPermit = { ...permit, attemptId: '00000000-0000-4000-8000-000000000005' };
  mocks.begin.mockResolvedValue(nextPermit);
  const { result } = setup();
  await waitFor(() => expect(result.current.serverStatus?.state).toBe('FAILED'));
  await act(async () => { await result.current.start(); });
  expect(mocks.begin.mock.calls[0][2]).not.toBe(KEY);
  expect(mocks.startBrowser).toHaveBeenCalledWith({ permit: nextPermit });
});

it('saves a pending key before begin and reuses it after an unknown ACK and reload without auto-starting', async () => {
  mocks.begin.mockImplementationOnce(async () => {
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual({
      channelAccountId: ACCOUNT_ID, attemptId: null, idempotencyKey: expect.any(String),
    });
    throw new Error('lost begin ACK');
  });
  const first = setup();
  await act(async () => { await expect(first.result.current.start()).rejects.toThrow('lost begin ACK'); });
  const key = mocks.begin.mock.calls[0][2];
  first.unmount();
  const resumed = setup();
  expect(mocks.begin).toHaveBeenCalledTimes(1);
  await act(async () => { await resumed.result.current.start(); });
  expect(mocks.begin.mock.calls[1][2]).toBe(key);
  expect(mocks.fail).not.toHaveBeenCalled();
});

it('recovers the safe deep-link key and original collector input without auto-dispatching', async () => {
  mocks.read.mockResolvedValue({ ...owner, plan: { ...owner.plan, collectorVersion: 'original-version' } });
  const { result } = setup(ATTEMPT_ID);
  await waitFor(() => expect(result.current.serverStatus?.attemptId).toBe(ATTEMPT_ID));
  expect(mocks.begin).not.toHaveBeenCalled();
  expect(mocks.startBrowser).not.toHaveBeenCalled();
  await act(async () => { await result.current.start(); });
  expect(mocks.begin).toHaveBeenCalledWith(ACCOUNT_ID, { collectorVersion: 'original-version' }, KEY);
  expect(mocks.startBrowser).toHaveBeenCalledWith({ permit });
});

it('replays the same attempt after a lost dispatch ACK without sending owner failure', async () => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ channelAccountId: ACCOUNT_ID, attemptId: null, idempotencyKey: KEY }));
  mocks.startBrowser.mockRejectedValueOnce(new Error('lost dispatch ACK'));
  const first = setup();
  await act(async () => { await expect(first.result.current.start()).rejects.toThrow('lost dispatch ACK'); });
  first.unmount();
  const resumed = setup();
  await act(async () => { await resumed.result.current.start(); });
  expect(mocks.begin.mock.calls.map((call) => call[2])).toEqual([KEY, KEY]);
  expect(mocks.startBrowser.mock.calls).toEqual([[{ permit }], [{ permit }]]);
  expect(mocks.fail).not.toHaveBeenCalled();
});

it('cancels with the recovered owner permit even when the extension is missing', async () => {
  mocks.detect.mockResolvedValue(null);
  mocks.fail.mockImplementation(async () => {
    mocks.read.mockResolvedValue({ ...owner, state: 'FAILED', error: { code: 'USER_CANCELLED' } });
  });
  const { result } = setup(ATTEMPT_ID);
  await waitFor(() => expect(result.current.serverStatus?.state).toBe('RUNNING'));
  await act(async () => { await result.current.cancel(); });
  expect(mocks.begin).toHaveBeenCalledWith(ACCOUNT_ID, { collectorVersion: 'wing-inventory-v1' }, KEY);
  expect(mocks.fail).toHaveBeenCalledWith(ACCOUNT_ID, ATTEMPT_ID, TOKEN, {
    code: 'USER_CANCELLED', message: '사용자가 수집을 중단했습니다.', phase: 'hydration',
  });
  expect(result.current.serverStatus?.state).toBe('FAILED');
  expect(mocks.send).not.toHaveBeenCalled();
  expect(mocks.syncAlert).not.toHaveBeenCalled();
});

it.each(['FAILED', 'COMPLETE'])('reconciles a lost failure ACK with owner %s before best-effort browser cleanup', async (state) => {
  mocks.fail.mockImplementation(async () => {
    expect(mocks.send).not.toHaveBeenCalled();
    mocks.read.mockResolvedValue({ ...owner, state });
    throw new Error('lost fail ACK');
  });
  mocks.send.mockRejectedValue(new Error('extension gone'));
  const { result } = setup(ATTEMPT_ID);
  await waitFor(() => expect(result.current.serverStatus?.state).toBe('RUNNING'));
  await act(async () => { await result.current.cancel(); });
  expect(result.current.serverStatus?.state).toBe(state);
  expect(mocks.fail).toHaveBeenCalledTimes(1);
  expect(mocks.send).toHaveBeenCalledWith('extension-id', { action: 'cancelCoupangCatalogImport', attemptId: ATTEMPT_ID });
});

it('does not claim cancellation when fail ACK is unknown and the owner remains RUNNING', async () => {
  mocks.fail.mockRejectedValue(new Error('lost fail ACK'));
  const { result } = setup(ATTEMPT_ID);
  await waitFor(() => expect(result.current.serverStatus?.state).toBe('RUNNING'));
  await act(async () => { await expect(result.current.cancel()).rejects.toThrow('lost fail ACK'); });
  expect(result.current.serverStatus?.state).toBe('RUNNING');
  expect(mocks.fail).toHaveBeenCalledTimes(1);
});

it('reads local attention for a FAILED owner and opens its tab only after an explicit click', async () => {
  mocks.read.mockResolvedValue({ ...owner, state: 'FAILED' });
  const { result } = setup(ATTEMPT_ID);
  await waitFor(() => expect(mocks.getBrowserStatus).toHaveBeenCalledWith('extension-id', ATTEMPT_ID));
  expect(mocks.send).not.toHaveBeenCalled();
  await act(async () => { await result.current.openAttention(); });
  expect(mocks.send).toHaveBeenCalledWith('extension-id', { action: 'openCollectionAttentionTab', attemptId: ATTEMPT_ID });
});

it('refreshes attention once when a polled RUNNING owner becomes FAILED', async () => {
  const { result, client } = setup(ATTEMPT_ID);
  await waitFor(() => expect(result.current.extensionStatus?.active).toBe(true));
  mocks.getBrowserStatus.mockResolvedValue({
    attemptId: ATTEMPT_ID, active: false,
    attention: { reason: 'login_required', message: 'Wing 로그인 확인', canOpenTab: true },
  });
  await act(async () => {
    client.setQueryData(queryKeys.coupangCatalogImports.run(ACCOUNT_ID, ATTEMPT_ID), { ...owner, state: 'FAILED' });
  });
  await waitFor(() => expect(result.current.extensionStatus?.attention?.message).toBe('Wing 로그인 확인'));
});

it('invalidates the four canonical readers once only after owner COMPLETE, despite stale browser activity', async () => {
  const { result, client } = setup(ATTEMPT_ID);
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  await waitFor(() => expect(result.current.extensionStatus?.active).toBe(true));
  const canonical = [
    queryKeys.channelListings.all, queryKeys.products.operations.all,
    queryKeys.channelProductMappings.all, queryKeys.channelSkuAvailability.all,
  ];
  expect(invalidate).not.toHaveBeenCalled();
  await act(async () => {
    client.setQueryData(queryKeys.coupangCatalogImports.run(ACCOUNT_ID, ATTEMPT_ID), { ...owner, state: 'COMPLETE' });
  });
  await waitFor(() => expect(invalidate).toHaveBeenCalledTimes(4));
  for (const queryKey of canonical) expect(invalidate).toHaveBeenCalledWith({ queryKey });
  await act(async () => {
    client.setQueryData(queryKeys.coupangCatalogImports.run(ACCOUNT_ID, ATTEMPT_ID), { ...owner, state: 'COMPLETE', updatedAt: 'later' });
  });
  expect(invalidate).toHaveBeenCalledTimes(4);
});
