import { describe, expect, it, vi } from 'vitest';
import { WarehousesRepositoryAdapter } from './warehouses.repository.adapter';

describe('WarehousesRepositoryAdapter', () => {
  it('returns raw organization warehouses ordered by name without relation aggregates', async () => {
    const rows = [
      {
        id: 'warehouse-a',
        organizationId: 'organization-1',
        name: '가 창고',
        code: null,
        address: null,
        manager: null,
        phone: null,
        isDefault: true,
        status: 'active',
        createdAt: new Date('2026-08-01T00:00:00.000Z'),
        updatedAt: new Date('2026-08-01T00:00:00.000Z'),
      },
    ];
    const findMany = vi.fn().mockResolvedValue(rows);
    const adapter = new WarehousesRepositoryAdapter({
      warehouse: { findMany },
    } as never);

    const result = await adapter.listWarehouses('organization-1');

    expect(findMany).toHaveBeenCalledWith({
      where: { organizationId: 'organization-1' },
      orderBy: { name: 'asc' },
    });
    expect(result).toBe(rows);
    expect(result[0]).not.toHaveProperty('_count');
    expect(result[0]).not.toHaveProperty('shipmentCount');
  });
});
