import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SupplierStatsService } from '../supplier-stats.service';

/**
 * Plan B2c.orders T7 — supplier-stats optionId groupBy rewrite.
 *
 * Coverage:
 *   getSalesBySupplier — happy path / 중복 optionId 방지 (SupplierProduct ∩ MasterSupplierProduct)
 *   getProductSales    — master-path supplyPrice null 검증 / SupplierProduct-path supplyPrice 실값
 *   getHistory         — PurchaseOrder + SupplierPayment 타임라인 정렬 (T7 변경 없음 보증)
 */

function makePrisma() {
  return {
    supplier: { findMany: vi.fn() },
    productOption: { findMany: vi.fn() },
    orderLineItem: { groupBy: vi.fn() },
    supplierProduct: { findMany: vi.fn() },
    masterSupplierProduct: { findMany: vi.fn() },
    purchaseOrder: { findMany: vi.fn() },
    supplierPayment: { findMany: vi.fn() },
  };
}

describe('SupplierStatsService', () => {
  let service: SupplierStatsService;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    prisma = makePrisma();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    service = new SupplierStatsService(prisma as any);
  });

  describe('getSalesBySupplier', () => {
    it('aggregates per-supplier via SupplierProduct.optionId + MasterSupplierProduct.masterId → options → OrderLineItem groupBy', async () => {
      prisma.supplier.findMany.mockResolvedValue([
        {
          id: 'sup-1',
          name: 'Supplier One',
          supplierProducts: [{ optionId: 'opt-1' }, { optionId: 'opt-2' }],
          masterSupplierProducts: [{ masterId: 'mst-1' }],
        },
      ]);
      // mst-1 → [opt-3, opt-4]
      prisma.productOption.findMany.mockResolvedValue([
        { id: 'opt-3', masterId: 'mst-1' },
        { id: 'opt-4', masterId: 'mst-1' },
      ]);
      prisma.orderLineItem.groupBy.mockResolvedValue([
        { optionId: 'opt-1', _count: { _all: 3 }, _sum: { quantity: 10, totalPrice: 50_000 } },
        { optionId: 'opt-2', _count: { _all: 1 }, _sum: { quantity: 2, totalPrice: 20_000 } },
        { optionId: 'opt-3', _count: { _all: 5 }, _sum: { quantity: 15, totalPrice: 100_000 } },
        // opt-4 — 주문 없음
      ]);

      const result = await service.getSalesBySupplier('organization-1');

      // suppliers 조회 — organizationId scope
      expect(prisma.supplier.findMany).toHaveBeenCalledWith({
        where: { organizationId: 'organization-1' },
        select: expect.any(Object),
      });
      // productOption.findMany — masterId in set + isDeleted:false
      expect(prisma.productOption.findMany).toHaveBeenCalledWith({
        where: { masterId: { in: ['mst-1'] }, isDeleted: false },
        select: { id: true, masterId: true },
      });
      // orderLineItem.groupBy — optionId in 4 ids + order.organizationId + status notIn
      const groupByCall = prisma.orderLineItem.groupBy.mock.calls[0][0];
      expect(groupByCall.by).toEqual(['optionId']);
      expect(groupByCall.where.order.organizationId).toBe('organization-1');
      expect(groupByCall.where.order.status).toEqual({ notIn: ['cancelled', 'returned'] });
      expect(Array.from(groupByCall.where.optionId.in).sort()).toEqual([
        'opt-1',
        'opt-2',
        'opt-3',
        'opt-4',
      ]);

      expect(result.summary).toEqual({
        supplierCount: 1,
        productCount: 3,
        totalOrders: 9,
        totalQuantity: 27,
        totalRevenue: 170_000,
      });
      expect(result.items).toEqual([
        {
          supplierId: 'sup-1',
          supplierName: 'Supplier One',
          productCount: 3, // 2 SupplierProduct + 1 MasterSupplierProduct
          totalOrders: 3 + 1 + 5, // 9
          totalQuantity: 10 + 2 + 15, // 27
          totalRevenue: 50_000 + 20_000 + 100_000, // 170_000
        },
      ]);
    });

    it('중복 optionId 방지 — SupplierProduct 와 MasterSupplierProduct 가 동일 option 을 포함해도 한 번만 카운트', async () => {
      // SupplierProduct 가 opt-1 을 가리키고, MasterSupplierProduct 의 master 도 opt-1 을 options 로 가짐
      prisma.supplier.findMany.mockResolvedValue([
        {
          id: 'sup-1',
          name: 'Supplier One',
          supplierProducts: [{ optionId: 'opt-1' }],
          masterSupplierProducts: [{ masterId: 'mst-1' }],
        },
      ]);
      prisma.productOption.findMany.mockResolvedValue([
        { id: 'opt-1', masterId: 'mst-1' }, // 중복!
        { id: 'opt-2', masterId: 'mst-1' },
      ]);
      prisma.orderLineItem.groupBy.mockResolvedValue([
        { optionId: 'opt-1', _count: { _all: 4 }, _sum: { quantity: 10, totalPrice: 100_000 } },
        { optionId: 'opt-2', _count: { _all: 2 }, _sum: { quantity: 6, totalPrice: 60_000 } },
      ]);

      const result = await service.getSalesBySupplier('organization-1');

      // opt-1 은 SupplierProduct 로 먼저 카운트 → MasterSupplierProduct 경로에서 skip
      expect(result.summary).toEqual({
        supplierCount: 1,
        productCount: 2,
        totalOrders: 6,
        totalQuantity: 16,
        totalRevenue: 160_000,
      });
      expect(result.items).toEqual([
        {
          supplierId: 'sup-1',
          supplierName: 'Supplier One',
          productCount: 2, // 1 + 1 (mapping row 기준 — SupplierProduct 1 + MasterSupplierProduct 1)
          totalOrders: 4 + 2, // 6, opt-1 한 번만
          totalQuantity: 10 + 6, // 16
          totalRevenue: 100_000 + 60_000, // 160_000
        },
      ]);
    });

    it('empty supplier list → empty result + no downstream queries', async () => {
      prisma.supplier.findMany.mockResolvedValue([]);

      const result = await service.getSalesBySupplier('organization-1');

      expect(result).toEqual({
        summary: {
          supplierCount: 0,
          productCount: 0,
          totalOrders: 0,
          totalQuantity: 0,
          totalRevenue: 0,
        },
        items: [],
      });
      expect(prisma.productOption.findMany).not.toHaveBeenCalled();
      expect(prisma.orderLineItem.groupBy).not.toHaveBeenCalled();
    });

    it('skips MasterSupplierProduct resolution when suppliers have no master mappings', async () => {
      prisma.supplier.findMany.mockResolvedValue([
        {
          id: 'sup-1',
          name: 'Supplier One',
          supplierProducts: [{ optionId: 'opt-1' }],
          masterSupplierProducts: [],
        },
      ]);
      prisma.orderLineItem.groupBy.mockResolvedValue([
        { optionId: 'opt-1', _count: { _all: 1 }, _sum: { quantity: 3, totalPrice: 30_000 } },
      ]);

      const result = await service.getSalesBySupplier('organization-1');

      expect(prisma.productOption.findMany).not.toHaveBeenCalled();
      expect(result.summary).toMatchObject({
        supplierCount: 1,
        productCount: 1,
        totalOrders: 1,
        totalQuantity: 3,
        totalRevenue: 30_000,
      });
      expect(result.items[0]).toMatchObject({
        supplierId: 'sup-1',
        productCount: 1,
        totalOrders: 1,
        totalQuantity: 3,
        totalRevenue: 30_000,
      });
    });

    it('returns zero stats when supplier has mappings but no orders', async () => {
      prisma.supplier.findMany.mockResolvedValue([
        {
          id: 'sup-1',
          name: 'Supplier One',
          supplierProducts: [{ optionId: 'opt-1' }],
          masterSupplierProducts: [],
        },
      ]);
      prisma.orderLineItem.groupBy.mockResolvedValue([]);

      const result = await service.getSalesBySupplier('organization-1');

      expect(result.summary).toEqual({
        supplierCount: 1,
        productCount: 1,
        totalOrders: 0,
        totalQuantity: 0,
        totalRevenue: 0,
      });
      expect(result.items).toEqual([
        {
          supplierId: 'sup-1',
          supplierName: 'Supplier One',
          productCount: 1,
          totalOrders: 0,
          totalQuantity: 0,
          totalRevenue: 0,
        },
      ]);
    });
  });

  describe('getProductSales', () => {
    it('SupplierProduct path returns actual supplyPrice, MasterSupplierProduct path returns supplyPrice: null', async () => {
      prisma.supplierProduct.findMany.mockResolvedValue([
        {
          optionId: 'opt-1',
          supplyPrice: 3_500,
          minOrderQty: 10,
          option: {
            id: 'opt-1',
            sku: 'SKU-0001',
            optionName: 'Red-S',
            masterId: 'mst-1',
            master: { id: 'mst-1', code: 'M001', name: 'Master One' },
          },
        },
      ]);
      prisma.masterSupplierProduct.findMany.mockResolvedValue([
        {
          minOrderQty: 20,
          master: {
            id: 'mst-2',
            code: 'M002',
            name: 'Master Two',
            options: [
              { id: 'opt-2', sku: 'SKU-0002', optionName: 'Blue-M' },
              { id: 'opt-3', sku: 'SKU-0003', optionName: 'Blue-L' },
            ],
          },
        },
      ]);
      prisma.orderLineItem.groupBy.mockResolvedValue([
        { optionId: 'opt-1', _count: { _all: 2 }, _sum: { quantity: 5, totalPrice: 25_000 } },
        { optionId: 'opt-2', _count: { _all: 1 }, _sum: { quantity: 3, totalPrice: 15_000 } },
        // opt-3 — 주문 없음
      ]);

      const result = await service.getProductSales('organization-1', 'sup-1');

      expect(prisma.supplierProduct.findMany).toHaveBeenCalledWith({
        where: {
          supplierId: 'sup-1',
          supplier: { organizationId: 'organization-1' },
          option: { master: { organizationId: 'organization-1' } },
        },
        include: expect.any(Object),
      });
      expect(prisma.masterSupplierProduct.findMany).toHaveBeenCalledWith({
        where: {
          supplierId: 'sup-1',
          supplier: { organizationId: 'organization-1' },
          master: { organizationId: 'organization-1' },
        },
        include: expect.any(Object),
      });

      expect(result.summary).toEqual({
        productCount: 3,
        totalOrders: 3,
        totalQuantity: 8,
        totalRevenue: 40_000,
      });
      expect(result.items).toEqual([
        // SupplierProduct 경로 — supplyPrice 실값
        {
          optionId: 'opt-1',
          sku: 'SKU-0001',
          optionName: 'Red-S',
          masterId: 'mst-1',
          masterCode: 'M001',
          masterName: 'Master One',
          supplyPrice: 3_500,
          minOrderQty: 10,
          totalOrders: 2,
          totalQuantity: 5,
          totalRevenue: 25_000,
        },
        // MasterSupplierProduct 경로 — supplyPrice: null (schema 에 없음, spec §5.5)
        {
          optionId: 'opt-2',
          sku: 'SKU-0002',
          optionName: 'Blue-M',
          masterId: 'mst-2',
          masterCode: 'M002',
          masterName: 'Master Two',
          supplyPrice: null,
          minOrderQty: 20,
          totalOrders: 1,
          totalQuantity: 3,
          totalRevenue: 15_000,
        },
        {
          optionId: 'opt-3',
          sku: 'SKU-0003',
          optionName: 'Blue-L',
          masterId: 'mst-2',
          masterCode: 'M002',
          masterName: 'Master Two',
          supplyPrice: null,
          minOrderQty: 20,
          totalOrders: 0,
          totalQuantity: 0,
          totalRevenue: 0,
        },
      ]);
    });

    it('중복 방지 — SupplierProduct 에서 카운트된 option 은 MasterSupplierProduct 경로에서 skip', async () => {
      // opt-1 은 SupplierProduct 로 등록되어 있고, MasterSupplierProduct.master.options 에도 포함됨
      prisma.supplierProduct.findMany.mockResolvedValue([
        {
          optionId: 'opt-1',
          supplyPrice: 2_000,
          minOrderQty: 5,
          option: {
            id: 'opt-1',
            sku: 'SKU-0001',
            optionName: 'Shared',
            masterId: 'mst-1',
            master: { id: 'mst-1', code: 'M001', name: 'Master One' },
          },
        },
      ]);
      prisma.masterSupplierProduct.findMany.mockResolvedValue([
        {
          minOrderQty: 30,
          master: {
            id: 'mst-1',
            code: 'M001',
            name: 'Master One',
            options: [
              { id: 'opt-1', sku: 'SKU-0001', optionName: 'Shared' }, // 중복
              { id: 'opt-2', sku: 'SKU-0002', optionName: 'Only Master' },
            ],
          },
        },
      ]);
      prisma.orderLineItem.groupBy.mockResolvedValue([
        { optionId: 'opt-1', _count: { _all: 3 }, _sum: { quantity: 9, totalPrice: 45_000 } },
        { optionId: 'opt-2', _count: { _all: 1 }, _sum: { quantity: 4, totalPrice: 20_000 } },
      ]);

      const result = await service.getProductSales('organization-1', 'sup-1');

      // opt-1 은 SupplierProduct 경로에서만 나와야 함 (supplyPrice: 2_000)
      // opt-2 는 MasterSupplierProduct 경로에서 나오고 supplyPrice: null
      expect(result.summary).toEqual({
        productCount: 2,
        totalOrders: 4,
        totalQuantity: 13,
        totalRevenue: 65_000,
      });
      expect(result.items).toHaveLength(2);
      const opt1Row = result.items.find((r) => r.optionId === 'opt-1');
      expect(opt1Row?.supplyPrice).toBe(2_000);
      expect(opt1Row?.minOrderQty).toBe(5);

      const opt2Row = result.items.find((r) => r.optionId === 'opt-2');
      expect(opt2Row?.supplyPrice).toBeNull();
      expect(opt2Row?.minOrderQty).toBe(30);
    });

    it('empty supplier 매핑 → empty result (no groupBy call)', async () => {
      prisma.supplierProduct.findMany.mockResolvedValue([]);
      prisma.masterSupplierProduct.findMany.mockResolvedValue([]);

      const result = await service.getProductSales('organization-1', 'sup-1');

      expect(result).toEqual({
        summary: {
          productCount: 0,
          totalOrders: 0,
          totalQuantity: 0,
          totalRevenue: 0,
        },
        items: [],
      });
      expect(prisma.orderLineItem.groupBy).not.toHaveBeenCalled();
    });
  });

  describe('getHistory', () => {
    it('merges PurchaseOrder + SupplierPayment timeline sorted desc by date', async () => {
      prisma.purchaseOrder.findMany.mockResolvedValue([
        {
          id: '11111111-1111-1111-1111-111111111111',
          orderDate: new Date('2026-04-10'),
          totalAmountCny: '1000.00',
          status: 'ordered',
          supplierName: 'Supplier One',
        },
      ]);
      prisma.supplierPayment.findMany.mockResolvedValue([
        {
          id: '22222222-2222-2222-2222-222222222222',
          createdAt: new Date('2026-04-15'),
          amount: 500_000,
          status: 'paid',
          notes: null,
        },
      ]);

      const report = await service.getHistory('organization-1', 'sup-1');
      const timeline = report.items;

      // 최신이 먼저 — 2026-04-15 > 2026-04-10
      expect(report.summary).toEqual({
        totalOrdered: 1000,
        totalPaid: 500_000,
        unpaid: 0,
        orderCount: 1,
        paymentCount: 1,
      });
      expect(timeline[0].type).toBe('payment');
      expect(timeline[0].amount).toBe(500_000);
      expect(timeline[1].type).toBe('purchaseOrder');
      expect(timeline[1].amount).toBe(1000); // Number("1000.00") === 1000
      expect(timeline[1].description).toBe('발주 #11111111 - Supplier One');
    });

    it('does not count unpaid zero-paid supplier payments as paid', async () => {
      prisma.purchaseOrder.findMany.mockResolvedValue([]);
      prisma.supplierPayment.findMany.mockResolvedValue([
        {
          id: '22222222-2222-2222-2222-222222222222',
          createdAt: new Date('2026-04-15'),
          amount: 1_000,
          paidAmount: 0,
          status: 'unpaid',
          notes: null,
        },
        {
          id: '33333333-3333-3333-3333-333333333333',
          createdAt: new Date('2026-04-16'),
          amount: 1_000,
          paidAmount: 250,
          status: 'partial',
          notes: null,
        },
        {
          id: '44444444-4444-4444-4444-444444444444',
          createdAt: new Date('2026-04-17'),
          amount: 1_000,
          paidAmount: 0,
          status: 'paid',
          notes: null,
        },
      ]);

      const report = await service.getHistory('organization-1', 'sup-1');

      expect(report.summary).toMatchObject({
        totalPaid: 1_250,
        paymentCount: 3,
      });
      expect(report.items.find((item) => item.status === 'unpaid')?.amount).toBe(0);
      expect(report.items.find((item) => item.status === 'partial')?.amount).toBe(250);
      expect(report.items.find((item) => item.status === 'paid')?.amount).toBe(1_000);
    });

    it('scopes purchaseOrder + payment by organizationId + supplierId', async () => {
      prisma.purchaseOrder.findMany.mockResolvedValue([]);
      prisma.supplierPayment.findMany.mockResolvedValue([]);

      await service.getHistory('organization-1', 'sup-1');

      expect(prisma.purchaseOrder.findMany).toHaveBeenCalledWith({
        where: { organizationId: 'organization-1', supplierId: 'sup-1' },
        orderBy: { orderDate: 'desc' },
      });
      expect(prisma.supplierPayment.findMany).toHaveBeenCalledWith({
        where: { organizationId: 'organization-1', supplierId: 'sup-1' },
        orderBy: { createdAt: 'desc' },
      });
    });
  });
});
