import { createElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  readActiveSellpiaShipmentTrackingAttempt,
  rememberActiveSellpiaShipmentTrackingAttempt,
} from '../lib/sellpia-shipment-tracking-source-owner';
import { useSellpiaShipmentTrackingSourceOwner as useOwner } from './use-sellpia-shipment-tracking-source-owner';

const api = vi.hoisted(() => ({
  getParsed: vi.fn(),
  post: vi.fn(),
  fetchRaw: vi.fn(),
}));
const extension = vi.hoisted(() => ({
  detect: vi.fn(),
  send: vi.fn(),
}));
const auth = vi.hoisted(() => ({ organizationId: 'org-1' as string | null }));

vi.mock('@/lib/api-client', () => ({ apiClient: api }));
vi.mock('@/lib/extension-bridge', () => ({
  detectOrderCollectionExtensionRuntime: extension.detect,
  sendToExtension: extension.send,
}));
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: auth.organizationId ? { organizationId: auth.organizationId } : null }),
}));
vi.mock('../lib/order-collection-page-model', () => ({ todayYmd: () => '2026-09-07' }));

const ATTEMPT_ID = '11111111-1111-4111-8111-111111111111';
const ATTEMPT_TOKEN = '22222222-2222-4222-8222-222222222222';

function attempt(
  state: 'RUNNING' | 'COMPLETE' | 'FAILED' = 'RUNNING',
  patch: Record<string, unknown> = {},
) {
  return {
    attemptId: ATTEMPT_ID,
    sourceImportRunId: ATTEMPT_ID,
    state,
    plan: {
      sourceType: 'sellpia_shipment_tracking',
      parserVersion: 'sellpia-shipment-tracking-v1',
      sourceOrigin: 'https://kiditem.sellpia.com',
      sourceAccountKey: 'kiditem',
      startDate: '2026-09-07',
      endDate: '2026-09-07',
    },
    expiresAt: '2099-01-01T00:00:00.000Z',
    artifactId: state === 'COMPLETE' ? '33333333-3333-4333-8333-333333333333' : null,
    sourceFileName: state === 'COMPLETE' ? 'sellpia-shipment-tracking-v1.json' : null,
    sourceContentType: state === 'COMPLETE' ? 'application/json' : null,
    contentChecksum: null,
    sourceByteCount: state === 'COMPLETE' ? 10 : null,
    errorCode: null,
    errorMessage: null,
    ...patch,
  };
}

function control() {
  return { ...attempt(), attemptToken: ATTEMPT_TOKEN };
}

function renderOwner() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const rendered = renderHook(() => useOwner(), {
    wrapper: ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client }, children),
  });
  return rendered;
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  auth.organizationId = 'org-1';
  extension.detect.mockResolvedValue({
    status: 'ready',
    extensionId: 'sellpia-extension',
    version: '1',
  });
  extension.send.mockResolvedValue({ success: true, attemptId: ATTEMPT_ID, terminalState: 'COMPLETE' });
});

describe('Sellpia shipment tracking source owner', () => {
  it('persists a lost begin ACK key and reuses it on the next explicit start', async () => {
    const owner = renderOwner();
    api.post.mockRejectedValueOnce(new Error('begin response lost'));

    await act(async () => {
      await expect(owner.result.current.collect()).rejects.toThrow('begin response lost');
    });
    const pending = readActiveSellpiaShipmentTrackingAttempt('org-1');
    expect(pending).toEqual({ attemptId: null, idempotencyKey: expect.any(String) });

    const started = control();
    const complete = attempt('COMPLETE');
    api.post.mockResolvedValueOnce(started);
    api.getParsed.mockResolvedValueOnce(complete);
    api.fetchRaw.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        rows: [{
          ordNo: 'ORDER-1', itemNo: '', invNo: 'INV-1', courier: '1136',
          provider: '아이스크림몰',
        }],
        total: 1,
        range: { start: '2026-09-07', end: '2026-09-07' },
      }),
    });

    await act(async () => {
      await expect(owner.result.current.collect()).resolves.toHaveLength(1);
    });
    const keys = api.post.mock.calls.map((call) =>
      new Headers(call[2]?.headers).get('Idempotency-Key'));
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
    expect(extension.send).toHaveBeenCalledWith(
      'sellpia-extension',
      { action: 'collectSellpiaDeliTracking', attemptId: ATTEMPT_ID },
      190_000,
    );
  });

  it('reads a persisted owner on reload without detecting or starting the provider', async () => {
    rememberActiveSellpiaShipmentTrackingAttempt('org-1', {
      attemptId: ATTEMPT_ID,
      idempotencyKey: null,
    });
    api.getParsed.mockResolvedValue(attempt());

    renderOwner();
    await waitFor(() => expect(api.getParsed).toHaveBeenCalledWith(
      `/api/orders/sellpia-shipment-tracking/attempts/${ATTEMPT_ID}`,
      expect.anything(),
    ));
    expect(extension.detect).not.toHaveBeenCalled();
    expect(extension.send).not.toHaveBeenCalled();
    expect(api.post).not.toHaveBeenCalled();
  });
});
