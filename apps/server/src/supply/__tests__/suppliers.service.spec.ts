import { BadRequestException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SuppliersService } from '../application/service/suppliers.service';

function makePrisma() {
  return {
    supplier: {
      findFirst: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
  };
}

describe('SuppliersService — tenant-scoped mutations', () => {
  let service: SuppliersService;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    prisma = makePrisma();
    service = new SuppliersService(prisma as any);
  });

  it('updates supplier with organization-scoped mutation predicate', async () => {
    prisma.supplier.findFirst
      .mockResolvedValueOnce({ id: 'supplier-1', organizationId: 'organization-1' })
      .mockResolvedValueOnce({ id: 'supplier-1', organizationId: 'organization-1', name: 'Updated' });
    prisma.supplier.updateMany.mockResolvedValue({ count: 1 });

    const result = await service.update('supplier-1', 'organization-1', { name: 'Updated' });

    expect(prisma.supplier.updateMany).toHaveBeenCalledWith({
      where: { id: 'supplier-1', organizationId: 'organization-1' },
      data: { name: 'Updated' },
    });
    expect(result).toEqual({ id: 'supplier-1', organizationId: 'organization-1', name: 'Updated' });
  });

  it('rejects cross-organization update before mutation', async () => {
    prisma.supplier.findFirst.mockResolvedValue(null);

    await expect(
      service.update('supplier-1', 'organization-1', { name: 'Updated' }),
    ).rejects.toThrow(BadRequestException);

    expect(prisma.supplier.updateMany).not.toHaveBeenCalled();
  });

  it('deletes supplier with organization-scoped mutation predicate', async () => {
    prisma.supplier.findFirst.mockResolvedValue({ id: 'supplier-1', organizationId: 'organization-1' });
    prisma.supplier.deleteMany.mockResolvedValue({ count: 1 });

    const result = await service.delete('supplier-1', 'organization-1');

    expect(prisma.supplier.deleteMany).toHaveBeenCalledWith({
      where: { id: 'supplier-1', organizationId: 'organization-1' },
    });
    expect(result).toEqual({ ok: true });
  });

  it('rejects cross-organization delete before mutation', async () => {
    prisma.supplier.findFirst.mockResolvedValue(null);

    await expect(service.delete('supplier-1', 'organization-1')).rejects.toThrow(BadRequestException);

    expect(prisma.supplier.deleteMany).not.toHaveBeenCalled();
  });
});
