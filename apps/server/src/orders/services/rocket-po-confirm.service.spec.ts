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
    expect(result.rows[0]).toMatchObject({
      inventoryId: 'inventory-1',
      optionId: 'option-1',
    });
    expect(result.rows[1].shortageReason).toBe('협력사 재고부족 - 수요예측 오류');
    expect(result.fullyConfirmed).toBe(1);
    expect(result.shortRows).toBe(1);
    expect(result.matchedSkus).toBe(2);
  });

  it('classifies unmatched rows as no_product or no_barcode and confirms them to 0', async () => {
    const { service } = makeServiceWithAvailability(10);

    const result = await service.previewConfirmRows(
      [
        sourceRow({ poNumber: 'PO-1', orderQty: 5 }), // BARCODE → matched
        sourceRow({ poNumber: 'PO-2', barcode: '9999999999999', orderQty: 5 }), // 바코드는 있으나 상품 없음
        sourceRow({ poNumber: 'PO-3', barcode: '', orderQty: 5 }), // 발주에 바코드 없음
      ],
      ORGANIZATION_ID,
    );

    expect(result.rows.map((row) => row.matchReason)).toEqual(['matched', 'no_product', 'no_barcode']);
    expect(result.rows.map((row) => row.available)).toEqual([10, null, null]);
    // 미매칭 행은 재고를 확인 못해 확정 0(품절)으로 내려간다.
    expect(result.rows[1].confirmQty).toBe(0);
    expect(result.rows[2].confirmQty).toBe(0);
    expect(result.matchedSkus).toBe(1);
    expect(result.shortRows).toBe(2);
    expect(result.fullyConfirmed).toBe(1);
  });

  it('reads bundle availableStock (floor of component stock) for bundle options', async () => {
    const { service } = makeServiceWithAvailability(0, [
      { barcode: BARCODE, id: 'bundle-1', isBundle: true, availableStock: 20, inventory: null },
    ]);

    const result = await service.previewConfirmRows(
      [sourceRow({ poNumber: 'PO-1', orderQty: 8 })],
      ORGANIZATION_ID,
    );

    expect(result.rows[0].available).toBe(20);
    expect(result.rows[0].confirmQty).toBe(8);
    expect(result.rows[0].matchReason).toBe('matched');
    // 번들은 자체 Inventory 가 없어 예약 커밋에서 제외됨
    expect(result.rows[0].inventoryId).toBeUndefined();
    expect(result.rows[0].optionId).toBe('bundle-1');
    expect(result.matchedSkus).toBe(1);
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

  it('upserts confirmed rocket purchase orders and daily snapshots from preview rows', async () => {
    const { service, rocketPurchaseOrder, rocketSupplyDailySnapshot, transaction, executeRaw } = makeServiceWithAvailability(10);

    await service.previewConfirmRows(
      [
        sourceRow({
          poNumber: '123456',
          vendorName: 'KidItem Vendor',
          center: '덕평',
          poStatus: '발주확정',
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
          status: '발주확정',
          vendorName: 'KidItem Vendor',
          centerName: '덕평',
          firstSkuName: 'Rocket SKU A',
          skuCount: 2,
          orderQty: 5,
          orderAmount: 5000,
        }),
      }),
    );
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(executeRaw).toHaveBeenCalledTimes(1);
    expect(rocketPurchaseOrder.findMany).toHaveBeenCalledWith({
      where: { organizationId: ORGANIZATION_ID, businessDate },
      select: { poSeq: true, orderAmount: true, orderQty: true, status: true },
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

  it('uses purchase order registered date for rocket sales sync rows', async () => {
    const { service, rocketPurchaseOrder, rocketSupplyDailySnapshot } = makeServiceWithAvailability(10);

    await service.previewConfirmRows(
      [
        sourceRow({
          poNumber: '123456',
          productName: 'Rocket SKU A',
          orderQty: 3,
          totalPurchase: '3,000',
          expectedInboundDate: '20260731',
          poRegisteredAt: '2026-07-09 10:30:00',
          businessDateBasis: 'ordered_at',
          poStatus: '발주확정',
        }),
      ],
      ORGANIZATION_ID,
    );

    const businessDate = new Date(Date.UTC(2026, 6, 9));
    expect(rocketPurchaseOrder.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          businessDate,
          orderedAt: new Date('2026-07-09T01:30:00.000Z'),
        }),
      }),
    );
    expect(rocketSupplyDailySnapshot.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId_businessDate: {
            organizationId: ORGANIZATION_ID,
            businessDate,
          },
        },
      }),
    );
  });

  it('cleans up old inbound-date snapshots when rocket sales sync moves orders to purchase dates', async () => {
    const { service, rocketPurchaseOrder, rocketSupplyDailySnapshot, executeRaw } = makeServiceWithAvailability(10);
    const oldBusinessDate = new Date(Date.UTC(2026, 6, 31));
    const newBusinessDate = new Date(Date.UTC(2026, 6, 9));
    rocketPurchaseOrder.findMany
      .mockResolvedValueOnce([{ poSeq: 123456, businessDate: oldBusinessDate }])
      .mockResolvedValueOnce([{ poSeq: 123456, orderAmount: 3000, orderQty: 3, status: '발주확정' }])
      .mockResolvedValueOnce([]);

    await service.previewConfirmRows(
      [
        sourceRow({
          poNumber: '123456',
          productName: 'Rocket SKU A',
          orderQty: 3,
          totalPurchase: '3,000',
          expectedInboundDate: '20260731',
          poRegisteredAt: '2026-07-09 10:30:00',
          businessDateBasis: 'ordered_at',
          poStatus: '발주확정',
        }),
      ],
      ORGANIZATION_ID,
    );

    expect(executeRaw).toHaveBeenCalledTimes(2);
    expect(rocketSupplyDailySnapshot.deleteMany).toHaveBeenCalledWith({
      where: { organizationId: ORGANIZATION_ID, businessDate: oldBusinessDate },
    });
    expect(rocketSupplyDailySnapshot.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId_businessDate: {
            organizationId: ORGANIZATION_ID,
            businessDate: newBusinessDate,
          },
        },
        create: expect.objectContaining({
          revenueKrw: 3000,
          poCount: 1,
          itemQty: 3,
        }),
      }),
    );
  });

  it('removes revenue snapshots when only request-confirmation rows remain', async () => {
    const { service, rocketPurchaseOrder, rocketSupplyDailySnapshot } = makeServiceWithAvailability(10);
    const businessDate = new Date(Date.UTC(2026, 6, 31));
    rocketPurchaseOrder.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ poSeq: 123456, orderAmount: 3000, orderQty: 3, status: '거래처확인요청' }]);

    await service.previewConfirmRows(
      [
        sourceRow({
          poNumber: '123456',
          productName: 'Rocket SKU A',
          orderQty: 3,
          totalPurchase: '3,000',
          expectedInboundDate: '20260731',
          poRegisteredAt: '2026-07-09 10:30:00',
          poStatus: '거래처확인요청',
        }),
      ],
      ORGANIZATION_ID,
    );

    expect(rocketSupplyDailySnapshot.upsert).not.toHaveBeenCalled();
    expect(rocketSupplyDailySnapshot.deleteMany).toHaveBeenCalledWith({
      where: { organizationId: ORGANIZATION_ID, businessDate },
    });
  });
});

