import { describe, expect, it } from 'vitest';
import {
  InventoryAvailabilityBatchSchema,
  InventorySkuAvailabilitySchema,
} from '../../inventory-availability';

const SKU_ID = '11111111-1111-4111-8111-111111111111';

describe('physical inventory availability contracts', () => {
  it('exposes only current physical stock', () => {
    const availability = {
      masterProductId: SKU_ID,
      currentStock: 100,
      generation: '12',
    };

    expect(InventorySkuAvailabilitySchema.parse(availability)).toEqual(availability);
    expect(() => InventorySkuAvailabilitySchema.parse({
      ...availability,
      availableStock: 99,
    })).toThrow(/availableStock/i);
  });

  it('keeps snapshot collection state separate from requested SKU availability', () => {
    expect(InventoryAvailabilityBatchSchema.parse({
      snapshot: {
        collected: false,
        generation: null,
        verifiedAt: null,
      },
      items: [{ masterProductId: SKU_ID, currentStock: 0, generation: null }],
    })).toMatchObject({ snapshot: { collected: false } });

    expect(() => InventoryAvailabilityBatchSchema.parse({
      snapshot: {
        collected: false,
        generation: '0',
        verifiedAt: null,
      },
      items: [],
    })).toThrow(/snapshot/i);

    expect(() => InventoryAvailabilityBatchSchema.parse({
      snapshot: {
        collected: true,
        generation: '12',
        verifiedAt: '2026-07-18T00:00:00.000Z',
      },
      items: [],
      organizationId: SKU_ID,
    })).toThrow();
  });
});
