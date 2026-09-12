import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { collectRocketPoRowsForConfirmationFromExtension } from './rocket-sales-collection';

const attemptId = '11111111-1111-4111-8111-111111111111';
const channelAccountId = '22222222-2222-4222-8222-222222222222';
const input = { channelAccountId, from: '2026-07-01', to: '2026-07-31', idempotencyKey: 'explicit-request' };
const attempt = {
  attemptId, channelAccountId, state: 'RUNNING', generation: '1',
  plan: { channelAccountId, from: input.from, to: input.to, status: '', dateType: 'WAREHOUSING_PLAN_DATE',
    requireConfirmation: true, sourceType: 'coupang_rocket_po_catalog', parserVersion: 'rocket-po-v1',
    vendorExpectations: { rocketVendorId: 'VENDOR-1', sharedCoupangVendorId: null } },
  expiresAt: '2099-01-01T00:00:00Z', actualCutoffAt: null, errorCode: null, errorMessage: null,
};
const saved = {
  channelAccountId, sourceImportRunId: attemptId,
  collection: { collectionRunId: attemptId, vendorId: '', listPagesRead: 1, totalListPages: 1,
    truncated: false, detailPoCount: 0, failedPoNumbers: [] },
  rows: [], exportedPoLineIds: [],
};

