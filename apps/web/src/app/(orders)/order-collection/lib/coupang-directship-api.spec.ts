import { beforeEach, describe, expect, it, vi } from 'vitest';

const bridge = vi.hoisted(() => ({
  detectOrderCollectionExtensionId: vi.fn(),
  sendToExtension: vi.fn(),
}));
const api = vi.hoisted(() => ({ fetchRaw: vi.fn() }));

vi.mock('@/lib/extension-bridge', () => bridge);
vi.mock('@/lib/api-client', () => ({ apiClient: api }));

import {
  collectCoupangDirectFromExtension,
  convertCoupangDirectToSellpiaFile,
} from './coupang-directship-api';

const RUN_ID = '33333333-3333-4333-8333-333333333333';

describe('Coupang direct-shipment collection lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps the extension session open for backend file generation', async () => {
    bridge.sendToExtension.mockResolvedValue({
      success: true,
      pos: [],
      centers: {},
    });

    await collectCoupangDirectFromExtension({
      runId: RUN_ID,
      extensionId: 'order-extension',
    });

    expect(bridge.sendToExtension).toHaveBeenCalledWith(
      'order-extension',
      expect.objectContaining({
        action: 'collectCoupangDirectOrders',
        runId: RUN_ID,
        deferTerminal: true,
      }),
      240000,
    );
  });

  it('passes cancellation to backend conversion', async () => {
    const abortController = new AbortController();
    api.fetchRaw.mockResolvedValue(new Response('conversion failed', { status: 400 }));

    await expect(convertCoupangDirectToSellpiaFile(
      {
        pos: [{ seq: 'PO-1', transport: 'SHIPMENT' }],
        centers: {},
      },
      'SHIPMENT',
      { download: false, signal: abortController.signal },
    )).rejects.toThrow('conversion failed');

    expect(api.fetchRaw).toHaveBeenCalledWith(
      '/api/orders/collection/coupang-directship/convert',
      expect.objectContaining({ signal: abortController.signal }),
    );
  });
});
