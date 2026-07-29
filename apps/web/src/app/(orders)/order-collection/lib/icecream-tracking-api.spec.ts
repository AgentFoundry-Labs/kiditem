import { describe, expect, it } from 'vitest';
import {
  buildIcecreamSendFinishFile,
  buildIcecreamSendFinishPreviewRows,
  type SellpiaTrackingRow,
} from './icecream-tracking-api';

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

describe('icecream send-finish file', () => {
  it('matches provider order numbers and emits one row per delivery', () => {
    const result = buildIcecreamSendFinishPreviewRows(
      headers,
      sourceRows,
      tracking,
    );

    expect(result.previewRows).toEqual([
      ['배송번호', '배송순번', '택배사', '송장번호'],
      ['116569790', '1', '10', '576997610340'],
      ['116565901', '1', '10', '576997610336'],
    ]);
    expect(result.matchedRows).toBe(2);
    expect(result.unmappedCouriers).toEqual([]);
  });

  it('writes the exact four-column xlsx upload format', async () => {
    const result = await buildIcecreamSendFinishFile(
      headers,
      sourceRows,
      tracking,
      { download: false, fileName: '아이스크림몰_출고완료_20260729.xlsx' },
    );
    const XLSX = await import('xlsx');
    const workbook = XLSX.read(await result.blob.arrayBuffer(), { type: 'array' });
    const sheet = workbook.Sheets[workbook.SheetNames[0] ?? ''];
    const rows = XLSX.utils.sheet_to_json<string[]>(sheet, {
      header: 1,
      raw: false,
      defval: '',
    });

    expect(rows).toEqual(result.previewRows);
    expect(result.fileName).toBe('아이스크림몰_출고완료_20260729.xlsx');
  });

  it('fails closed when one provider order has conflicting invoice numbers', () => {
    expect(() =>
      buildIcecreamSendFinishPreviewRows(headers, sourceRows, [
        tracking[0],
        { ...tracking[0], invNo: 'DIFFERENT' },
      ]),
    ).toThrow('서로 다른 송장');
  });
});
