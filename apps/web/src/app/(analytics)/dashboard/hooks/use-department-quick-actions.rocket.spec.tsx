import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import { useDepartmentQuickActions } from './use-department-quick-actions';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
// Keep Rocket's source hook, fetch, parsers and public Chrome bridge real.
vi.mock('@/hooks/useAllMarketplaceOrderCollection', () => ({ usePersistedAllMarketplaceOrderCollection: () => ({ collectAllOrders: vi.fn() }) }));
vi.mock('@/hooks/useRocketChannelAccounts', () => ({ useRocketChannelAccounts: () => ({ rocketAccounts: [{ id: '22222222-2222-4222-8222-222222222222' }], isBootstrapping: false }) }));
vi.mock('@/hooks/useSellpiaInventoryFreshness', () => ({ useSellpiaInventoryFreshness: () => ({ requestRefresh: vi.fn() }) }));
vi.mock('@/hooks/use-trend-source-collection', () => ({ useTrendSourceCollection: () => ({ collect: vi.fn() }) }));
vi.mock('@/lib/coupang-shipment-summary-action', () => ({ collectAndPersistCoupangShipmentSummary: vi.fn() }));

afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); localStorage.clear(); });

it.each(['COMPLETE', 'FAILED', 'RUNNING'] as const)('Dashboard uses owner %s, never raw publication or automatic collection', async (state) => {
  const channelAccountId = '22222222-2222-4222-8222-222222222222';
  const attemptId = '11111111-1111-4111-8111-111111111111';
  const now = new Date();
  const date = (value: Date) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  const plan = { channelAccountId, from: date(new Date(now.getFullYear(), now.getMonth(), 1)), to: date(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
    status: '', dateType: 'WAREHOUSING_PLAN_DATE', requireConfirmation: true, sourceType: 'coupang_rocket_po_catalog', parserVersion: 'rocket-po-v1',
    vendorExpectations: { rocketVendorId: null, sharedCoupangVendorId: null } };
  const attempt = { attemptId, channelAccountId, state, plan, generation: '1', expiresAt: '2099-01-01T00:00:00Z',
    actualCutoffAt: state === 'COMPLETE' ? '2026-07-31T01:00:00Z' : null, errorCode: null, errorMessage: state === 'FAILED' ? 'provider failed' : null };
  const calls: Array<{ path: string; method: string; body: Record<string, unknown>; key: string | null }> = [];
  const messages: Record<string, unknown>[] = [];
  let started = false;
  localStorage.setItem('kiditem-order-ext-id', 'rocket-extension');
  vi.stubGlobal('chrome', { runtime: { sendMessage(_id: string, message: Record<string, unknown>, callback: (result: unknown) => void) {
    messages.push(message);
    callback(message.action === 'ping' ? { success: true, version: 'test', capabilities: {
      kiditemEnvironmentProfilesV1: true, coupangRocketPoSourceOwnerV1: true,
    } } : { success: true, attemptId, terminalState: 'COMPLETE' });
  } } });
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const path = new URL(url, 'http://localhost').pathname;
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    calls.push({ path, method: init?.method ?? 'GET', body, key: new Headers(init?.headers).get('Idempotency-Key') });
    if (path.endsWith('/source')) return Response.json({ status: state === 'COMPLETE' && started ? 'READY' : 'MISSING', refreshing: started && state === 'RUNNING',
      latestAttempt: started ? attempt : null, latestComplete: state === 'COMPLETE' && started ? attempt : null });
    if (path === '/api/auth/extension-handoff') return Response.json({ token: 'a'.repeat(43) });
    if (path.endsWith('/attempts')) { started = true; return Response.json({ ...attempt, state: 'RUNNING' }); }
    if (path.endsWith('/attempts/' + attemptId)) return Response.json(attempt);
    if (body.action === 'loadSavedRocketCollection') return Response.json({ channelAccountId, sourceImportRunId: attemptId, rows: [], exportedPoLineIds: [],
      collection: { collectionRunId: attemptId, vendorId: '', listPagesRead: 1, totalListPages: 1, truncated: false, detailPoCount: 0, failedPoNumbers: [] } });
    if (body.action === 'previewRocket') return Response.json({ status: 'ready', collectionRunId: attemptId, catalog: null, inventoryGeneration: null, rows: [] });
    return Response.json({}, { status: 404 });
  }));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const hook = renderHook(() => useDepartmentQuickActions(), { wrapper });
  await waitFor(() => expect(calls.some(({ path }) => path.endsWith('/source'))).toBe(true));
  expect(calls.every(({ method }) => method === 'GET')).toBe(true);
  await act(async () => {
    const action = hook.result.current.start('collectCoupangRocketPurchaseOrders');
    if (state === 'FAILED') await expect(action).rejects.toThrow('provider failed');
    else await action;
  });
  expect(calls.find(({ path }) => path.endsWith('/attempts'))).toMatchObject({ key: expect.any(String), body: {
    channelAccountId, from: plan.from, to: plan.to, status: '', dateType: 'WAREHOUSING_PLAN_DATE', requireConfirmation: true,
  } });
  expect(messages.filter(({ action }) => action === 'collectRocketPoRows')).toEqual([{ action: 'collectRocketPoRows', attemptId }]);
  if (state === 'COMPLETE') {
    expect(toast.success).toHaveBeenCalledOnce();
    expect(calls.find(({ body }) => body.action === 'previewRocket')?.body).toEqual({ action: 'previewRocket', channelAccountId,
      sourceImportRunId: attemptId, editedQuantities: {}, clampEditedQuantities: true, previewScope: 'confirmation_requested' });
  } else {
    expect(toast.success).not.toHaveBeenCalled();
    expect(calls.some(({ body }) => body.action === 'previewRocket')).toBe(false);
    if (state === 'RUNNING') expect(toast.info).toHaveBeenCalledOnce();
  }
  expect(calls.some(({ method, path }) => method === 'PUT' || path.endsWith('/fail'))).toBe(false);
  hook.unmount(); client.clear();
});
