import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { ProductAvailabilityPort } from '../../../products/application/port/in/product-availability.port';
import { ChannelOptionRecipeCandidateService } from './channel-option-recipe-candidate.service';

const organizationId = '00000000-0000-4000-8000-000000000001';
const masterProductId = '00000000-0000-4000-8000-000000000002';

describe('ChannelOptionRecipeCandidateService', () => {
  it('returns the bounded Products availability search', async () => {
    const availability = makeAvailability([{
      masterProductId,
      code: 'KI-001',
      name: '식판',
      optionName: '분홍',
      barcode: '8800000000001',
      currentStock: 8,
    }]);
    const service = new ChannelOptionRecipeCandidateService(availability);

    await expect(service.search(organizationId, {
      search: '  KI-001  ',
      limit: 20,
    })).resolves.toEqual({
      items: [{
        masterProductId,
        code: 'KI-001',
        name: '식판',
        optionName: '분홍',
        barcode: '8800000000001',
        currentStock: 8,
      }],
    });
    expect(availability.searchCandidates).toHaveBeenCalledWith({
      organizationId,
      query: 'KI-001',
      limit: 20,
      stockStatus: 'in_stock',
    });
  });

  it('rejects unbounded or tenant-bearing candidate queries before Products reads', async () => {
    const availability = makeAvailability([]);
    const service = new ChannelOptionRecipeCandidateService(availability);

    await expect(service.search(organizationId, { search: 'x', limit: 100 }))
      .rejects.toBeInstanceOf(BadRequestException);
    await expect(service.search(organizationId, { search: 'KI', organizationId }))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(availability.searchCandidates).not.toHaveBeenCalled();
  });
});

function makeAvailability(
  rows: Awaited<ReturnType<ProductAvailabilityPort['searchCandidates']>>,
) {
  return {
    findByMasterProductIds: vi
      .fn<ProductAvailabilityPort['findByMasterProductIds']>()
      .mockResolvedValue({
        snapshot: { collected: false, generation: null, verifiedAt: null },
        items: [],
      }),
    searchCandidates: vi
      .fn<ProductAvailabilityPort['searchCandidates']>()
      .mockResolvedValue(rows),
  };
}
