import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  collectArt09OrdersFromExtension,
  convertArt09ToSellpiaFile,
} from './art09-orders-api';

const bridge = vi.hoisted(() => ({
  detectOrderCollectionExtensionId: vi.fn(),
  sendToExtension: vi.fn(),
}));
const api = vi.hoisted(() => ({ fetchRaw: vi.fn() }));

vi.mock('@/lib/extension-bridge', () => bridge);
vi.mock('@/lib/api-client', () => ({ apiClient: api }));

const ATTEMPT_ID = '00000000-0000-4000-8000-000000000009';
const ATTEMPT_TOKEN = '00000000-0000-4000-8000-000000000010';

describe('Art09 server-owned conversion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    bridge.detectOrderCollectionExtensionId.mockResolvedValue('order-extension');
    bridge.sendToExtension.mockResolvedValue({
      success: true,
      rows: [{
        orderId: '20260727-1234567',
        orderItemId: '',
        productNo: 'P-1',
        productName: '상품',
        qty: 1,
      }],
    });
  });

  it('correlates extension collection with owner attemptId and defers terminal progress', async () => {
    await collectArt09OrdersFromExtension({
      attemptId: ATTEMPT_ID,
      attemptToken: ATTEMPT_TOKEN,
      extensionId: 'order-extension',
      date: '2026-07-27',
    });

    expect(bridge.sendToExtension).toHaveBeenCalledWith(
      'order-extension',
      expect.objectContaining({
        action: 'collectArt09Orders',
        date: '2026-07-27',
        attemptId: ATTEMPT_ID,
        deferTerminal: true,
      }),
      190000,
    );
  });

  it('sends raw rows with the exact owner fence and keeps converted bytes transient', async () => {
    api.fetchRaw.mockResolvedValue(new Response('\uFEFFheader,"value,with comma"\r\nvalue,"quoted ""cell"""\r\n', {
      status: 200,
      headers: {
        'Content-Disposition': "attachment; filename*=UTF-8''art09.csv",
        'Content-Type': 'text/csv;charset=utf-8',
        'X-Order-Collection-Source-Rows': '1',
        'X-Order-Collection-Product-Rows': '1',
        'X-Order-Collection-Output-Rows': '1',
        'X-Order-Collection-Skipped-Rows': '0',
      },
    }));

    const rows = await collectArt09OrdersFromExtension({
      attemptId: ATTEMPT_ID,
      attemptToken: ATTEMPT_TOKEN,
      extensionId: 'order-extension',
    });
    const result = await convertArt09ToSellpiaFile(rows, {
      download: false,
      run: { attemptId: ATTEMPT_ID, attemptToken: ATTEMPT_TOKEN },
    });

    expect(result.fileName).toBe('art09.csv');
    expect(result.previewRows).toEqual([
      ['header', 'value,with comma'],
      ['value', 'quoted "cell"'],
    ]);
    expect(api.fetchRaw).toHaveBeenCalledWith(
      '/api/orders/collection/art09/convert',
      expect.objectContaining({
        headers: expect.objectContaining({
          'x-order-collection-attempt-id': ATTEMPT_ID,
          'x-source-attempt-token': ATTEMPT_TOKEN,
        }),
      }),
    );
    expect(JSON.parse(api.fetchRaw.mock.calls[0]?.[1]?.body as string)).toEqual({ rows });
  });
});
