import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SupplierStatsService } from '../supplier-stats.service';

function makePrisma() {
  return {
    supplier: { findMany: vi.fn() },
    orderLineItem: { findMany: vi.fn() },
    purchaseOrder: { findMany: vi.fn() },
    supplierPayment: { findMany: vi.fn() },
  };
}

function supplierProduct(params: {
  supplierId: string;
  masterId: string;
  supplyPrice: number;
  isPrimary?: boolean;
  name?: string;
}) {
  return {
    id: `policy-${params.supplierId}-${params.masterId}`,
    masterProductId: params.masterId,
    supplyPrice: params.supplyPrice,
    minOrderQty: 1,
    isPrimary: params.isPrimary ?? true,
    masterProduct: {
      id: params.masterId,
      code: `SP-${params.masterId}`,
      name: params.name ?? `Sellpia ${params.masterId}`,
      optionName: null,
    },
  };
}

function orderLine(params: {
  id: string;
  quantity: number;
  totalPrice: number;
  components: Array<{ masterProductId: string | null; quantity: number }>;
}) {
  return {
    id: params.id,
    quantity: params.quantity,
    totalPrice: params.totalPrice,
    listingOption: { components: params.components },
  };
}

describe('SupplierStatsService', () => {
  let service: SupplierStatsService;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    prisma = makePrisma();
    service = new SupplierStatsService(prisma as never);
  });

  it('allocates bundle revenue once by extended primary-supplier cost and counts physical units', async () => {
    prisma.supplier.findMany.mockResolvedValue([
      {
        id: 'supplier-1',
        name: 'Supplier One',
        supplierProducts: [supplierProduct({
          supplierId: 'supplier-1',
          masterId: 'master-1',
          supplyPrice: 100,
        })],
      },
      {
        id: 'supplier-2',
        name: 'Supplier Two',
        supplierProducts: [supplierProduct({
          supplierId: 'supplier-2',
          masterId: 'master-2',
          supplyPrice: 300,
        })],
      },
    ]);
    prisma.orderLineItem.findMany.mockResolvedValue([
      orderLine({
        id: 'line-1',
        quantity: 2,
        totalPrice: 10_000,
        components: [
          { masterProductId: 'master-1', quantity: 1 },
          { masterProductId: 'master-2', quantity: 3 },
        ],
      }),
    ]);

    const report = await service.getSalesBySupplier('organization-1');

    expect(prisma.orderLineItem.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        organizationId: 'organization-1',
        order: {
          organizationId: 'organization-1',
          status: { notIn: ['cancelled', 'returned'] },
        },
      },
    }));
    expect(report).toEqual({
      summary: {
        supplierCount: 2,
        productCount: 2,
        totalOrders: 2,
        totalQuantity: 8,
        totalRevenue: 10_000,
        unallocatedRevenue: 0,
      },
      items: [
        {
          supplierId: 'supplier-1',
          supplierName: 'Supplier One',
          productCount: 1,
          totalOrders: 1,
          totalQuantity: 2,
          totalRevenue: 1_000,
        },
        {
          supplierId: 'supplier-2',
          supplierName: 'Supplier Two',
          productCount: 1,
          totalOrders: 1,
          totalQuantity: 6,
          totalRevenue: 9_000,
        },
      ],
    });
  });

  it('keeps known physical-unit counts but leaves the whole line revenue unallocated when a policy is incomplete', async () => {
    prisma.supplier.findMany.mockResolvedValue([
      {
        id: 'supplier-1',
        name: 'Supplier One',
        supplierProducts: [supplierProduct({
          supplierId: 'supplier-1',
          masterId: 'master-1',
          supplyPrice: 100,
        })],
      },
    ]);
    prisma.orderLineItem.findMany.mockResolvedValue([
      orderLine({
        id: 'line-1',
        quantity: 4,
        totalPrice: 12_345,
        components: [
          { masterProductId: 'master-1', quantity: 2 },
          { masterProductId: 'master-without-primary-supplier', quantity: 1 },
        ],
      }),
    ]);

    const report = await service.getSalesBySupplier('organization-1');

    expect(report.summary).toEqual({
      supplierCount: 1,
      productCount: 1,
      totalOrders: 1,
      totalQuantity: 8,
      totalRevenue: 0,
      unallocatedRevenue: 12_345,
    });
    expect(report.items[0]).toMatchObject({
      totalOrders: 1,
      totalQuantity: 8,
      totalRevenue: 0,
    });
  });

  it('assigns integer rounding remainder deterministically without duplicating revenue', async () => {
    prisma.supplier.findMany.mockResolvedValue([
      {
        id: 'supplier-1',
        name: 'Supplier One',
        supplierProducts: [supplierProduct({
          supplierId: 'supplier-1',
          masterId: 'master-a',
          supplyPrice: 1,
        })],
      },
      {
        id: 'supplier-2',
        name: 'Supplier Two',
        supplierProducts: [supplierProduct({
          supplierId: 'supplier-2',
          masterId: 'master-z',
          supplyPrice: 1,
        })],
      },
    ]);
    prisma.orderLineItem.findMany.mockResolvedValue([
      orderLine({
        id: 'line-1',
        quantity: 1,
        totalPrice: 101,
        components: [
          { masterProductId: 'master-z', quantity: 1 },
          { masterProductId: 'master-a', quantity: 1 },
        ],
      }),
    ]);

    const report = await service.getSalesBySupplier('organization-1');

    expect(report.items.map((item) => item.totalRevenue)).toEqual([50, 51]);
    expect(report.summary.totalRevenue).toBe(101);
  });

  it('returns physical Master rows for one supplier without ProductOption identity', async () => {
    prisma.supplier.findMany.mockResolvedValue([
      {
        id: 'supplier-1',
        name: 'Supplier One',
        supplierProducts: [supplierProduct({
          supplierId: 'supplier-1',
          masterId: 'master-1',
          supplyPrice: 500,
          name: '우파루팡반짝슈가말랑이',
        })],
      },
    ]);
    prisma.orderLineItem.findMany.mockResolvedValue([
      orderLine({
        id: 'line-1',
        quantity: 1,
        totalPrice: 8_000,
        components: [{ masterProductId: 'master-1', quantity: 8 }],
      }),
    ]);

    const report = await service.getProductSales('organization-1', 'supplier-1');

    expect(report).toEqual({
      summary: {
        productCount: 1,
        totalOrders: 1,
        totalQuantity: 8,
        totalRevenue: 8_000,
      },
      items: [{
        masterId: 'master-1',
        masterCode: 'SP-master-1',
        masterName: '우파루팡반짝슈가말랑이',
        optionName: null,
        supplyPrice: 500,
        minOrderQty: 1,
        totalOrders: 1,
        totalQuantity: 8,
        totalRevenue: 8_000,
      }],
    });
    expect(report.items[0]).not.toHaveProperty('optionId');
  });

  it('merges purchase orders and settled supplier payments in descending date order', async () => {
    prisma.purchaseOrder.findMany.mockResolvedValue([{
      id: '11111111-1111-1111-1111-111111111111',
      orderDate: new Date('2026-04-10'),
      totalAmountCny: '1000.00',
      status: 'ordered',
      supplierName: 'Supplier One',
    }]);
    prisma.supplierPayment.findMany.mockResolvedValue([{
      id: '22222222-2222-2222-2222-222222222222',
      createdAt: new Date('2026-04-15'),
      amount: 500_000,
      paidAmount: 250_000,
      status: 'partial',
      notes: null,
    }]);

    const report = await service.getHistory('organization-1', 'supplier-1');

    expect(report.summary).toEqual({
      totalOrdered: 1_000,
      totalPaid: 250_000,
      unpaid: 0,
      orderCount: 1,
      paymentCount: 1,
    });
    expect(report.items.map((item) => item.type)).toEqual(['payment', 'purchaseOrder']);
  });
});
