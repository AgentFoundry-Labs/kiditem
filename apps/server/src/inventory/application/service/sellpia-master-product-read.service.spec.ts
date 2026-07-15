import { describe, expect, it, vi } from 'vitest';
import type { SellpiaMasterProductReadRepositoryPort } from '../port/out/repository/sellpia-master-product-read.repository.port';
import { SellpiaMasterProductReadService } from './sellpia-master-product-read.service';

const organizationId = '00000000-0000-4000-8000-000000000001';

describe('SellpiaMasterProductReadService', () => {
  it('trims and deduplicates requested Sellpia codes', async () => {
    const repository = makeRepository();
    const service = new SellpiaMasterProductReadService(repository);

    await service.findByCodes(organizationId, [' SP-1 ', 'SP-1', '', 'SP-2']);

    expect(repository.findByCodes).toHaveBeenCalledWith(
      organizationId,
      ['SP-1', 'SP-2'],
    );
  });

  it('does not query for blank searches and caps result size', async () => {
    const repository = makeRepository();
    const service = new SellpiaMasterProductReadService(repository);

    await expect(service.search(organizationId, '   ', 500)).resolves.toEqual([]);
    await service.search(organizationId, ' product ', 500);

    expect(repository.search).toHaveBeenCalledOnce();
    expect(repository.search).toHaveBeenCalledWith(organizationId, 'product', 100);
  });

  it('deduplicates normalized names and skips an empty normalized-name read', async () => {
    const repository = makeRepository();
    const service = new SellpiaMasterProductReadService(repository);

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
});

function makeRepository() {
  return {
    findByIds: vi.fn<SellpiaMasterProductReadRepositoryPort['findByIds']>()
      .mockResolvedValue([]),
    findByCodes: vi.fn<SellpiaMasterProductReadRepositoryPort['findByCodes']>()
      .mockResolvedValue([]),
    findByBarcodes: vi.fn<SellpiaMasterProductReadRepositoryPort['findByBarcodes']>()
      .mockResolvedValue([]),
    findByNormalizedNames: vi
      .fn<SellpiaMasterProductReadRepositoryPort['findByNormalizedNames']>()
      .mockResolvedValue([]),
    search: vi.fn<SellpiaMasterProductReadRepositoryPort['search']>()
      .mockResolvedValue([]),
  };
}
