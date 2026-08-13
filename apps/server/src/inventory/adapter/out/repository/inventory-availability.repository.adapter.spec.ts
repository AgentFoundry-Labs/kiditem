import { describe, expect, it, vi } from 'vitest';
import { InventoryAvailabilityRepositoryAdapter } from './inventory-availability.repository.adapter';

const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';
const SKU_ID = '44444444-4444-4444-8444-444444444444';

describe('InventoryAvailabilityRepositoryAdapter', () => {
  it('maps a collected snapshot to physical current stock under the organization lock', async () => {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ lock: '1' }]),
      sellpiaInventorySku: {
        findMany: vi.fn().mockResolvedValue([{
          id: SKU_ID,
          currentStock: 37,
          isActive: true,
        }]),
      },
      sellpiaInventoryState: {
        findUnique: vi.fn().mockResolvedValue({
          verifiedGeneration: 12n,
          lastVerifiedAt: new Date('2026-07-18T00:00:00.000Z'),
        }),
      },
    };
    const prisma = {
      $transaction: vi.fn(async (operation: (client: typeof tx) => unknown) =>
        operation(tx)),
    };
    const repository = new InventoryAvailabilityRepositoryAdapter(prisma as never);

    await expect(repository.findAvailability({
      organizationId: ORGANIZATION_ID,
      sellpiaInventorySkuIds: [SKU_ID],
    })).resolves.toEqual({
      snapshot: {
        collected: true,
        generation: '12',
        verifiedAt: '2026-07-18T00:00:00.000Z',
      },
      items: [{
        sellpiaInventorySkuId: SKU_ID,
        currentStock: 37,
        availableStock: 37,
        isActive: true,
        generation: '12',
      }],
    });
    expect(tx.$queryRaw).toHaveBeenCalledOnce();
    expect(tx.sellpiaInventorySku.findMany).toHaveBeenCalledWith({
      where: { organizationId: ORGANIZATION_ID, id: { in: [SKU_ID] } },
      orderBy: { id: 'asc' },
      select: { id: true, currentStock: true, isActive: true },
    });
  });

  it('returns an uncollected empty batch without exposing physical rows', async () => {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ lock: '1' }]),
      sellpiaInventorySku: {
        findMany: vi.fn().mockResolvedValue([{
          id: SKU_ID,
          currentStock: 37,
          isActive: true,
        }]),
      },
      sellpiaInventoryState: {
        findUnique: vi.fn().mockResolvedValue({
          verifiedGeneration: 0n,
          lastVerifiedAt: null,
        }),
      },
    };
    const repository = new InventoryAvailabilityRepositoryAdapter({
      $transaction: vi.fn(async (operation: (client: typeof tx) => unknown) =>
        operation(tx)),
    } as never);

    await expect(repository.findAvailability({
      organizationId: ORGANIZATION_ID,
      sellpiaInventorySkuIds: [SKU_ID],
    })).resolves.toEqual({
      snapshot: { collected: false, generation: null, verifiedAt: null },
      items: [],
    });
  });
});
