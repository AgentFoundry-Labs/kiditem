import { describe, expect, it, vi } from 'vitest';
import { SupplierRepositoryAdapter } from '../supplier.repository.adapter';

function makePrisma() {
  return {
    supplier: {
      findMany: vi.fn(),
      create: vi.fn(),
      findFirst: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
  };
}

describe('SupplierRepositoryAdapter', () => {
  it('lists organization suppliers with product and order counts', async () => {
    const prisma = makePrisma();
    prisma.supplier.findMany.mockResolvedValue([
      {
        id: 'supplier-1',
        name: 'Supplier A',
        _count: {
          supplierProducts: 2,
          purchaseOrders: 4,
        },
      },
    ]);
    const adapter = new SupplierRepositoryAdapter(prisma as never);

    const suppliers = await adapter.listWithCounts('organization-1');

    expect(prisma.supplier.findMany).toHaveBeenCalledWith({
      where: { organizationId: 'organization-1' },
      include: {
        _count: {
          select: {
            supplierProducts: true,
            purchaseOrders: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    expect(suppliers).toEqual([
      { id: 'supplier-1', name: 'Supplier A', productCount: 2, orderCount: 4 },
    ]);
  });

  it('updates only within organization scope and returns the refreshed supplier', async () => {
    const prisma = makePrisma();
    prisma.supplier.findFirst
      .mockResolvedValueOnce({ id: 'supplier-1' })
      .mockResolvedValueOnce({ id: 'supplier-1', name: 'Updated' });
    prisma.supplier.updateMany.mockResolvedValue({ count: 1 });
    const adapter = new SupplierRepositoryAdapter(prisma as never);

    const updated = await adapter.updateScoped('supplier-1', 'organization-1', { name: 'Updated' });

    expect(prisma.supplier.updateMany).toHaveBeenCalledWith({
      where: { id: 'supplier-1', organizationId: 'organization-1' },
      data: { name: 'Updated' },
    });
    expect(updated).toEqual({ id: 'supplier-1', name: 'Updated' });
  });

  it('deletes only within organization scope', async () => {
    const prisma = makePrisma();
    prisma.supplier.findFirst.mockResolvedValue({ id: 'supplier-1' });
    prisma.supplier.deleteMany.mockResolvedValue({ count: 1 });
    const adapter = new SupplierRepositoryAdapter(prisma as never);

    const deleted = await adapter.deleteScoped('supplier-1', 'organization-1');

    expect(prisma.supplier.deleteMany).toHaveBeenCalledWith({
      where: { id: 'supplier-1', organizationId: 'organization-1' },
    });
    expect(deleted).toBe(true);
  });
});
