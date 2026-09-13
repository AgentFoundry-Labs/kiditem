import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as XLSX from 'xlsx';
import {
  buildIcecreamSendFinishFile,
  type SellpiaTrackingRow,
} from './icecream-tracking-api';

const api = vi.hoisted(() => ({ fetchRaw: vi.fn() }));
const downloadBlob = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api-client', () => ({ apiClient: api }));
vi.mock('@/lib/browser-download', () => ({ downloadBlob }));

const headers = ['주문번호', '배송번호', '배송순번', '상품번호'];
const sourceRows = [
  ['20260729M037101', '116569790', '1', '11287755'],
  ['20260729M037101', '116569790', '1', 'DELIVERY-FEE'],
  ['20260728M034091', '116565901', '1', '11258337'],
];
const tracking: SellpiaTrackingRow[] = [
  {
    ordNo: '20260729M037101',
    itemNo: '11287755',
    invNo: '576997610340',
    courier: '1136',
    provider: '아이스크림몰',
  },
  {
    ordNo: '20260729M037101',
    itemNo: 'DELIVERY-FEE',
    invNo: '576997610340',
    courier: '1136',
    provider: '아이스크림몰',
  },
  {
    ordNo: '20260728M034091',
    itemNo: '11258337',
    invNo: '576997610336',
    courier: '1136',
    provider: '아이스크림몰',
  },
];

describe('icecream send-finish file transport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([
        ['배송번호', '배송순번', '택배사', '송장번호'],
        ['116569790', '1', '10', '576997610340'],
        ['116565901', '1', '10', '576997610336'],
      ]),
      'Sheet1',
    );
    const workbookBytes = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
    api.fetchRaw.mockResolvedValue(new Response(
      new Uint8Array(workbookBytes),
      {
        status: 200,
        headers: {
          'Content-Disposition': 'attachment; filename="icecream-send-finish.xlsx"',
          'X-Order-Collection-Source-Rows': '3',
          'X-Order-Collection-Output-Rows': '2',
        },
      },
    ));
  });

  it('sends the source rows and tracking to the server converter', async () => {
    const result = await buildIcecreamSendFinishFile(
      headers,
      sourceRows,
      tracking,
      { download: false, fileName: '아이스크림몰_출고완료_20260729.xlsx' },
    );

    expect(api.fetchRaw).toHaveBeenCalledWith(
      '/api/orders/collection/icecream-mall/send-finish/convert',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          headers,
          rows: sourceRows,
          tracking,
          fileName: '아이스크림몰_출고완료_20260729.xlsx',
        }),
      },
    );
    expect(result.previewRows).toEqual([
      ['배송번호', '배송순번', '택배사', '송장번호'],
      ['116569790', '1', '10', '576997610340'],
      ['116565901', '1', '10', '576997610336'],
    ]);
    expect(result.fileName).toBe('icecream-send-finish.xlsx');
    expect(result.sourceRows).toBe(3);
    expect(result.matchedRows).toBe(2);
    expect(downloadBlob).not.toHaveBeenCalled();
  });
});
