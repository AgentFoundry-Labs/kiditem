import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OrdersService } from '../orders.service';
import { NotFoundException } from '@nestjs/common';
import { OrderListResponseSchema, OrderActionResponseSchema, OrderStatsResponseSchema } from '@kiditem/shared';

// Mock the coupang adapter module
vi.mock('../../../channels/adapters/coupang/orders', () => ({
  confirmOrderSheets: vi.fn(),
  uploadInvoice: vi.fn(),
  DELIVERY_COMPANIES: [
    { code: 'CJGLS', name: 'CJ대한통운' },
    { code: 'KGB', name: '로젠택배' },
  ],
}));

import { confirmOrderSheets, uploadInvoice } from '../../../channels/adapters/coupang/orders';

function makePrisma() {
  return {
    order: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn(),
      count: vi.fn().mockResolvedValue(0),
      aggregate: vi.fn().mockResolvedValue({ _count: 0, _sum: { totalPrice: 0 } }),
    },
  };
}

const COMPANY_ID = 'company-1';
const OTHER_COMPANY_ID = 'company-2';

const MOCK_LINE_ITEM = {
  id: '00000000-0000-4000-8000-000000000002',
  productName: '키즈 티셔츠',
  optionName: '120 / Blue',
  sku: 'SKU-001',
  quantity: 2,
  unitPrice: 17500,
  totalPrice: 35000,
  status: 'ACCEPT',
  externalLineId: '98765',
};

const MOCK_ORDER = {
  id: '00000000-0000-4000-8000-000000000001',
  status: 'ACCEPT',
  orderedAt: new Date('2026-01-15T01:00:00.000Z'),
  shippedAt: null,
  deliveredAt: null,
  totalPrice: 35000,
  companyId: COMPANY_ID,
  platform: 'coupang',
  externalOrderId: '12345',
  externalNumber: 'CO-1',
  customerName: '홍길동',
  receiverName: '홍길동',
  receiverAddr: '서울시 중구',
  memo: null,
  trackingNumber: null,
  shippingCompany: null,
  lineItems: [MOCK_LINE_ITEM],
};

