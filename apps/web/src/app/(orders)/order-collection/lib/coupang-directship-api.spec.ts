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

  it('reports "no confirmed orders" without a file when nothing is confirmed', async () => {
    api.fetchRaw.mockResolvedValue(
      new Response(JSON.stringify({ collected: 0, skipped: 2, message: '수집할 확정 주문이 없습니다.' }), {
        status: 200,
        headers: {
          'content-type': 'application/json; charset=utf-8',
          'X-Order-Collection-Confirmed-Empty': '1',
          'X-Order-Collection-Skipped-Rows': '2',
          'X-Order-Collection-Reconciled-Rows': '0',
          'X-Order-Collection-Import-Run-Id': '11111111-1111-4111-8111-111111111111',
        },
      }),
    );

    const result = await convertCoupangDirectToSellpiaFile(
      { pos: [], centers: {} },
      'SHIPMENT',
      { channelAccountId: '11111111-1111-4111-8111-111111111111', download: false },
    );

    expect(result.empty).toBe(true);
    expect(result.skipped).toBe(2);
    expect(result.reconciledRows).toBe(0);
    expect(result.importRunId).toBe('11111111-1111-4111-8111-111111111111');
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
      {
        channelAccountId: '11111111-1111-4111-8111-111111111111',
        download: false,
        signal: abortController.signal,
      },
    )).rejects.toThrow('conversion failed');

    expect(api.fetchRaw).toHaveBeenCalledWith(
      '/api/orders/collection/coupang-directship/convert',
      expect.objectContaining({ signal: abortController.signal }),
    );
    expect(JSON.parse(api.fetchRaw.mock.calls[0]?.[1]?.body as string))
      .toMatchObject({
        channelAccountId: '11111111-1111-4111-8111-111111111111',
        transport: 'SHIPMENT',
      });
  });
});
