import * as XLSX from 'xlsx';
import { describe, expect, it } from 'vitest';
import { buildRocketConfirmationWorkbook } from './rocket-confirmation-workbook';

const PO_LINE_ID = '1001:P-1:8801234567890:1';

function sourceRow() {
  return {
    poLineId: PO_LINE_ID,
    poNumber: '1001',
    vendorId: 'VENDOR-1',
    productNo: 'P-1',
    barcode: '8801234567890',
    productName: 'Rocket item',
    orderQty: 4,
    plannedDeliveryDate: '2026-07-20',
    confirmation: {
      center: '덕평1센터',
      inboundType: '택배',
      poStatus: '거래처확인요청',
      returnManager: '담당자',
      returnContact: '010-0000-0000',
      returnAddress: '서울시',
      purchasePrice: 1_000,
      supplyPrice: 900,
      vat: 90,
      totalPurchase: 3_960,
      poRegisteredAt: '2026-07-17 09:00:00',
      xdock: 'N',
    },
  } as const;
}

describe('buildRocketConfirmationWorkbook', () => {
  it('renders the canonical 23-column Coupang sheet from confirmed source evidence', async () => {
    const result = buildRocketConfirmationWorkbook({
      sourceRows: [sourceRow()],
      confirmedRows: [{
        poLineId: PO_LINE_ID,
        confirmedQuantity: 2,
        shortageReason: '협력사 재고부족 - 수요예측 오류',
      }],
      now: new Date('2026-07-17T00:00:00.000Z'),
    });
    const workbook = XLSX.read(await result.blob.arrayBuffer());
    const rows = XLSX.utils.sheet_to_json<(string | number)[]>(
      workbook.Sheets['상품목록']!,
      { header: 1, raw: true },
    );

    expect(rows[0]).toHaveLength(23);
    expect(rows[0]?.[8]).toBe('확정수량');
    expect(rows[1]).toEqual([
      '1001', '덕평1센터', '택배', '거래처확인요청', 'P-1', '8801234567890',
      'Rocket item', 4, 2, '', '', '', '협력사 재고부족 - 수요예측 오류',
      '담당자', '010-0000-0000', '서울시', 1_000, 900, 90, 3_960,
      '20260720', '2026-07-17 09:00:00', 'N',
    ]);
    expect(result).toMatchObject({
      fileName: '발주확정_20260717.xlsx',
      summary: { totalRows: 1, confirmedQuantity: 2, shortRows: 1 },
    });
    expect(workbook.SheetNames).toEqual(['상품목록', 'hiddenSheet']);
  });

  it('rejects rows collected without the confirmation metadata capability', () => {
    const { confirmation: _confirmation, ...legacyRow } = sourceRow();
    expect(() => buildRocketConfirmationWorkbook({
      sourceRows: [legacyRow],
      confirmedRows: [{
        poLineId: PO_LINE_ID,
        confirmedQuantity: 2,
        shortageReason: '협력사 재고부족 - 수요예측 오류',
      }],
    })).toThrow(/metadata/i);
  });
});
