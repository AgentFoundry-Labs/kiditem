import { BadRequestException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SuppliersService } from '../application/service/suppliers.service';
import type { SupplierRepositoryPort } from '../application/port/out/supplier.repository.port';

function makeRepository(): SupplierRepositoryPort {
  return {
    listWithCounts: vi.fn(),
    create: vi.fn(),
    updateScoped: vi.fn(),
    deleteScoped: vi.fn(),
  } as unknown as SupplierRepositoryPort;
}

describe('SuppliersService — tenant-scoped mutations', () => {
  let service: SuppliersService;
  let suppliers: SupplierRepositoryPort;

  beforeEach(() => {
    suppliers = makeRepository();
    service = new SuppliersService(suppliers);
  });

  it('updates supplier through the outgoing repository port', async () => {
    const updated = { id: 'supplier-1', organizationId: 'organization-1', name: 'Updated' };
    vi.mocked(suppliers.updateScoped).mockResolvedValue(updated as never);

    const result = await service.update('supplier-1', 'organization-1', { name: 'Updated' });

    expect(suppliers.updateScoped).toHaveBeenCalledWith(
      'supplier-1',
      'organization-1',
      { name: 'Updated' },
    );
    expect(result).toEqual(updated);
  });

  it('maps missing supplier update results to BadRequestException', async () => {
    vi.mocked(suppliers.updateScoped).mockResolvedValue(null);

    await expect(
      service.update('supplier-1', 'organization-1', { name: 'Updated' }),
    ).rejects.toThrow(BadRequestException);

    expect(suppliers.updateScoped).toHaveBeenCalledWith(
      'supplier-1',
      'organization-1',
      { name: 'Updated' },
    );
  });

  it('deletes supplier through the outgoing repository port', async () => {
    vi.mocked(suppliers.deleteScoped).mockResolvedValue(true);

    const result = await service.delete('supplier-1', 'organization-1');

    expect(suppliers.deleteScoped).toHaveBeenCalledWith('supplier-1', 'organization-1');
    expect(result).toEqual({ ok: true });
  });

  it('maps missing supplier delete results to BadRequestException', async () => {
    vi.mocked(suppliers.deleteScoped).mockResolvedValue(false);

    await expect(service.delete('supplier-1', 'organization-1')).rejects.toThrow(BadRequestException);

    expect(suppliers.deleteScoped).toHaveBeenCalledWith('supplier-1', 'organization-1');
  });
});
