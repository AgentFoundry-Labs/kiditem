import { describe, expect, it, vi } from 'vitest';
import type { InventoryCommitmentRead } from '@kiditem/shared/inventory-commitment';
import { RocketPurchaseCommitmentQueryService } from '../rocket-purchase-commitment-query.service';

const ORGANIZATION_ID = '11000000-0000-4000-8000-000000000001';
const USER_ID = '11000000-0000-4000-8000-000000000002';
const CONFIRMATION_ID = '11000000-0000-4000-8000-000000000003';
const LINE_ID = '11000000-0000-4000-8000-000000000004';
const REQUEST_ID = '11000000-0000-4000-8000-000000000005';
const FINAL_ID = '11000000-0000-4000-8000-000000000006';
const ORDER_LINE_ID = '11000000-0000-4000-8000-000000000007';
const ACCOUNT_ID = '11000000-0000-4000-8000-000000000008';
const SKU_ID = '11000000-0000-4000-8000-000000000009';

describe('RocketPurchaseCommitmentQueryService', () => {
  it('loads confirmation lines first and all commitment lineages with one Inventory call', async () => {
    const confirmations = {
      listLines: vi.fn().mockResolvedValue({
        items: [{
          confirmationId: CONFIRMATION_ID,
          confirmationLineId: LINE_ID,
          channelAccountId: ACCOUNT_ID,
          poNumber: 'PO-1',
          productNo: 'P-1',
          barcode: '8801234567890',
          productName: 'Rocket item',
          orderQuantity: 5,
          confirmedQuantity: 4,
          confirmedBy: { id: USER_ID, name: 'Operator' },
          confirmedAt: '2026-07-18T00:00:00.000Z',
        }],
        nextCursor: null,
      }),
    };
    const inventory = {
      findBySourceIds: vi.fn().mockResolvedValue([
        commitment({ id: REQUEST_ID, sourceId: LINE_ID, status: 'released' }),
        commitment({
          id: FINAL_ID,
          sourceId: ORDER_LINE_ID,
          kind: 'rocket_final_order',
          predecessorCommitmentId: REQUEST_ID,
          canRelease: true,
        }),
      ]),
      settleFinalOrders: vi.fn(),
      releaseFinalOrders: vi.fn(),
    };
    const service = new RocketPurchaseCommitmentQueryService(
      confirmations as never,
      inventory as never,
    );

    const result = await service.list({
      organizationId: ORGANIZATION_ID,
      request: { limit: 50 },
    });

    expect(inventory.findBySourceIds).toHaveBeenCalledOnce();
    expect(inventory.findBySourceIds).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      sourceIds: [LINE_ID],
    });
    expect(result.items[0]).toMatchObject({
      requestCommitment: { id: REQUEST_ID, status: 'released' },
      finalOrderCommitment: { id: FINAL_ID, status: 'active' },
      orderLineItemId: ORDER_LINE_ID,
      canRelease: true,
      canSettle: false,
    });
  });

  it('delegates final-order settlement and release to Inventory', async () => {
    const inventory = {
      settleFinalOrders: vi.fn().mockResolvedValue(undefined),
      releaseFinalOrders: vi.fn().mockResolvedValue(undefined),
    };
    const service = new RocketPurchaseCommitmentQueryService(
      { listLines: vi.fn() } as never,
      inventory as never,
    );
    const request = { commitmentIds: [FINAL_ID], reason: 'operator review' };

    await expect(service.settleFinalOrders({
      organizationId: ORGANIZATION_ID,
      userId: USER_ID,
      request,
    })).resolves.toEqual({ affectedCommitmentIds: [FINAL_ID] });
    await expect(service.releaseFinalOrders({
      organizationId: ORGANIZATION_ID,
      userId: USER_ID,
      request,
    })).resolves.toEqual({ affectedCommitmentIds: [FINAL_ID] });
    expect(inventory.settleFinalOrders).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      userId: USER_ID,
      ...request,
    });
    expect(inventory.releaseFinalOrders).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      userId: USER_ID,
      ...request,
    });
  });
});

function commitment(input: Partial<InventoryCommitmentRead> & {
  id: string;
  sourceId: string;
}): InventoryCommitmentRead {
  return {
    id: input.id,
    sourceId: input.sourceId,
    predecessorCommitmentId: input.predecessorCommitmentId ?? null,
    kind: input.kind ?? 'rocket_request',
    status: input.status ?? 'active',
    unitQuantity: 4,
    inventoryGeneration: '1',
    createdBy: { id: USER_ID, name: 'Operator' },
    createdAt: '2026-07-18T00:00:00.000Z',
    releasedBy: null,
    releasedAt: null,
    releaseReason: null,
    settledBy: null,
    settledAt: null,
    settlementReason: null,
    canRelease: input.canRelease ?? false,
    canSettle: input.canSettle ?? false,
    allocations: [{
      sellpiaInventorySkuId: SKU_ID,
      code: 'SP-1',
      name: 'Sellpia item',
      optionName: null,
      unitsPerItem: 1,
      quantity: 4,
      currentStock: 10,
      activeCommitmentQuantity: 4,
      availableStock: 6,
      isActive: true,
    }],
  };
}
