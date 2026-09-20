import { describe, expect, it, vi } from 'vitest';
import { InventoryAvailabilityService } from '../inventory-availability.service';

const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';
const SKU_A = '44444444-4444-4444-8444-444444444444';
const SKU_B = '55555555-5555-4555-8555-555555555555';

function repository() {
  return {
    findAvailability: vi.fn().mockResolvedValue({
      snapshot: {
        collected: true,
        generation: '12',
        verifiedAt: '2026-07-18T00:00:00.000Z',
      },
      items: [],
    }),
  };
}

describe('InventoryAvailabilityService', () => {
  it('deduplicates and UUID-sorts SKU ids before repository delegation', async () => {
    const repo = repository();
    const service = new InventoryAvailabilityService(repo as never);

    await service.findBySkuIds({
      organizationId: ORGANIZATION_ID,
      sellpiaInventorySkuIds: [SKU_B, SKU_A, SKU_B],
    });

    expect(repo.findAvailability).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      sellpiaInventorySkuIds: [SKU_A, SKU_B],
    });
  });

  it('delegates an empty SKU list so callers retain snapshot collection state', async () => {
    const repo = repository();
    const service = new InventoryAvailabilityService(repo as never);

    await service.findBySkuIds({
      organizationId: ORGANIZATION_ID,
      sellpiaInventorySkuIds: [],
    });

    expect(repo.findAvailability).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      sellpiaInventorySkuIds: [],
    });
  });

  it('rejects malformed organization and SKU ids before repository delegation', async () => {
    const repo = repository();
    const service = new InventoryAvailabilityService(repo as never);

    expect(() => service.findBySkuIds({
      organizationId: 'not-a-uuid',
      sellpiaInventorySkuIds: [],
    })).toThrow(/organizationId/i);
    expect(() => service.findBySkuIds({
      organizationId: ORGANIZATION_ID,
      sellpiaInventorySkuIds: ['not-a-uuid'],
    })).toThrow(/sellpiaInventorySkuIds/i);
    expect(repo.findAvailability).not.toHaveBeenCalled();
  });
});
