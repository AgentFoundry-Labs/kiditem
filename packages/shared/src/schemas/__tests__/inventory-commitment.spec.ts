import { describe, expect, it } from 'vitest';
import {
  InventoryAvailabilityBatchSchema,
  InventoryCommitmentKindSchema,
  InventoryCommitmentStatusSchema,
  InventorySkuAvailabilitySchema,
} from '../inventory-commitment';

const SKU_ID = '11111111-1111-4111-8111-111111111111';

describe('inventory commitment contracts', () => {
  it('accepts only the shared commitment kinds and lifecycle statuses', () => {
    expect(InventoryCommitmentKindSchema.options).toEqual([
      'rocket_request',
      'rocket_final_order',
    ]);
    expect(InventoryCommitmentStatusSchema.options).toEqual([
      'active',
      'released',
      'settled',
    ]);
  });

  it('rejects availability that does not equal physical stock minus active commitments', () => {
    const availability = {
      sellpiaInventorySkuId: SKU_ID,
      currentStock: 100,
      activeCommitmentQuantity: 20,
      availableStock: 80,
      isActive: true,
      generation: '12',
    };

    expect(InventorySkuAvailabilitySchema.parse(availability)).toEqual(availability);
    expect(() => InventorySkuAvailabilitySchema.parse({
      ...availability,
      availableStock: 60,
    })).toThrow(/availableStock/i);
  });

  it('keeps snapshot collection state separate from requested SKU availability', () => {
    expect(InventoryAvailabilityBatchSchema.parse({
      snapshot: {
        collected: false,
        generation: null,
        verifiedAt: null,
      },
      items: [],
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
