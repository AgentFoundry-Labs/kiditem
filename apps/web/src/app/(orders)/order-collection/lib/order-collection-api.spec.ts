import { beforeEach, describe, expect, it, vi } from 'vitest';
import { convertIcecreamMallOrderRows } from './order-collection-api';

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
});
