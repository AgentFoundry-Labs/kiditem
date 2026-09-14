import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readPublishedOrderLines } from '../../../orders/read/order-facts.reader';
import { SupplierStatsService } from '../supplier-stats.service';

vi.mock('../../../orders/read/order-facts.reader', () => ({
  readPublishedOrderLines: vi.fn(),
}));

/**
 * The projection policy — primary supplier, extended-cost revenue split and
 * rounding — over order lines as the Orders reader answers them. Which order
 * lines are published is the reader's rule and is proved against PostgreSQL in
 * `supplier-stats-flow.pg.integration.spec.ts`.
 */
function makePrisma() {
  return {
    supplier: { findMany: vi.fn() },
    channelListingOption: { findMany: vi.fn().mockResolvedValue([]) },
    purchaseOrder: { findMany: vi.fn() },
    supplierPayment: { findMany: vi.fn() },
    $transaction: vi.fn(() => {
      throw new Error('supplier stats reads no interactive transaction');
    }),
  };
}

function supplierProduct(params: {
  supplierId: string;
  sellpiaInventorySkuId: string;
  supplyPrice: number;
  isPrimary?: boolean;
  name?: string;
}) {
  return {
    id: `policy-${params.supplierId}-${params.sellpiaInventorySkuId}`,
    sellpiaInventorySkuId: params.sellpiaInventorySkuId,
    supplyPrice: params.supplyPrice,
    minOrderQty: 1,
    isPrimary: params.isPrimary ?? true,
    sellpiaInventorySku: {
      id: params.sellpiaInventorySkuId,
      code: `SP-${params.sellpiaInventorySkuId}`,
      name: params.name ?? `Sellpia ${params.sellpiaInventorySkuId}`,
      optionName: null,
    },
  };
}

type OrderLineInput = {
  id: string;
  quantity: number;
  totalPrice: number;
  components: Array<{ sellpiaInventorySkuId: string; quantity: number }>;
};

/** The Orders reader publishes these lines, each sold under its own channel option. */
function givenPublishedOrderLines(prisma: ReturnType<typeof makePrisma>, lines: OrderLineInput[]) {
  vi.mocked(readPublishedOrderLines).mockResolvedValue(lines.map((line) => ({
    orderId: 'order-1',
    lineItemId: line.id,
    listingOptionId: `option-${line.id}`,
    revenue: line.totalPrice,
    quantity: line.quantity,
  })));
  prisma.channelListingOption.findMany.mockResolvedValue(lines.map((line) => ({
    id: `option-${line.id}`,
    inventoryComponents: line.components,
  })));
}

describe('SupplierStatsService', () => {
  let service: SupplierStatsService;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    vi.clearAllMocks();
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
          sellpiaInventorySkuId: 'sku-1',
          supplyPrice: 100,
        })],
      },
      {
        id: 'supplier-2',
        name: 'Supplier Two',
        supplierProducts: [supplierProduct({
          supplierId: 'supplier-2',
          sellpiaInventorySkuId: 'sku-2',
          supplyPrice: 300,
        })],
      },
    ]);
    givenPublishedOrderLines(prisma, [{
      id: 'line-1',
      quantity: 2,
      totalPrice: 10_000,
      components: [
        { sellpiaInventorySkuId: 'sku-1', quantity: 1 },
        { sellpiaInventorySkuId: 'sku-2', quantity: 3 },
      ],
    }]);

    const report = await service.getSalesBySupplier('organization-1');

    // Cancelled and returned orders are not supplier sales.
    expect(readPublishedOrderLines).toHaveBeenCalledWith(prisma, {
      organizationId: 'organization-1',
      excludedStatuses: ['cancelled', 'returned'],
    });
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
          sellpiaInventorySkuId: 'sku-1',
          supplyPrice: 100,
        })],
      },
    ]);
    givenPublishedOrderLines(prisma, [{
      id: 'line-1',
      quantity: 4,
      totalPrice: 12_345,
      components: [
        { sellpiaInventorySkuId: 'sku-1', quantity: 2 },
        { sellpiaInventorySkuId: 'sku-without-primary-supplier', quantity: 1 },
      ],
    }]);

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
          sellpiaInventorySkuId: 'sku-a',
          supplyPrice: 1,
        })],
      },
      {
        id: 'supplier-2',
        name: 'Supplier Two',
        supplierProducts: [supplierProduct({
          supplierId: 'supplier-2',
          sellpiaInventorySkuId: 'sku-z',
          supplyPrice: 1,
        })],
      },
    ]);
    givenPublishedOrderLines(prisma, [{
      id: 'line-1',
      quantity: 1,
      totalPrice: 101,
      components: [
        { sellpiaInventorySkuId: 'sku-z', quantity: 1 },
        { sellpiaInventorySkuId: 'sku-a', quantity: 1 },
      ],
    }]);

    const report = await service.getSalesBySupplier('organization-1');

    expect(report.items.map((item) => item.totalRevenue)).toEqual([50, 51]);
    expect(report.summary.totalRevenue).toBe(101);
  });

  it('reads no listing options when no order line was ever published', async () => {
    prisma.supplier.findMany.mockResolvedValue([]);
    vi.mocked(readPublishedOrderLines).mockResolvedValue([]);

    const report = await service.getSalesBySupplier('organization-1');

    expect(prisma.channelListingOption.findMany).not.toHaveBeenCalled();
    expect(report.summary).toMatchObject({ totalRevenue: 0, unallocatedRevenue: 0 });
  });

  it('returns physical Sellpia inventory-SKU rows without channel-option identity', async () => {
    prisma.supplier.findMany.mockResolvedValue([
      {
        id: 'supplier-1',
        name: 'Supplier One',
        supplierProducts: [supplierProduct({
          supplierId: 'supplier-1',
          sellpiaInventorySkuId: 'sku-1',
          supplyPrice: 500,
          name: '우파루팡반짝슈가말랑이',
        })],
      },
    ]);
    givenPublishedOrderLines(prisma, [{
      id: 'line-1',
      quantity: 1,
      totalPrice: 8_000,
      components: [{ sellpiaInventorySkuId: 'sku-1', quantity: 8 }],
    }]);

    const report = await service.getProductSales('organization-1', 'supplier-1');

    expect(report).toEqual({
      summary: {
        productCount: 1,
        totalOrders: 1,
        totalQuantity: 8,
        totalRevenue: 8_000,
      },
      items: [{
        masterId: 'sku-1',
        masterCode: 'SP-sku-1',
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