function makeServiceWithAvailability(available: number, optionRows?: unknown[]) {
  const findMany = vi.fn().mockResolvedValue(
    optionRows ?? [
      {
        barcode: BARCODE,
        id: 'option-1',
        isBundle: false,
        availableStock: null,
        inventory: { id: 'inventory-1', currentStock: available, reservedStock: 0 },
      },
    ],
  );
  const rocketPurchaseOrder = {
    upsert: vi.fn().mockResolvedValue({}),
    findMany: vi.fn().mockResolvedValue([{ poSeq: 123456, orderAmount: 5000, orderQty: 5, status: '발주확정' }]),
  };
  const rocketSupplyDailySnapshot = {
    upsert: vi.fn().mockResolvedValue({}),
    deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
  };
  const executeRaw = vi.fn().mockResolvedValue(0);
  const prisma = {
    productOption: { findMany },
    rocketPurchaseOrder,
    rocketSupplyDailySnapshot,
    $executeRaw: executeRaw,
  } as unknown as PrismaService;
  const transaction = vi.fn(async (callback: (tx: typeof prisma) => Promise<unknown>) => callback(prisma));
  (prisma as unknown as { $transaction: typeof transaction }).$transaction = transaction;
  return {
    service: new RocketPoConfirmService(prisma),
    findMany,
    rocketPurchaseOrder,
    rocketSupplyDailySnapshot,
    transaction,
    executeRaw,
  };
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
  if (input.poStatusCode !== undefined) row.poStatusCode = input.poStatusCode;
  if (input.vendorName !== undefined) row.vendorName = input.vendorName;
  if (input.productNo !== undefined) row.productNo = input.productNo;
  if (input.purchasePrice !== undefined) row.purchasePrice = input.purchasePrice;
  if (input.totalPurchase !== undefined) row.totalPurchase = input.totalPurchase;
  if (input.expectedInboundDate !== undefined) row.expectedInboundDate = input.expectedInboundDate;
  if (input.poRegisteredAt !== undefined) row.poRegisteredAt = input.poRegisteredAt;
  if (input.businessDateBasis !== undefined) row.businessDateBasis = input.businessDateBasis;
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
