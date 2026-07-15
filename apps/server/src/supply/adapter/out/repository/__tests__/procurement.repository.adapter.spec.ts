import { describe, expect, it, vi } from 'vitest';
import { ProcurementRepositoryAdapter } from '../procurement.repository.adapter';

function makePrisma() {
  return {
    $executeRaw: vi.fn().mockResolvedValue(0),
    purchaseOrder: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      groupBy: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      findFirst: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    supplier: {
      findFirst: vi.fn(),
    },
    masterProduct: {
      findMany: vi.fn(),
    },
  };
}

describe('ProcurementRepositoryAdapter', () => {
  it('lists purchase orders with status counts and quantity/amount summary', async () => {
    const prisma = makePrisma();
    prisma.purchaseOrder.findMany
      .mockResolvedValueOnce([{ id: 'po-1', status: 'draft' }])
      .mockResolvedValueOnce([
        { totalAmountCny: '12.50', items: [{ quantity: 2 }, { quantity: 3 }] },
      ]);
    prisma.purchaseOrder.count.mockResolvedValue(1);
    prisma.purchaseOrder.groupBy.mockResolvedValue([{ status: 'draft', _count: { id: 1 } }]);
    const adapter = new ProcurementRepositoryAdapter(prisma as never);

    const result = await adapter.list('organization-1', {
      page: 2,
      limit: 10,
      status: 'draft',
      supplierId: 'supplier-1',
      orderId: 'po-1',
    });

    expect(prisma.purchaseOrder.findMany).toHaveBeenCalledWith({
      where: {
        organizationId: 'organization-1',
        id: 'po-1',
        status: 'draft',
        supplierId: 'supplier-1',
      },
      include: {
        items: true,
        supplier: true,
        submissionAttempts: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            id: true,
            idempotencyKey: true,
            status: true,
            providerReference: true,
            errorCode: true,
            errorMessage: true,
            reconciliationOutcome: true,
            reconciledAt: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
      orderBy: { orderDate: 'desc' },
      skip: 10,
      take: 10,
    });
    expect(prisma.$executeRaw).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      total: 1,
      page: 2,
      limit: 10,
      counts: { all: 1, draft: 1, pending: 0, ordered: 0, shipped: 0, received: 0, cancelled: 0 },
      summary: { orderCount: 1, totalQuantity: 5, totalAmountCny: 12.5 },
    });
  });

  it('returns only the latest durable submission-attempt summary', async () => {
    const prisma = makePrisma();
    const attempt = {
      id: 'attempt-2',
      idempotencyKey: 'submit-2',
      status: 'provider_unknown',
      providerReference: null,
      errorCode: 'provider_response_unknown',
      errorMessage: 'timeout',
      reconciliationOutcome: null,
      reconciledAt: null,
      createdAt: new Date('2026-07-16T00:00:00.000Z'),
      updatedAt: new Date('2026-07-16T00:01:00.000Z'),
    };
    prisma.purchaseOrder.findMany
      .mockResolvedValueOnce([{
        id: 'po-1',
        status: 'pending',
        items: [],
        supplier: null,
        submissionAttempts: [attempt],
      }])
      .mockResolvedValueOnce([]);
    const adapter = new ProcurementRepositoryAdapter(prisma as never);

    const result = await adapter.list('organization-1', {});

    expect(result.items).toEqual([{
      id: 'po-1',
      status: 'pending',
      items: [],
      supplier: null,
      latestSubmissionAttempt: attempt,
    }]);
  });

  it('validates supplier and physical Master ownership before creating purchase order', async () => {
    const prisma = makePrisma();
    prisma.supplier.findFirst.mockResolvedValue({ id: 'supplier-1' });
    prisma.masterProduct.findMany.mockResolvedValue([{ id: 'master-1' }]);
    prisma.purchaseOrder.create.mockResolvedValue({ id: 'po-1' });
    const adapter = new ProcurementRepositoryAdapter(prisma as never);

    await adapter.createDraft('organization-1', {
      supplierName: 'Supplier A',
      supplierId: 'supplier-1',
      items: [{ productName: 'Widget', masterProductId: 'master-1', quantity: 2, unitPriceCny: 3 }],
    });

    expect(prisma.supplier.findFirst).toHaveBeenCalledWith({
      where: { id: 'supplier-1', organizationId: 'organization-1' },
      select: { id: true },
    });
    expect(prisma.masterProduct.findMany).toHaveBeenCalledWith({
      where: {
        id: { in: ['master-1'] },
        organizationId: 'organization-1',
        isActive: true,
      },
      select: { id: true },
    });
    expect(prisma.purchaseOrder.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organizationId: 'organization-1',
          supplierName: 'Supplier A',
          supplierId: 'supplier-1',
          totalAmountCny: 6,
          status: 'draft',
        }),
      }),
    );
  });

  it('returns missing Master ids instead of creating when ownership check fails', async () => {
    const prisma = makePrisma();
    prisma.masterProduct.findMany.mockResolvedValue([{ id: 'master-1' }]);
    const adapter = new ProcurementRepositoryAdapter(prisma as never);

    const result = await adapter.createDraft('organization-1', {
      supplierName: 'Supplier A',
      items: [
        { productName: 'A', masterProductId: 'master-1', quantity: 1, unitPriceCny: 1 },
        { productName: 'B', masterProductId: 'master-2', quantity: 1, unitPriceCny: 1 },
      ],
    });

    expect(result).toEqual({
      ok: false,
      reason: 'master_product_not_found',
      missingMasterProductIds: ['master-2'],
    });
    expect(prisma.purchaseOrder.create).not.toHaveBeenCalled();
  });

  it('updates purchase order status within organization scope and returns the refreshed order', async () => {
    const prisma = makePrisma();
    prisma.purchaseOrder.findFirst.mockResolvedValue({ id: 'po-1', status: 'pending' });
    prisma.purchaseOrder.updateMany.mockResolvedValue({ count: 1 });
    const adapter = new ProcurementRepositoryAdapter(prisma as never);

    const updated = await adapter.updateStatusScoped('organization-1', 'po-1', 'pending', {
      status: 'ordered',
    });

    expect(prisma.purchaseOrder.updateMany).toHaveBeenCalledWith({
      where: { id: 'po-1', organizationId: 'organization-1', status: 'pending' },
      data: { status: 'ordered' },
    });
    expect(updated).toEqual({ id: 'po-1', status: 'pending' });
  });

  it('loads an organization-scoped checkout snapshot with supplier and item lines', async () => {
    const prisma = makePrisma();
    prisma.purchaseOrder.findFirst.mockResolvedValue({
      id: 'po-1',
      supplierName: '1688 Supplier',
      supplierId: 'supplier-1',
      totalAmountCny: '45.60',
      items: [
        {
          productName: 'Silicone plate',
          masterProductId: 'master-1',
          quantity: 2,
          unitPriceCny: '22.80',
        },
      ],
    });
    const adapter = new ProcurementRepositoryAdapter(prisma as never);

    const snapshot = await adapter.findCheckoutSnapshot('organization-1', 'po-1');

    expect(prisma.purchaseOrder.findFirst).toHaveBeenCalledWith({
      where: { id: 'po-1', organizationId: 'organization-1' },
      select: {
        id: true,
        supplierName: true,
        supplierId: true,
        totalAmountCny: true,
        items: {
          select: {
            productName: true,
            masterProductId: true,
            quantity: true,
            unitPriceCny: true,
          },
        },
      },
    });
    expect(snapshot).toEqual({
      id: 'po-1',
      supplierName: '1688 Supplier',
      supplierId: 'supplier-1',
      totalAmountCny: '45.60',
      items: [
        {
          productName: 'Silicone plate',
          masterProductId: 'master-1',
          quantity: 2,
          unitPriceCny: '22.80',
        },
      ],
    });
  });

  it('persists external supplier order identity when marking an order as ordered', async () => {
    const prisma = makePrisma();
    prisma.purchaseOrder.findFirst.mockResolvedValue({
      id: 'po-1',
      status: 'ordered',
      externalOrderPlatform: 'ALIBABA_1688',
      externalOrderId: '1688-ORDER-1',
      externalOrderUrl: 'https://trade.1688.com/order/1688-ORDER-1.html',
    });
    prisma.purchaseOrder.updateMany.mockResolvedValue({ count: 1 });
    const adapter = new ProcurementRepositoryAdapter(prisma as never);

    const updated = await adapter.updateStatusScoped('organization-1', 'po-1', 'pending', {
      status: 'ordered',
      externalOrderPlatform: 'ALIBABA_1688',
      externalOrderId: '1688-ORDER-1',
      externalOrderUrl: 'https://trade.1688.com/order/1688-ORDER-1.html',
    });

    expect(prisma.purchaseOrder.updateMany).toHaveBeenCalledWith({
      where: { id: 'po-1', organizationId: 'organization-1', status: 'pending' },
      data: {
        status: 'ordered',
        externalOrderPlatform: 'ALIBABA_1688',
        externalOrderId: '1688-ORDER-1',
        externalOrderUrl: 'https://trade.1688.com/order/1688-ORDER-1.html',
      },
    });
    expect(updated).toEqual({
      id: 'po-1',
      status: 'ordered',
      externalOrderPlatform: 'ALIBABA_1688',
      externalOrderId: '1688-ORDER-1',
      externalOrderUrl: 'https://trade.1688.com/order/1688-ORDER-1.html',
    });
  });

  it('does not update status when the current database status already changed', async () => {
    const prisma = makePrisma();
    prisma.purchaseOrder.updateMany.mockResolvedValue({ count: 0 });
    const adapter = new ProcurementRepositoryAdapter(prisma as never);

    const updated = await adapter.updateStatusScoped('organization-1', 'po-1', 'draft', {
      status: 'pending',
    });

    expect(prisma.purchaseOrder.updateMany).toHaveBeenCalledWith({
      where: { id: 'po-1', organizationId: 'organization-1', status: 'draft' },
      data: { status: 'pending' },
    });
    expect(prisma.purchaseOrder.findFirst).not.toHaveBeenCalled();
    expect(updated).toBeNull();
  });

  it('deletes only when the current database status is still deletable', async () => {
    const prisma = makePrisma();
    prisma.purchaseOrder.deleteMany.mockResolvedValue({ count: 1 });
    const adapter = new ProcurementRepositoryAdapter(prisma as never);

    const deleted = await adapter.deleteScoped('organization-1', 'po-1');

    expect(prisma.purchaseOrder.deleteMany).toHaveBeenCalledWith({
      where: {
        id: 'po-1',
        organizationId: 'organization-1',
        status: { in: ['draft', 'pending'] },
      },
    });
    expect(deleted).toBe(true);
  });
});
