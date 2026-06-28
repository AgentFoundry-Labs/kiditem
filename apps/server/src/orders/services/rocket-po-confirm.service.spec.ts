import { describe, expect, it, vi } from 'vitest';
import * as XLSX from 'xlsx';

import { RocketPoConfirmService, type ConfirmSourceRow } from './rocket-po-confirm.service';
import type { PrismaService } from '../../prisma/prisma.service';

const ORGANIZATION_ID = 'org-1';
const BARCODE = '8801234567890';
const SHEET_NAME = '상품목록';
const HEADER = [
  '발주번호', '물류센터', '입고유형', '발주상태', '상품번호', '상품바코드', '상품이름',
  '발주수량', '확정수량', '유통(소비)기한', '제조일자', '생산년도', '납품부족사유',
  '회송담당자', '회송담당자 연락처', '회송지주소', '매입가', '공급가', '부가세',
  '총발주 매입금', '입고예정일', '발주등록일시', 'Xdock',
];

describe('RocketPoConfirmService', () => {
  it('decrements available stock across duplicate barcodes in preview rows', async () => {
    const { service, findMany } = makeServiceWithAvailability(10);

    const result = await service.previewConfirmRows(
      [
        sourceRow({ poNumber: 'PO-1', orderQty: 8 }),
        sourceRow({ poNumber: 'PO-2', orderQty: 8 }),
      ],
      ORGANIZATION_ID,
    );

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ organizationId: ORGANIZATION_ID }) }),
    );
    expect(result.rows.map((row) => row.confirmQty)).toEqual([8, 2]);
    expect(result.rows[1].shortageReason).toBe('협력사 재고부족 - 수요예측 오류');
    expect(result.fullyConfirmed).toBe(1);
    expect(result.shortRows).toBe(1);
    expect(result.matchedSkus).toBe(2);
  });

  it('clamps edited confirm quantities to remaining available stock when generating files', async () => {
    const { service } = makeServiceWithAvailability(10);

    const result = await service.generateConfirmFile(
      [
        sourceRow({ poNumber: 'PO-1', orderQty: 8, confirmQty: 99 }),
        sourceRow({ poNumber: 'PO-2', orderQty: 8 }),
      ],
      ORGANIZATION_ID,
    );

    const rows = readSheetRows(result.buffer);
    expect(rows[1][8]).toBe(8);
    expect(rows[2][8]).toBe(2);
    expect(rows[2][12]).toBe('협력사 재고부족 - 수요예측 오류');
    expect(result.fullyConfirmed).toBe(1);
    expect(result.shortRows).toBe(1);
  });

  it('decrements available stock across duplicate barcodes when filling a Coupang template', async () => {
    const { service } = makeServiceWithAvailability(10);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([
        HEADER,
        templateRow({ poNumber: 'PO-1', orderQty: 8 }),
        templateRow({ poNumber: 'PO-2', orderQty: 8 }),
      ]),
      SHEET_NAME,
    );
    const buffer = Buffer.from(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }));

    const result = await service.fillConfirmTemplate(
      { buffer, originalname: 'rocket.xlsx' } as Parameters<RocketPoConfirmService['fillConfirmTemplate']>[0],
      ORGANIZATION_ID,
    );

    const rows = readSheetRows(result.buffer);
    expect(rows[1][8]).toBe(8);
    expect(rows[2][8]).toBe(2);
    expect(rows[2][12]).toBe('협력사 재고부족 - 수요예측 오류');
    expect(result.fullyConfirmed).toBe(1);
    expect(result.shortRows).toBe(1);
  });

  it('upserts rocket purchase orders and daily snapshots from preview rows', async () => {
    const { service, rocketPurchaseOrder, rocketSupplyDailySnapshot } = makeServiceWithAvailability(10);

    await service.previewConfirmRows(
      [
        sourceRow({
          poNumber: '123456',
          vendorName: 'KidItem Vendor',
          center: '덕평',
          poStatus: '거래처확인요청',
          productName: 'Rocket SKU A',
          productNo: 'P-A',
          orderQty: 3,
          purchasePrice: '1,000',
          totalPurchase: '3,000',
          expectedInboundDate: '20260701',
          poRegisteredAt: '2026-06-28 10:30:00',
        }),
        sourceRow({
          poNumber: '123456',
          productName: 'Rocket SKU B',
          productNo: 'P-B',
          orderQty: 2,
          purchasePrice: '1,000',
          totalPurchase: '2,000',
          expectedInboundDate: '20260701',
          poRegisteredAt: '2026-06-28 10:30:00',
        }),
      ],
      ORGANIZATION_ID,
    );

    const businessDate = new Date(Date.UTC(2026, 6, 1));
    expect(rocketPurchaseOrder.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId_poSeq: {
            organizationId: ORGANIZATION_ID,
            poSeq: 123456,
          },
        },
        create: expect.objectContaining({
          organizationId: ORGANIZATION_ID,
          poSeq: 123456,
          businessDate,
          status: '거래처확인요청',
          vendorName: 'KidItem Vendor',
          centerName: '덕평',
          firstSkuName: 'Rocket SKU A',
          skuCount: 2,
          orderQty: 5,
          orderAmount: 5000,
        }),
      }),
    );
    expect(rocketPurchaseOrder.findMany).toHaveBeenCalledWith({
      where: { organizationId: ORGANIZATION_ID, businessDate },
      select: { poSeq: true, orderAmount: true, orderQty: true },
    });
    expect(rocketSupplyDailySnapshot.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId_businessDate: {
            organizationId: ORGANIZATION_ID,
            businessDate,
          },
        },
        create: expect.objectContaining({
          revenueKrw: 5000,
          poCount: 1,
          itemQty: 5,
          rawJson: { poSeqs: [123456], source: 'rocket-po-confirm' },
        }),
      }),
    );
  });
});

