import { beforeEach, describe, expect, it, vi } from 'vitest';
import { convertIcecreamMallOrderRows, regenerateOrderCollectionSource } from './order-collection-api';
import { downloadBlob } from '@/lib/browser-download';
import { read } from 'xlsx';

const api = vi.hoisted(() => ({ fetchRaw: vi.fn() }));

vi.mock('@/lib/api-client', () => ({ apiClient: api }));
vi.mock('@/lib/browser-download', () => ({ downloadBlob: vi.fn() }));
vi.mock('xlsx', () => ({
  read: vi.fn(() => ({ Sheets: { orders: {} }, SheetNames: ['orders'] })),
  utils: { sheet_to_json: vi.fn(() => []) },
}));

const ATTEMPT_ID = '00000000-0000-4000-8000-000000000011';
const ATTEMPT_TOKEN = '00000000-0000-4000-8000-000000000012';

describe('order collection conversion transport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.fetchRaw.mockResolvedValue(new Response('orders', {
      status: 200,
      headers: {
        'Content-Disposition': 'attachment; filename="orders.xls"',
        'X-Order-Collection-Source-Rows': '1',
        'X-Order-Collection-Product-Rows': '1',
        'X-Order-Collection-Output-Rows': '1',
        'X-Order-Collection-Skipped-Rows': '0',
      },
    }));
  });

  it('sends the source owner fence with browser-row conversion', async () => {
    await convertIcecreamMallOrderRows(
      { headers: ['주문번호'], rows: [['order-1']], fileName: 'orders' },
      {
        download: false,
        run: { attemptId: ATTEMPT_ID, attemptToken: ATTEMPT_TOKEN },
      },
    );

    expect(api.fetchRaw).toHaveBeenCalledWith(
      '/api/orders/collection/icecream-mall/convert-rows',
      expect.objectContaining({
        headers: expect.objectContaining({
          'x-order-collection-attempt-id': ATTEMPT_ID,
          'x-source-attempt-token': ATTEMPT_TOKEN,
        }),
      }),
    );
  });

  it('retains measured zero without parsing or downloading a workbook for a confirmed-empty source', async () => {
    api.fetchRaw.mockResolvedValue(new Response(null, {
      status: 204,
      headers: {
        'X-Order-Collection-Source-Rows': '0',
        'X-Order-Collection-Product-Rows': '0',
        'X-Order-Collection-Output-Rows': '0',
        'X-Order-Collection-Skipped-Rows': '0',
      },
    }));

    const result = await regenerateOrderCollectionSource({
      attemptId: ATTEMPT_ID,
      attemptToken: ATTEMPT_TOKEN,
    });

    expect(result).toMatchObject({
      sourceRows: 0, productRows: 0, outputRows: 0, skippedRows: 0,
      importRunId: null, previewRows: [],
    });
    expect(result.blob.size).toBe(0);
    expect(read).not.toHaveBeenCalled();
    expect(downloadBlob).not.toHaveBeenCalled();
  });
});
