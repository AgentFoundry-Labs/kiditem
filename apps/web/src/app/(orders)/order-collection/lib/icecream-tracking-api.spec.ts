import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MALL_CHANNELS, isChannelKey } from '@kiditem/shared/channel-registry';
import * as XLSX from 'xlsx';
import {
  buildIcecreamSendFinishFile,
  isTrackingSupportedMall,
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

/**
 * 송장 판매처 매핑과 채널 레지스트리가 어긋나지 않는다(KID-250).
 *
 * `isTrackingSupportedMall` 은 레지스트리의 `uploadTracking`(확장이 몰에 직접 등록하는 셋)보다
 * 넓다 — 여기서 참인 몰은 셀피아 채번 송장을 그 몰 것으로 골라 CSV 로라도 내려준다. 다만
 * 확장이 직접 등록하는 몰은 반드시 매핑이 있어야 한다. 없으면 보낼 송장을 못 찾는다.
 */
describe('송장 판매처 매핑 = 채널 레지스트리', () => {
  it('⭐ 매핑된 몰 키는 모두 레지스트리에 있다', () => {
    for (const key of MALL_CHANNELS.map((entry) => entry.key)) {
      if (!isTrackingSupportedMall(key)) continue;
      expect([key, isChannelKey(key)]).toEqual([key, true]);
    }
    expect(isTrackingSupportedMall('order_collection')).toBe(false);
  });

  it('⭐ 확장이 직접 송장을 등록하는 몰은 반드시 판매처 매핑이 있다', () => {
    for (const entry of MALL_CHANNELS.filter((row) => row.uploadTracking)) {
      expect([entry.key, isTrackingSupportedMall(entry.key)]).toEqual([entry.key, true]);
    }
  });
});
