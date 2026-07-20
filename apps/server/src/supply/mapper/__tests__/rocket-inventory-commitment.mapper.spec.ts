import { describe, expect, it } from 'vitest';
import { mapRocketRequestCommitment } from '../rocket-inventory-commitment.mapper';

describe('mapRocketRequestCommitment', () => {
  it('maps a persisted Supply confirmation line to the Inventory owner contract', () => {
    const transaction = {};

    expect(mapRocketRequestCommitment({
      transaction,
      organizationId: '11111111-1111-4111-8111-111111111111',
      userId: '22222222-2222-4222-8222-222222222222',
      channelAccountId: '33333333-3333-4333-8333-333333333333',
      inventoryGeneration: '12',
      line: {
        id: '44444444-4444-4444-8444-444444444444',
        poNumber: ' PO-1001 ',
        productNo: ' P-1 ',
        confirmedQuantity: 2,
        allocations: [{
          sellpiaInventorySkuId: '55555555-5555-4555-8555-555555555555',
          unitsPerVariant: 3,
          quantity: 6,
        }],
      },
    })).toEqual({
      transaction,
      organizationId: '11111111-1111-4111-8111-111111111111',
      userId: '22222222-2222-4222-8222-222222222222',
      sourceLineId: '44444444-4444-4444-8444-444444444444',
      channelAccountId: '33333333-3333-4333-8333-333333333333',
      poNumber: 'PO-1001',
      productNo: 'P-1',
      unitQuantity: 2,
      inventoryGeneration: '12',
      allocations: [{
        sellpiaInventorySkuId: '55555555-5555-4555-8555-555555555555',
        unitsPerItem: 3,
        quantity: 6,
      }],
    });
  });
});