describe('OrdersService — order query and actions', () => {
  let service: OrdersService;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    prisma = makePrisma();
    service = new OrdersService(prisma as any);
    vi.clearAllMocks();
  });

  describe('findAll', () => {
    it('findAll with status filter → companyId + status 필터 둘 다 적용', async () => {
      prisma.order.findMany.mockResolvedValue([MOCK_ORDER]);

      const result = await service.findAll(COMPANY_ID, { status: 'ACCEPT' });

      expect(prisma.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ companyId: COMPANY_ID, status: 'ACCEPT' }),
        }),
      );
      expect(result.total).toBe(1);
      expect(result.deliveryCompanies).toBeDefined();

      // Derived list item shape assertions
      expect(result.items[0]).toEqual(expect.objectContaining({
        displayOrderNumber: 'CO-1',
        shipmentBoxId: 12345,
        primaryProductName: '키즈 티셔츠',
        totalQuantity: 2,
        lineItemCount: 1,
      }));
      expect(result.items[0]?.lineItems[0]?.sku).toBe('SKU-001');

      // OrderListResponseSchema JSON-roundtrip parse (simulates HTTP serialisation)
      const parsed = OrderListResponseSchema.safeParse(JSON.parse(JSON.stringify(result)));
      expect(parsed.success).toBe(true);
    });

    it('findAll with no filter → defaults to ACCEPT + companyId 적용', async () => {
      prisma.order.findMany.mockResolvedValue([]);

      await service.findAll(COMPANY_ID, {});

      expect(prisma.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ companyId: COMPANY_ID, status: 'ACCEPT' }),
        }),
      );
    });

    it('findAll with date range → companyId + orderedAt 필터 적용', async () => {
      prisma.order.findMany.mockResolvedValue([MOCK_ORDER]);

      await service.findAll(COMPANY_ID, { from: '2026-01-01', to: '2026-01-31' });

      expect(prisma.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            companyId: COMPANY_ID,
            orderedAt: expect.objectContaining({
              gte: expect.any(Date),
              lte: expect.any(Date),
            }),
          }),
        }),
      );
    });

    it('findAll lineItems include scoped by companyId (IDOR regression)', async () => {
      // Prisma filters line items to companyId at DB level; we verify the include clause
      // contains `where: { companyId }` — the Prisma mock simulates that only the
      // in-company line item is returned (other-company item excluded by DB filter).
      const inCompanyItem = { ...MOCK_LINE_ITEM, id: '00000000-0000-4000-8000-000000000002' };
      const orderWithFilteredItems = { ...MOCK_ORDER, lineItems: [inCompanyItem] };
      prisma.order.findMany.mockResolvedValue([orderWithFilteredItems]);

      const result = await service.findAll(COMPANY_ID, {});

      // Verify include contains companyId where clause (IDOR guard)
      expect(prisma.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          include: expect.objectContaining({
            lineItems: expect.objectContaining({
              where: expect.objectContaining({ companyId: COMPANY_ID }),
            }),
          }),
        }),
      );

      // Only the in-company line item appears in the mapped response
      expect(result.items[0]?.lineItems).toHaveLength(1);
      expect(result.items[0]?.lineItems[0]?.id).toBe(inCompanyItem.id);

      // Confirm the other-company item is absent (it would not be returned by Prisma)
      const allLineItemIds = result.items.flatMap((item) => item.lineItems.map((li) => li.id));
      expect(allLineItemIds).not.toContain(OTHER_COMPANY_ID);
    });

    it('shipmentBoxId is numeric when externalOrderId is digits, null otherwise', async () => {
      const numericOrder = { ...MOCK_ORDER, externalOrderId: '99999', externalNumber: null, lineItems: [MOCK_LINE_ITEM] };
      const alphaOrder = { ...MOCK_ORDER, id: 'order-2', externalOrderId: 'ALPHA-123', externalNumber: null, lineItems: [MOCK_LINE_ITEM] };
      prisma.order.findMany.mockResolvedValue([numericOrder, alphaOrder]);

      const result = await service.findAll(COMPANY_ID, {});

      expect(result.items[0]?.shipmentBoxId).toBe(99999);
      expect(result.items[1]?.shipmentBoxId).toBeNull();
    });
  });

  describe('findOne', () => {
    it('findOne → companyId 필터와 함께 findFirst 사용 (IDOR 방어)', async () => {
      prisma.order.findFirst.mockResolvedValue(MOCK_ORDER);

      const result = await service.findOne('order-1', COMPANY_ID);

      expect(prisma.order.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'order-1', companyId: COMPANY_ID },
          include: expect.objectContaining({
            lineItems: expect.objectContaining({
              where: expect.objectContaining({ companyId: COMPANY_ID }),
            }),
          }),
        }),
      );
      expect(result).toEqual(MOCK_ORDER);
    });

    it('다른 회사의 주문 접근 시 NotFoundException (IDOR 방어)', async () => {
      // order-1 은 다른 회사 소유 → company-1 입장에서는 not found
      prisma.order.findFirst.mockResolvedValue(null);

      await expect(service.findOne('order-1', COMPANY_ID)).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.order.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'order-1', companyId: COMPANY_ID },
        }),
      );
    });
  });

  describe('confirm', () => {
    it('confirm action → calls coupang confirmOrderSheets', async () => {
      (confirmOrderSheets as ReturnType<typeof vi.fn>).mockResolvedValue({ code: '200', message: 'success' });

      const result = await service.confirm([12345, 67890]);

      expect(confirmOrderSheets).toHaveBeenCalledWith([12345, 67890]);
      expect(result.message).toBe('2건 승인 완료');
      expect(result.data).toEqual({ code: '200', message: 'success' });

      // OrderActionResponse shape
      const parsed = OrderActionResponseSchema.safeParse(result);
      expect(parsed.success).toBe(true);
    });
  });

  describe('uploadInvoice', () => {
    it('invoice action with shipmentBoxId → calls coupang uploadInvoice', async () => {
      (uploadInvoice as ReturnType<typeof vi.fn>).mockResolvedValue({ code: '200', message: 'ok' });

      const result = await service.uploadInvoice(12345, 'CJGLS', 'INV-001');

      expect(uploadInvoice).toHaveBeenCalledWith(
        12345,
        expect.objectContaining({
          deliveryCompanyCode: 'CJGLS',
          invoiceNumber: 'INV-001',
        }),
      );
      expect(result.message).toBe('송장 전송 완료');

      // OrderActionResponse shape
      const parsed = OrderActionResponseSchema.safeParse(result);
      expect(parsed.success).toBe(true);
    });
  });

  describe('getStats', () => {
    it('getStats → 모든 count/aggregate 호출에 companyId 필터 적용', async () => {
      prisma.order.count
        .mockResolvedValueOnce(100)  // total
        .mockResolvedValueOnce(50)   // ACCEPT
        .mockResolvedValueOnce(20)   // INSTRUCT
        .mockResolvedValueOnce(10)   // DEPARTURE
        .mockResolvedValueOnce(15)   // DELIVERING
        .mockResolvedValueOnce(5);   // FINAL_DELIVERY

      prisma.order.aggregate
        .mockResolvedValueOnce({ _count: 3, _sum: { totalPrice: 90000 } })  // today
        .mockResolvedValueOnce({ _count: 10, _sum: { totalPrice: 300000 } }); // week

      const result = await service.getStats(COMPANY_ID);

      expect(result.stats.total).toBe(100);
      expect(result.stats.accept).toBe(50);
      expect(result.stats.instruct).toBe(20);
      expect(result.today.orders).toBe(3);
      expect(result.today.revenue).toBe(90000);
      expect(result.week.orders).toBe(10);

      // 모든 count 호출에 companyId 포함 검증 (status 유무와 무관)
      const countCalls = prisma.order.count.mock.calls;
      expect(countCalls).toHaveLength(6);
      for (const [args] of countCalls) {
        expect(args).toEqual(expect.objectContaining({
          where: expect.objectContaining({ companyId: COMPANY_ID }),
        }));
      }

      // 모든 aggregate 호출에 companyId 포함 검증
      const aggCalls = prisma.order.aggregate.mock.calls;
      expect(aggCalls).toHaveLength(2);
      for (const [args] of aggCalls) {
        expect(args.where).toEqual(expect.objectContaining({ companyId: COMPANY_ID }));
      }

      // OrderStatsResponse shape
      const parsed = OrderStatsResponseSchema.safeParse(result);
      expect(parsed.success).toBe(true);
    });
  });
});
