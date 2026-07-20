import { ConflictException, NotFoundException } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  makeTestPrisma,
  OTHER_ORGANIZATION_ID,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
  TEST_USER_ID,
} from '../../test-helpers/real-prisma';
import type { PrismaService } from '../../prisma/prisma.service';
import { InventoryCommitmentRepositoryAdapter } from '../adapter/out/repository/inventory-commitment.repository.adapter';
import { SellpiaInventoryFreshnessRepositoryAdapter } from '../adapter/out/repository/sellpia-inventory-freshness.repository.adapter';
import { InventoryCommitmentService } from '../application/service/inventory-commitment.service';
import { SellpiaInventoryFreshnessService } from '../application/service/sellpia-inventory-freshness.service';

const SKU_ID = '10000000-0000-4000-8000-000000000101';
const FOREIGN_SKU_ID = '10000000-0000-4000-8000-000000000102';
const CHANNEL_ACCOUNT_ID = '00000000-0000-4000-8000-000000000003';
const SOURCE_LINE_ID = '10000000-0000-4000-8000-000000000103';
const OTHER_SOURCE_LINE_ID = '10000000-0000-4000-8000-000000000104';
const FINAL_LINE_ID = '10000000-0000-4000-8000-000000000105';

describe('inventory commitment repository (PG integration)', () => {
  let prisma: PrismaClient;
  let service: InventoryCommitmentService;
  let freshnessService: SellpiaInventoryFreshnessService;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    service = new InventoryCommitmentService(
      new InventoryCommitmentRepositoryAdapter(
        prisma as unknown as PrismaService,
      ),
    );
    freshnessService = new SellpiaInventoryFreshnessService(
      new SellpiaInventoryFreshnessRepositoryAdapter(
        prisma as unknown as PrismaService,
      ),
    );
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
    await seedInventory(prisma);
  });

  it('returns snapshot metadata for empty reads and physical/committed/available stock together', async () => {
    await expect(service.findBySkuIds({
      organizationId: TEST_ORGANIZATION_ID,
      sellpiaInventorySkuIds: [],
    })).resolves.toEqual({
      snapshot: {
        collected: true,
        generation: '12',
        verifiedAt: '2026-07-18T00:00:00.000Z',
      },
      items: [],
    });

    await createRequest({ unitQuantity: 80 });
    await expect(service.findBySkuIds({
      organizationId: TEST_ORGANIZATION_ID,
      sellpiaInventorySkuIds: [SKU_ID],
    })).resolves.toMatchObject({
      items: [{
        sellpiaInventorySkuId: SKU_ID,
        currentStock: 100,
        activeCommitmentQuantity: 80,
        availableStock: 20,
        isActive: true,
        generation: '12',
      }],
    });
    await prisma.sellpiaInventoryState.update({
      where: { organizationId: TEST_ORGANIZATION_ID },
      data: { lastVerifiedAt: new Date() },
    });
    await expect(freshnessService.readFreshCapacity({
      organizationId: TEST_ORGANIZATION_ID,
      sellpiaInventorySkuIds: [SKU_ID],
    })).resolves.toMatchObject({
      generation: '12',
      inventorySkus: [{
        sellpiaInventorySkuId: SKU_ID,
        currentStock: 100,
        activeCommitmentQuantity: 80,
        availableStock: 20,
      }],
    });

    await expect(service.findBySkuIds({
      organizationId: TEST_ORGANIZATION_ID,
      sellpiaInventorySkuIds: [FOREIGN_SKU_ID],
    })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('is idempotent by source and rejects another active source with the same business key', async () => {
    const first = await createRequest({ unitQuantity: 40 });
    const repeated = await createRequest({ unitQuantity: 40 });
    expect(repeated).toEqual(first);
    expect(await prisma.inventoryCommitment.count({
      where: { organizationId: TEST_ORGANIZATION_ID },
    })).toBe(1);

    await expect(createRequest({
      sourceLineId: OTHER_SOURCE_LINE_ID,
      unitQuantity: 40,
    })).rejects.toBeInstanceOf(ConflictException);
  });

  it('replaces a request with one final-order commitment and credits the predecessor once', async () => {
    const request = await createRequest({ unitQuantity: 80 });
    await expect(replaceWithFinalOrder({ unitQuantity: 90 })).resolves.toMatchObject({
      predecessorCommitmentId: request.commitmentId,
    });

    expect(await prisma.inventoryCommitment.findMany({
      where: { organizationId: TEST_ORGANIZATION_ID },
      orderBy: { createdAt: 'asc' },
      select: { kind: true, status: true, unitQuantity: true },
    })).toEqual([
      { kind: 'rocket_request', status: 'released', unitQuantity: 80 },
      { kind: 'rocket_final_order', status: 'active', unitQuantity: 90 },
    ]);
    await expect(service.findBySkuIds({
      organizationId: TEST_ORGANIZATION_ID,
      sellpiaInventorySkuIds: [SKU_ID],
    })).resolves.toMatchObject({
      items: [{ activeCommitmentQuantity: 90, availableStock: 10 }],
    });
  });

  it('rolls back a PA increase that exceeds stock and keeps the request active', async () => {
    await createRequest({ unitQuantity: 80 });

    await expect(replaceWithFinalOrder({ unitQuantity: 101 }))
      .rejects.toBeInstanceOf(ConflictException);
    expect(await prisma.inventoryCommitment.findMany({
      where: { organizationId: TEST_ORGANIZATION_ID },
      select: { kind: true, status: true },
    })).toEqual([{ kind: 'rocket_request', status: 'active' }]);
  });

  it('serializes concurrent confirmations so only one can consume the remaining stock', async () => {
    const results = await Promise.allSettled([
      createRequest({
        sourceLineId: SOURCE_LINE_ID,
        poNumber: 'PO-1',
        unitQuantity: 60,
      }),
      createRequest({
        sourceLineId: OTHER_SOURCE_LINE_ID,
        poNumber: 'PO-2',
        unitQuantity: 60,
      }),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect(await prisma.inventoryCommitment.count({
      where: { organizationId: TEST_ORGANIZATION_ID, status: 'active' },
    })).toBe(1);
  });

  it('settles a final order only after a newer verified inventory generation', async () => {
    await createRequest({ unitQuantity: 50 });
    const final = await replaceWithFinalOrder({ unitQuantity: 50 });

    await expect(service.settleFinalOrders({
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_USER_ID,
      commitmentIds: [final.commitmentId],
      reason: '셀피아 반영 확인',
    })).rejects.toBeInstanceOf(ConflictException);

    await prisma.sellpiaInventoryState.update({
      where: { organizationId: TEST_ORGANIZATION_ID },
      data: { verifiedGeneration: 13n },
    });
    await service.settleFinalOrders({
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_USER_ID,
      commitmentIds: [final.commitmentId],
      reason: '셀피아 반영 확인',
    });
    expect(await prisma.inventoryCommitment.findUniqueOrThrow({
      where: { id: final.commitmentId },
      select: { status: true, settlementReason: true },
    })).toEqual({ status: 'settled', settlementReason: '셀피아 반영 확인' });
  });

  function createRequest(overrides: {
    sourceLineId?: string;
    poNumber?: string;
    unitQuantity: number;
  }) {
    return prisma.$transaction((transaction) => service.createRocketRequest({
      transaction,
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_USER_ID,
      sourceLineId: overrides.sourceLineId ?? SOURCE_LINE_ID,
      channelAccountId: CHANNEL_ACCOUNT_ID,
      poNumber: overrides.poNumber ?? 'PO-1',
      productNo: 'PRODUCT-1',
      unitQuantity: overrides.unitQuantity,
      inventoryGeneration: '12',
      allocations: [{
        sellpiaInventorySkuId: SKU_ID,
        unitsPerItem: 1,
        quantity: overrides.unitQuantity,
      }],
    }));
  }

  function replaceWithFinalOrder(overrides: { unitQuantity: number }) {
    return prisma.$transaction((transaction) =>
      service.replaceRocketRequestWithFinalOrder({
        transaction,
        organizationId: TEST_ORGANIZATION_ID,
        userId: TEST_USER_ID,
        finalOrderLineId: FINAL_LINE_ID,
        channelAccountId: CHANNEL_ACCOUNT_ID,
        poNumber: 'PO-1',
        productNo: 'PRODUCT-1',
        unitQuantity: overrides.unitQuantity,
        barcode: '880000000001',
      }));
  }
});

async function seedInventory(prisma: PrismaClient): Promise<void> {
  await prisma.sellpiaInventoryState.create({
    data: {
      organizationId: TEST_ORGANIZATION_ID,
      sourceAccountKey: 'kiditem',
      lastVerifiedAt: new Date('2026-07-18T00:00:00.000Z'),
      requestedGeneration: 12n,
      verifiedGeneration: 12n,
      refreshReason: 'legacy_manual_import',
    },
  });
  await prisma.sellpiaInventorySku.createMany({
    data: [
      {
        id: SKU_ID,
        organizationId: TEST_ORGANIZATION_ID,
        code: 'SP-1',
        name: '상품 1',
        currentStock: 100,
        isActive: true,
      },
      {
        id: FOREIGN_SKU_ID,
        organizationId: OTHER_ORGANIZATION_ID,
        code: 'SP-FOREIGN',
        name: '다른 조직 상품',
        currentStock: 100,
        isActive: true,
      },
    ],
  });
}
