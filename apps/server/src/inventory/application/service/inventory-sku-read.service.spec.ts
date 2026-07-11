import { describe, expect, it, vi } from 'vitest';
import type { InventorySkuReadRepositoryPort } from '../port/out/repository/inventory-sku-read.repository.port';
import { InventorySkuReadService } from './inventory-sku-read.service';

const organizationId = '00000000-0000-4000-8000-000000000001';

describe('InventorySkuReadService', () => {
  it('returns early for empty identifier collections', async () => {
    const repository = makeRepository();
    const service = new InventorySkuReadService(repository);

    await expect(service.findByIds(organizationId, [])).resolves.toEqual([]);
    await expect(service.findBySellpiaCodes(organizationId, [' ', '\t'])).resolves.toEqual([]);
    await expect(service.findByBarcodes(organizationId, [])).resolves.toEqual([]);

    expect(repository.findByIds).not.toHaveBeenCalled();
    expect(repository.findBySellpiaCodes).not.toHaveBeenCalled();
    expect(repository.findByBarcodes).not.toHaveBeenCalled();
  });

  it('trims and deduplicates identifiers without numeric coercion', async () => {
    const repository = makeRepository();
    const service = new InventorySkuReadService(repository);

    await service.findByIds(organizationId, [' 001 ', '001', '  1 ']);
    await service.findBySellpiaCodes(organizationId, [' 001-ABC ', '001-ABC']);
    await service.findByBarcodes(organizationId, [' 0012345678901 ', '0012345678901']);

    expect(repository.findByIds).toHaveBeenCalledWith(organizationId, ['001', '1']);
    expect(repository.findBySellpiaCodes).toHaveBeenCalledWith(organizationId, ['001-ABC']);
    expect(repository.findByBarcodes).toHaveBeenCalledWith(organizationId, ['0012345678901']);
  });

  it('trims search, rejects blank input, and caps the repository limit at 100', async () => {
    const repository = makeRepository();
    const service = new InventorySkuReadService(repository);

    await expect(service.search(organizationId, '   ', 20)).resolves.toEqual([]);
    expect(repository.search).not.toHaveBeenCalled();

    await service.search(organizationId, '  SP-001  ', 250);
    expect(repository.search).toHaveBeenCalledWith(organizationId, 'SP-001', 100);
  });
});

function makeRepository() {
  return {
    findByIds: vi.fn<InventorySkuReadRepositoryPort['findByIds']>().mockResolvedValue([]),
    findBySellpiaCodes: vi
      .fn<InventorySkuReadRepositoryPort['findBySellpiaCodes']>()
      .mockResolvedValue([]),
    findByBarcodes: vi
      .fn<InventorySkuReadRepositoryPort['findByBarcodes']>()
      .mockResolvedValue([]),
    search: vi.fn<InventorySkuReadRepositoryPort['search']>().mockResolvedValue([]),
  };
}
