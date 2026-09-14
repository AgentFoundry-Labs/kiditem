import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { queryKeys } from '@/lib/query-keys';
import { useDepartmentQuickActions } from './use-department-quick-actions';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
// Keep Rocket's control, fetch, parsers and public Chrome bridge real.
vi.mock('@/hooks/useAllMarketplaceOrderCollection', () => ({ usePersistedAllMarketplaceOrderCollection: () => ({ collectAllOrders: vi.fn() }) }));
vi.mock('@/hooks/useRocketChannelAccounts', () => ({ useRocketChannelAccounts: () => ({ rocketAccounts: [{ id: '22222222-2222-4222-8222-222222222222' }], isBootstrapping: false }) }));
vi.mock('@/app/(inventory)/_shared/sellpia-inventory-source-owner', () => ({ useSellpiaInventorySourceOwner: () => ({ start: vi.fn(), state: null, isStarting: false }) }));
vi.mock('@/hooks/use-trend-source-collection', () => ({ useTrendSourceCollection: () => ({ collect: vi.fn() }) }));
vi.mock('@/lib/coupang-shipment-summary-action', () => ({ collectAndPersistCoupangShipmentSummary: vi.fn() }));

afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); localStorage.clear(); });

it("Dashboard starts this month's Rocket collection through the account's shared control and never previews", async () => {
  const channelAccountId = '22222222-2222-4222-8222-222222222222';
  const attemptId = '11111111-1111-4111-8111-111111111111';
  const now = new Date();
  const date = (value: Date) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  const plan = { channelAccountId, from: date(new Date(now.getFullYear(), now.getMonth(), 1)), to: date(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
    status: '', dateType: 'WAREHOUSING_PLAN_DATE', requireConfirmation: true, sourceType: 'coupang_rocket_po_catalog', parserVersion: 'rocket-po-v1',
    vendorExpectations: { rocketVendorId: null, sharedCoupangVendorId: null } };
  const running = { attemptId, channelAccountId, state: 'RUNNING', plan, generation: '1', expiresAt: '2099-01-01T00:00:00Z',
    actualCutoffAt: null, errorCode: null, errorMessage: null };
  const calls: Array<{ path: string; method: string; body: Record<string, unknown>; key: string | null }> = [];
  const messages: Record<string, unknown>[] = [];
  let started = false;
  localStorage.setItem('kiditem-order-ext-id', 'rocket-extension');
  vi.stubGlobal('chrome', { runtime: { sendMessage(_id: string, message: Record<string, unknown>, callback: (result: unknown) => void) {
    messages.push(message);
    // The extension answers collectRocketPoRows only when the collection ends.
    if (message.action === 'collectRocketPoRows') return;
    callback(message.action === 'ping' ? { success: true, version: 'test', capabilities: {
      kiditemEnvironmentProfilesV1: true, coupangRocketPoSourceOwnerV1: true,
    } } : { success: true });
  } } });
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const path = new URL(url, 'http://localhost').pathname;
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    calls.push({ path, method: init?.method ?? 'GET', body, key: new Headers(init?.headers).get('Idempotency-Key') });
    if (path.endsWith('/source')) return Response.json({ ready: false, latestAttempt: started ? running : null, latestComplete: null });
    if (path === '/api/auth/extension-handoff') return Response.json({ token: 'a'.repeat(43) });
    if (path.endsWith('/attempts')) { started = true; return Response.json({ ...running, attemptToken: '33333333-3333-4333-8333-333333333333' }); }
    return Response.json({}, { status: 404 });
  }));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const hook = renderHook(() => useDepartmentQuickActions(), { wrapper });
  await waitFor(() => expect(client.getQueryData(queryKeys.orders.rocketPoSource(channelAccountId))).toBeDefined());
  expect(calls.every(({ method }) => method === 'GET')).toBe(true);

  await act(async () => { await hook.result.current.start('collectCoupangRocketPurchaseOrders'); });

  await waitFor(() => expect(messages.filter(({ action }) => action === 'collectRocketPoRows'))
    .toEqual([{ action: 'collectRocketPoRows', attemptId }]));
  expect(calls.filter(({ path }) => path.endsWith('/attempts'))).toEqual([expect.objectContaining({ key: expect.any(String), body: {
    channelAccountId, from: plan.from, to: plan.to, status: '', dateType: 'WAREHOUSING_PLAN_DATE', requireConfirmation: true,
  } })]);
  expect(calls.some(({ body }) => body.action === 'previewRocket' || body.action === 'loadSavedRocketCollection')).toBe(false);
  expect(calls.some(({ method, path }) => method === 'PUT' || path.endsWith('/fail'))).toBe(false);
  hook.unmount(); client.clear();
});
