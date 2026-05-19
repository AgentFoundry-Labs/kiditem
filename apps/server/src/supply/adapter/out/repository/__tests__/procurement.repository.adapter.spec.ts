import { describe, expect, it, vi } from 'vitest';
import { ProcurementRepositoryAdapter } from '../procurement.repository.adapter';

function makePrisma() {
  return {
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
    productOption: {
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

    const result = await adapter.list('organization-1', { page: 2, limit: 10, status: 'draft', supplierId: 'supplier-1' });

    expect(prisma.purchaseOrder.findMany).toHaveBeenCalledWith({
      where: { organizationId: 'organization-1', status: 'draft', supplierId: 'supplier-1' },
      include: { items: true, supplier: true },
      orderBy: { orderDate: 'desc' },
      skip: 10,
      take: 10,
    });
    expect(result).toMatchObject({
      total: 1,
      page: 2,
      limit: 10,
      counts: { all: 1, draft: 1, pending: 0, ordered: 0, shipped: 0, received: 0, cancelled: 0 },
      summary: { orderCount: 1, totalQuantity: 5, totalAmountCny: 12.5 },
    });
  });

  it('validates supplier and option ownership before creating purchase order', async () => {
    const prisma = makePrisma();
    prisma.supplier.findFirst.mockResolvedValue({ id: 'supplier-1' });
    prisma.productOption.findMany.mockResolvedValue([{ id: 'option-1' }]);
    prisma.purchaseOrder.create.mockResolvedValue({ id: 'po-1' });
    const adapter = new ProcurementRepositoryAdapter(prisma as never);

    await adapter.createDraft('organization-1', {
      supplierName: 'Supplier A',
      supplierId: 'supplier-1',
      items: [{ productName: 'Widget', optionId: 'option-1', quantity: 2, unitPriceCny: 3 }],
    });

    expect(prisma.supplier.findFirst).toHaveBeenCalledWith({
      where: { id: 'supplier-1', organizationId: 'organization-1' },
      select: { id: true },
    });
    expect(prisma.productOption.findMany).toHaveBeenCalledWith({
      where: { id: { in: ['option-1'] }, organizationId: 'organization-1', isDeleted: false },
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

  it('returns missing option ids instead of creating when ownership check fails', async () => {
    const prisma = makePrisma();
    prisma.productOption.findMany.mockResolvedValue([{ id: 'option-1' }]);
    const adapter = new ProcurementRepositoryAdapter(prisma as never);

    const result = await adapter.createDraft('organization-1', {
      supplierName: 'Supplier A',
      items: [
        { productName: 'A', optionId: 'option-1', quantity: 1, unitPriceCny: 1 },
        { productName: 'B', optionId: 'option-2', quantity: 1, unitPriceCny: 1 },
      ],
    });

    expect(result).toEqual({ ok: false, reason: 'option_not_found', missingOptionIds: ['option-2'] });
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
