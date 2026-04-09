import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OrdersService } from '../orders.service';

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
      findUnique: vi.fn(),
      count: vi.fn().mockResolvedValue(0),
      aggregate: vi.fn().mockResolvedValue({ _count: 0, _sum: { totalPrice: 0 } }),
    },
  };
}

const MOCK_ORDER = {
  id: 'order-1',
  status: 'ACCEPT',
  orderedAt: new Date('2026-01-15'),
  totalPrice: 35000,
  companyId: 'company-1',
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
    it('findAll with status filter → returns paginated orders', async () => {
      prisma.order.findMany.mockResolvedValue([MOCK_ORDER]);

      const result = await service.findAll({ status: 'ACCEPT' });

      expect(prisma.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'ACCEPT' }),
        }),
      );
      expect(result.items).toEqual([MOCK_ORDER]);
      expect(result.count).toBe(1);
      expect(result.deliveryCompanies).toBeDefined();
    });

    it('findAll with no filter → defaults to ACCEPT status', async () => {
      prisma.order.findMany.mockResolvedValue([]);

      await service.findAll({});

      expect(prisma.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'ACCEPT' }),
        }),
      );
    });

    it('findAll with date range → applies orderedAt filter', async () => {
      prisma.order.findMany.mockResolvedValue([MOCK_ORDER]);

      await service.findAll({ from: '2026-01-01', to: '2026-01-31' });

      expect(prisma.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            orderedAt: expect.objectContaining({
              gte: expect.any(Date),
              lte: expect.any(Date),
            }),
          }),
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
    });
  });

  describe('getStats', () => {
    it('getStats → returns counts by status', async () => {
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

      const result = await service.getStats();

      expect(result.stats.total).toBe(100);
      expect(result.stats.accept).toBe(50);
      expect(result.stats.instruct).toBe(20);
      expect(result.today.orders).toBe(3);
      expect(result.today.revenue).toBe(90000);
      expect(result.week.orders).toBe(10);
    });
  });
});