function makeServiceWithAvailability(available: number) {
  const findMany = vi.fn().mockResolvedValue([
    {
      barcode: BARCODE,
      inventory: { currentStock: available, reservedStock: 0 },
    },
  ]);
  const rocketPurchaseOrder = {
    upsert: vi.fn().mockResolvedValue({}),
    findMany: vi.fn().mockResolvedValue([{ poSeq: 123456, orderAmount: 5000, orderQty: 5 }]),
  };
  const rocketSupplyDailySnapshot = {
    upsert: vi.fn().mockResolvedValue({}),
  };
  const prisma = {
    productOption: { findMany },
    rocketPurchaseOrder,
    rocketSupplyDailySnapshot,
  } as unknown as PrismaService;
  return { service: new RocketPoConfirmService(prisma), findMany, rocketPurchaseOrder, rocketSupplyDailySnapshot };
}

function sourceRow(input: Partial<ConfirmSourceRow>): ConfirmSourceRow {
  const row: ConfirmSourceRow = {
    poNumber: input.poNumber ?? 'PO-1',
    barcode: input.barcode ?? BARCODE,
    productName: input.productName ?? 'Rocket SKU',
    orderQty: input.orderQty ?? 1,
  };
  if (input.center !== undefined) row.center = input.center;
  if (input.poStatus !== undefined) row.poStatus = input.poStatus;
  if (input.vendorName !== undefined) row.vendorName = input.vendorName;
  if (input.productNo !== undefined) row.productNo = input.productNo;
  if (input.purchasePrice !== undefined) row.purchasePrice = input.purchasePrice;
  if (input.totalPurchase !== undefined) row.totalPurchase = input.totalPurchase;
  if (input.expectedInboundDate !== undefined) row.expectedInboundDate = input.expectedInboundDate;
  if (input.poRegisteredAt !== undefined) row.poRegisteredAt = input.poRegisteredAt;
  if (input.confirmQty !== undefined) row.confirmQty = input.confirmQty;
  if (input.shortageReason !== undefined) row.shortageReason = input.shortageReason;
  return row;
}

function templateRow(input: { poNumber: string; orderQty: number }): (string | number)[] {
  return [
    input.poNumber, '', '', '', '', BARCODE, 'Rocket SKU',
    input.orderQty, '', '', '', '', '',
    '', '', '', '', '', '', '', '', '', 'N',
  ];
}

function readSheetRows(buffer: Buffer): (string | number)[][] {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  return XLSX.utils.sheet_to_json<(string | number)[]>(workbook.Sheets[SHEET_NAME], {
    header: 1,
    defval: '',
  });
}
