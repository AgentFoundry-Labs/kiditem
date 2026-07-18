import { describe, expect, it, vi } from 'vitest';
import type { SellpiaInventorySkuReadRepositoryPort } from '../port/out/repository/sellpia-inventory-sku-read.repository.port';
import { SellpiaInventorySkuReadService } from './sellpia-inventory-sku-read.service';

const organizationId = '00000000-0000-4000-8000-000000000001';

describe('SellpiaInventorySkuReadService', () => {
  it('trims and deduplicates requested Sellpia codes', async () => {
    const repository = makeRepository();
    const service = new SellpiaInventorySkuReadService(repository);

    await service.findByCodes(organizationId, [' SP-1 ', 'SP-1', '', 'SP-2']);

    expect(repository.findByCodes).toHaveBeenCalledWith(
      organizationId,
      ['SP-1', 'SP-2'],
    );
  });

  it('does not query for blank searches and caps result size', async () => {
    const repository = makeRepository();
    const service = new SellpiaInventorySkuReadService(repository);

    await expect(service.search(organizationId, '   ', 500)).resolves.toEqual([]);
    await service.search(organizationId, ' product ', 500);

    expect(repository.search).toHaveBeenCalledOnce();
    expect(repository.search).toHaveBeenCalledWith(organizationId, 'product', 100);
  });

  it('deduplicates normalized names and skips an empty normalized-name read', async () => {
    const repository = makeRepository();
    const service = new SellpiaInventorySkuReadService(repository);

    await service.findByNormalizedNames(organizationId, [
      '아기컵',
      ' 아기컵 ',
      '',
      '빨대컵',
    ]);
    await expect(service.findByNormalizedNames(organizationId, [' ', '']))
      .resolves.toEqual([]);

    expect(repository.findByNormalizedNames).toHaveBeenCalledOnce();
    expect(repository.findByNormalizedNames).toHaveBeenCalledWith(
      organizationId,
      ['아기컵', '빨대컵'],
    );
  });

  it('keeps only unique 8-14 digit normalized physical barcodes', async () => {
    const repository = makeRepository();
    const service = new SellpiaInventorySkuReadService(repository);

    await service.findByNormalizedBarcodes(organizationId, [
      '001234567890',
      '001234567890',
      '1234567',
      '123456789012345',
      '1234-5678',
      '',
    ]);
    await expect(service.findByNormalizedBarcodes(organizationId, ['bad', '123']))
      .resolves.toEqual([]);

    expect(repository.findByNormalizedBarcodes).toHaveBeenCalledOnce();
    expect(repository.findByNormalizedBarcodes).toHaveBeenCalledWith(
      organizationId,
      ['001234567890'],
    );
  });
});

function makeRepository() {
  return {
    findByIds: vi.fn<SellpiaInventorySkuReadRepositoryPort['findByIds']>()
      .mockResolvedValue([]),
    findByCodes: vi.fn<SellpiaInventorySkuReadRepositoryPort['findByCodes']>()
      .mockResolvedValue([]),
    findByBarcodes: vi.fn<SellpiaInventorySkuReadRepositoryPort['findByBarcodes']>()
      .mockResolvedValue([]),
    findByNormalizedBarcodes: vi
      .fn<SellpiaInventorySkuReadRepositoryPort['findByNormalizedBarcodes']>()
      .mockResolvedValue([]),
    findByNormalizedNames: vi
      .fn<SellpiaInventorySkuReadRepositoryPort['findByNormalizedNames']>()
      .mockResolvedValue([]),
    search: vi.fn<SellpiaInventorySkuReadRepositoryPort['search']>()
      .mockResolvedValue([]),
  };
}
