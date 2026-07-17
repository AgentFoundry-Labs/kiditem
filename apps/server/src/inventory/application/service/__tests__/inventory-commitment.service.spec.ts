import { describe, expect, it, vi } from 'vitest';
import { InventoryCommitmentService } from '../inventory-commitment.service';

const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const SOURCE_ID = '33333333-3333-4333-8333-333333333333';
const SKU_A = '44444444-4444-4444-8444-444444444444';
const SKU_B = '55555555-5555-4555-8555-555555555555';

function repository() {
  return {
    findAvailability: vi.fn().mockResolvedValue({
      snapshot: { collected: true, generation: '12', verifiedAt: '2026-07-18T00:00:00.000Z' },
      items: [],
    }),
    createRocketRequest: vi.fn().mockResolvedValue({ commitmentId: SOURCE_ID }),
    replaceRocketRequestWithFinalOrder: vi.fn(),
    releaseBySourceIds: vi.fn().mockResolvedValue(undefined),
    settleFinalOrders: vi.fn().mockResolvedValue(undefined),
  };
}

describe('InventoryCommitmentService', () => {
  it('deduplicates and UUID-sorts availability requests while preserving empty snapshot reads', async () => {
    const repo = repository();
    const service = new InventoryCommitmentService(repo as never);

    await service.findBySkuIds({
      organizationId: ORGANIZATION_ID,
      sellpiaInventorySkuIds: [SKU_B, SKU_A, SKU_B],
    });
    await service.findBySkuIds({
      organizationId: ORGANIZATION_ID,
      sellpiaInventorySkuIds: [],
    });

    expect(repo.findAvailability).toHaveBeenNthCalledWith(1, {
      organizationId: ORGANIZATION_ID,
      sellpiaInventorySkuIds: [SKU_A, SKU_B],
    });
    expect(repo.findAvailability).toHaveBeenNthCalledWith(2, {
      organizationId: ORGANIZATION_ID,
      sellpiaInventorySkuIds: [],
    });
  });

  it('canonicalizes Rocket identity without accepting a client business key', async () => {
    const repo = repository();
    const service = new InventoryCommitmentService(repo as never);

    await service.createRocketRequest({
      transaction: { kind: 'test' },
      organizationId: ORGANIZATION_ID,
      userId: USER_ID,
      sourceLineId: SOURCE_ID,
      channelAccountId: SKU_A,
      poNumber: ' 1001 ',
      productNo: ' P-1 ',
      unitQuantity: 2,
      inventoryGeneration: '12',
      allocations: [{
        sellpiaInventorySkuId: SKU_B,
        unitsPerItem: 3,
        quantity: 6,
      }],
    });

    expect(repo.createRocketRequest).toHaveBeenCalledWith(expect.objectContaining({
      businessKey: `coupang-rocket:${SKU_A}:1001:P-1`,
      poNumber: '1001',
      productNo: 'P-1',
    }));
  });

  it('rejects malformed quantities and blank business identity before persistence', async () => {
    const repo = repository();
    const service = new InventoryCommitmentService(repo as never);
    const base = {
      transaction: {},
      organizationId: ORGANIZATION_ID,
      userId: USER_ID,
      sourceLineId: SOURCE_ID,
      channelAccountId: SKU_A,
      poNumber: '1001',
      productNo: 'P-1',
      unitQuantity: 2,
      inventoryGeneration: '12',
      allocations: [{
        sellpiaInventorySkuId: SKU_B,
        unitsPerItem: 3,
        quantity: 6,
      }],
    };

    await expect(service.createRocketRequest({ ...base, poNumber: ' ' }))
      .rejects.toThrow(/poNumber/i);
    await expect(service.createRocketRequest({ ...base, unitQuantity: -1 }))
      .rejects.toThrow(/unitQuantity/i);
    await expect(service.createRocketRequest({
      ...base,
      allocations: [{ ...base.allocations[0]!, quantity: 5 }],
    })).rejects.toThrow(/quantity/i);
    expect(repo.createRocketRequest).not.toHaveBeenCalled();
  });

  it('normalizes release source IDs and requires an audit reason', async () => {
    const repo = repository();
    const service = new InventoryCommitmentService(repo as never);

    await service.releaseBySourceIds({
      transaction: {},
      organizationId: ORGANIZATION_ID,
      userId: USER_ID,
      kind: 'rocket_request',
      sourceIds: [SKU_B, SKU_A, SKU_B],
      reason: '  쿠팡 요청 취소  ',
    });

    expect(repo.releaseBySourceIds).toHaveBeenCalledWith(expect.objectContaining({
      sourceIds: [SKU_A, SKU_B],
      reason: '쿠팡 요청 취소',
    }));
    await expect(service.releaseBySourceIds({
      transaction: {},
      organizationId: ORGANIZATION_ID,
      userId: USER_ID,
      kind: 'rocket_request',
      sourceIds: [SKU_A],
      reason: ' ',
    })).rejects.toThrow(/reason/i);
  });
});
