import { beforeEach, describe, expect, it, vi } from 'vitest';
import { regenerateOrderOperationSource } from './order-collection-api';
import { downloadBlob } from '@/lib/browser-download';
import { read } from 'xlsx';

const api = vi.hoisted(() => ({ fetchRaw: vi.fn() }));

vi.mock('@/lib/api-client', () => ({ apiClient: api }));
vi.mock('@/lib/browser-download', () => ({ downloadBlob: vi.fn() }));
vi.mock('xlsx', () => ({
  read: vi.fn(() => ({ Sheets: { orders: {} }, SheetNames: ['orders'] })),
  utils: { sheet_to_json: vi.fn(() => []) },
}));

const OPERATION_ID = '00000000-0000-4000-8000-000000000011';

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

  it('주문이 없던 실행의 재변환(204)은 통합 문서를 읽거나 내려받지 않고 0건이다', async () => {
    api.fetchRaw.mockResolvedValue(new Response(null, {
      status: 204,
      headers: {
        'X-Order-Collection-Source-Rows': '0',
        'X-Order-Collection-Product-Rows': '0',
        'X-Order-Collection-Output-Rows': '0',
        'X-Order-Collection-Skipped-Rows': '0',
      },
    }));

    const result = await regenerateOrderOperationSource(OPERATION_ID);

    expect(result).toMatchObject({
      sourceRows: 0, productRows: 0, outputRows: 0, skippedRows: 0,
      previewRows: [],
    });
    expect(result.blob.size).toBe(0);
    expect(read).not.toHaveBeenCalled();
    expect(downloadBlob).not.toHaveBeenCalled();
  });
});
