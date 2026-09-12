import { afterEach, expect, it, vi } from 'vitest';
import { collectAndPersistRocketPurchaseOrders } from '../rocket-purchase-collection-action';

afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });

it('keeps owner COMPLETE and its saved callback when downstream preview fails', async () => {
  const channelAccountId = '22222222-2222-4222-8222-222222222222';
  const attemptId = '11111111-1111-4111-8111-111111111111';
  const plan = { channelAccountId, from: '2026-07-01', to: '2026-07-31', status: '',
    dateType: 'WAREHOUSING_PLAN_DATE', requireConfirmation: true,
    sourceType: 'coupang_rocket_po_catalog', parserVersion: 'rocket-po-v1',
    vendorExpectations: { rocketVendorId: null, sharedCoupangVendorId: null } };
  const complete = { attemptId, channelAccountId, state: 'COMPLETE', generation: '1', plan,
    expiresAt: '2099-01-01T00:00:00Z', actualCutoffAt: '2026-07-31T01:00:00Z', errorCode: null, errorMessage: null };
  const requests: Array<{ path: string; method?: string; body: Record<string, unknown> }> = [];
  const messages: Record<string, unknown>[] = [];
  localStorage.setItem('kiditem-order-ext-id', 'rocket-extension');
  vi.stubGlobal('chrome', { runtime: { sendMessage(_id: string, message: Record<string, unknown>, callback: (result: unknown) => void) {
    messages.push(message);
    callback(message.action === 'ping' ? { success: true, version: 'test', capabilities: {
      kiditemEnvironmentProfilesV1: true, coupangRocketPoSourceOwnerV1: true,
    } } : { success: true });
  } } });
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const path = new URL(url, 'http://localhost').pathname;
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    requests.push({ path, method: init?.method, body });
    if (path === '/api/auth/extension-handoff') return Response.json({ token: 'a'.repeat(43) });
    if (path.startsWith('/api/channels/rocket-po/attempts')) return Response.json(complete);
    if (body.action === 'loadSavedRocketCollection') return Response.json({
      channelAccountId, sourceImportRunId: attemptId, rows: [], exportedPoLineIds: [],
      collection: { collectionRunId: attemptId, vendorId: '', listPagesRead: 1, totalListPages: 1, truncated: false, detailPoCount: 0, failedPoNumbers: [] },
    });
    if (body.action === 'previewRocket') return Response.json({ message: 'preview unavailable' }, { status: 503 });
    return Response.json({ message: 'unexpected' }, { status: 404 });
  }));
  const onCatalogSaved = vi.fn();
  await expect(collectAndPersistRocketPurchaseOrders({
    channelAccountId, from: plan.from, to: plan.to, idempotencyKey: 'same-explicit-request',
    onCatalogSaved,
    createPreviewRequest: (collected) => ({
      channelAccountId, sourceImportRunId: collected.sourceImportRunId, editedQuantities: {},
      clampEditedQuantities: true, previewScope: 'confirmation_requested',
    }),
  })).rejects.toThrow('preview unavailable');
  expect(onCatalogSaved).toHaveBeenCalledTimes(1);
  expect(requests.find(({ body }) => body.action === 'previewRocket')?.body).toEqual({
    action: 'previewRocket', channelAccountId, sourceImportRunId: attemptId, editedQuantities: {},
    clampEditedQuantities: true, previewScope: 'confirmation_requested',
  });
  expect(requests.some(({ path, method }) => path.endsWith('/fail') || method === 'PUT')).toBe(false);
  expect(messages.some(({ action }) => action === 'finalizeCollectionSession' || action === 'collectRocketPoRows')).toBe(false);
});
