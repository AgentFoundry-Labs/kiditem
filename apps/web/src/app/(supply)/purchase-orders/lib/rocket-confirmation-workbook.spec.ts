import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/api-client';
import {
  buildRocketConfirmationWorkbook,
  fillRocketConfirmationWorkbook,
} from './rocket-confirmation-workbook';

vi.mock('@/lib/api-client', () => ({
  apiClient: { fetchRaw: vi.fn() },
}));

const PO_LINE_ID = '1001:P-1:8801234567890:1';
const SOURCE_ROWS = [{
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
}] as const;
const WORKBOOK_ROWS = [{
  poLineId: PO_LINE_ID,
  workbookQuantity: 2,
  shortageReason: '협력사 재고부족 - 수요예측 오류' as const,
}];

describe('Rocket confirmation workbook server bridge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sends fresh workbook rows to the server without a template upload', async () => {
    vi.mocked(apiClient.fetchRaw).mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), {
      status: 200,
      headers: {
        'Content-Disposition': "attachment; filename*=UTF-8''%EC%BF%A0%ED%8C%A1_%EB%A1%9C%EC%BC%93_20260717.xlsx",
        'X-Rocket-Workbook-Total-Rows': '1',
        'X-Rocket-Workbook-Quantity': '2',
        'X-Rocket-Workbook-Fully-Confirmed-Rows': '0',
        'X-Rocket-Workbook-Short-Rows': '1',
      },
    }));

    const result = await buildRocketConfirmationWorkbook({
      sourceRows: SOURCE_ROWS,
      workbookRows: WORKBOOK_ROWS,
      now: new Date('2026-07-17T00:00:00.000Z'),
    });

    expect(apiClient.fetchRaw).toHaveBeenCalledWith('/api/purchase-orders', {
      method: 'POST',
      body: expect.any(FormData),
    });
    const request = apiClient.fetchRaw.mock.calls[0]?.[1];
    const formData = request?.body as FormData;
    expect(formData.get('action')).toBe('convertRocketConfirmationWorkbook');
    expect(JSON.parse(formData.get('requestJson') as string)).toEqual({
      sourceRows: SOURCE_ROWS,
      workbookRows: WORKBOOK_ROWS,
      now: '2026-07-17T00:00:00.000Z',
    });
    expect(formData.get('workbook')).toBeNull();
    expect(result.fileName).toBe('쿠팡_로켓_20260717.xlsx');
    expect(result.summary).toEqual({
      totalRows: 1,
      workbookQuantity: 2,
      fullyConfirmedRows: 0,
      shortRows: 1,
    });
    expect(await result.blob.arrayBuffer()).toEqual(new Uint8Array([1, 2, 3]).buffer);
  });

  it('uploads the operator template so the server preserves its workbook structure', async () => {
    vi.mocked(apiClient.fetchRaw).mockResolvedValue(new Response(new Uint8Array([4, 5]), {
      status: 200,
      headers: { 'Content-Disposition': "attachment; filename*=UTF-8''%EC%BF%A0%ED%8C%A1_%EC%9B%90%EB%B3%B8_%EC%BF%A0%ED%8C%A1%EC%A0%9C%EC%B6%9C.xlsx" },
    }));
    const template = new Uint8Array([9, 8, 7]).buffer;

    await fillRocketConfirmationWorkbook({
      template,
      templateFileName: '쿠팡_원본.xlsx',
      sourceRows: SOURCE_ROWS,
      workbookRows: WORKBOOK_ROWS,
    });

    const request = apiClient.fetchRaw.mock.calls[0]?.[1];
    const formData = request?.body as FormData;
    const uploaded = formData.get('workbook') as File;
    expect(uploaded).toBeTruthy();
    expect(uploaded.name).toBe('쿠팡_원본.xlsx');
    expect(uploaded.type).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect(uploaded.size).toBe(3);
    expect(JSON.parse(formData.get('requestJson') as string)).toEqual({
      sourceRows: SOURCE_ROWS,
      workbookRows: WORKBOOK_ROWS,
    });
  });

  it('surfaces a server conversion failure without returning a download', async () => {
    vi.mocked(apiClient.fetchRaw).mockResolvedValue(new Response(
      JSON.stringify({ message: 'conversion failed' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    ));

    await expect(buildRocketConfirmationWorkbook({
      sourceRows: SOURCE_ROWS,
      workbookRows: WORKBOOK_ROWS,
    })).rejects.toThrow('conversion failed');
  });
});