describe('Rocket collection at HTTP and Chrome boundaries', () => {
  const messages: Record<string, unknown>[] = [];
  const calls: Array<{ path: string; init?: RequestInit; body: Record<string, unknown> }> = [];
  beforeEach(() => {
    messages.length = 0; calls.length = 0;
    localStorage.setItem('kiditem-order-ext-id', 'rocket-extension');
    vi.stubGlobal('chrome', { runtime: { sendMessage(_id: string, message: Record<string, unknown>, callback: (result: unknown) => void) {
      messages.push(message);
      if (message.action === 'ping') return callback({ success: true, version: 'test', capabilities: {
        kiditemEnvironmentProfilesV1: true, coupangRocketPoSourceOwnerV1: true,
      } });
      callback({ success: true, attemptId, terminalState: 'COMPLETE' });
    } } });
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      const path = new URL(url, 'http://localhost').pathname;
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      calls.push({ path, init, body });
      if (path === '/api/auth/extension-handoff') return Response.json({ token: 'a'.repeat(43) });
      if (path === '/api/channels/rocket-po/attempts') return Response.json({ ...attempt, attemptToken: '33333333-3333-4333-8333-333333333333' });
      if (path === '/api/channels/rocket-po/attempts/' + attemptId) return Response.json({ ...attempt, state: 'COMPLETE', actualCutoffAt: '2026-07-31T01:00:00Z' });
      if (path === '/api/purchase-orders' && body.action === 'loadSavedRocketCollection') return Response.json(saved);
      return Response.json({ message: 'unexpected ' + path }, { status: 404 });
    }));
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); localStorage.clear(); });

  it('begins the exact confirmation plan and sends only owner identity before reading canonical empty COMPLETE', async () => {
    const result = await collectRocketPoRowsForConfirmationFromExtension(input);
    const begin = calls.find(({ path }) => path.endsWith('/attempts'))!;
    expect(begin.body).toEqual({
      channelAccountId, from: input.from, to: input.to, status: '', dateType: 'WAREHOUSING_PLAN_DATE', requireConfirmation: true,
    });
    expect(new Headers(begin.init?.headers).get('Idempotency-Key')).toBe(input.idempotencyKey);
    expect(messages.filter(({ action }) => action === 'collectRocketPoRows')).toEqual([{ action: 'collectRocketPoRows', attemptId }]);
    expect(result).toMatchObject({ sourceImportRunId: attemptId, rows: [], poCount: 0 });
    expect(calls.find(({ body }) => body.action === 'loadSavedRocketCollection')?.body).toEqual({
      action: 'loadSavedRocketCollection', channelAccountId, sourceImportRunId: attemptId,
    });
    expect(calls.some(({ path, init }) => path.endsWith('/fail') || init?.method === 'PUT')).toBe(false);
    expect(messages.some(({ action }) => action === 'finalizeCollectionSession')).toBe(false);
  });

  it.each(['COMPLETE', 'FAILED', 'RUNNING'])('reads exact owner %s after a disconnected callback without publishing from the page', async (state) => {
    const originalFetch = fetch;
    vi.stubGlobal('fetch', vi.fn((url: string, init?: RequestInit) => String(url).endsWith('/attempts/' + attemptId)
      ? Promise.resolve(Response.json({ ...attempt, state, errorMessage: state === 'FAILED' ? 'provider failed' : null }))
      : originalFetch(url, init)));
    const runtime = (globalThis as unknown as { chrome: { runtime: { sendMessage: (...args: unknown[]) => void } } }).chrome.runtime;
    const originalSend = runtime.sendMessage;
    runtime.sendMessage = (...args) => {
      if ((args[1] as { action: string }).action === 'collectRocketPoRows') throw new Error('port disconnected');
      originalSend(...args);
    };
    if (state === 'COMPLETE') {
      await expect(collectRocketPoRowsForConfirmationFromExtension(input)).resolves.toMatchObject({ sourceImportRunId: attemptId });
    } else {
      await expect(collectRocketPoRowsForConfirmationFromExtension(input)).rejects.toMatchObject({ attempt: { state, attemptId } });
      expect(calls.some(({ body }) => body.action === 'loadSavedRocketCollection')).toBe(false);
    }
    expect(calls.some(({ path, init }) => path.endsWith('/fail') || init?.method === 'PUT')).toBe(false);
  });

  it('replays a lost begin response with the same key and rejects a false extension success against FAILED owner', async () => {
    const originalFetch = fetch;
    const keys: string[] = [];
    vi.stubGlobal('fetch', vi.fn((url: string, init?: RequestInit) => {
      if (String(url).endsWith('/attempts')) {
        keys.push(new Headers(init?.headers).get('Idempotency-Key')!);
        if (keys.length === 1) return Promise.reject(new TypeError('response lost'));
      }
      if (String(url).endsWith('/attempts/' + attemptId)) return Promise.resolve(Response.json({ ...attempt, state: 'FAILED' }));
      return originalFetch(url, init);
    }));
    await expect(collectRocketPoRowsForConfirmationFromExtension(input)).rejects.toMatchObject({ attempt: { state: 'FAILED' } });
    expect(keys).toEqual([input.idempotencyKey, input.idempotencyKey]);
    expect(calls.some(({ body }) => body.action === 'loadSavedRocketCollection')).toBe(false);
  });

  it('keeps the 190 second callback budget, then reads owner without failing the source', async () => {
    vi.useFakeTimers();
    const runtime = (globalThis as unknown as { chrome: { runtime: { sendMessage: (...args: unknown[]) => void } } }).chrome.runtime;
    const originalSend = runtime.sendMessage;
    runtime.sendMessage = (...args) => {
      if ((args[1] as { action: string }).action === 'collectRocketPoRows') { messages.push(args[1] as Record<string, unknown>); return; }
      originalSend(...args);
    };
    const result = collectRocketPoRowsForConfirmationFromExtension(input);
    await vi.advanceTimersByTimeAsync(0);
    expect(messages.some(({ action }) => action === 'collectRocketPoRows')).toBe(true);
    await vi.advanceTimersByTimeAsync(189999);
    expect(calls.some(({ path }) => path.endsWith('/attempts/' + attemptId))).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await expect(result).resolves.toMatchObject({ sourceImportRunId: attemptId });
  });

  it('retains a known RUNNING attempt when its exact acknowledgement read is unavailable', async () => {
    const originalFetch = fetch;
    vi.stubGlobal('fetch', vi.fn((url: string, init?: RequestInit) => String(url).endsWith('/attempts/' + attemptId)
      ? Promise.resolve(Response.json({ message: 'read unavailable' }, { status: 503 }))
      : originalFetch(url, init)));
    await expect(collectRocketPoRowsForConfirmationFromExtension(input)).rejects.toMatchObject({ attempt: { attemptId, state: 'RUNNING' } });
    expect(calls.some(({ body }) => body.action === 'loadSavedRocketCollection')).toBe(false);
  });
});
