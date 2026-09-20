import { InventoryCollectionRequiredError } from '../application/exception/inventory-operation.error';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  makeTestPrisma,
  OTHER_ORGANIZATION_ID,
  OTHER_USER_ID,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
  TEST_USER_ID,
} from '../../test-helpers/real-prisma';
import { SellpiaInventoryFreshnessRepositoryAdapter } from '../adapter/out/persistence/sellpia-inventory-freshness.repository.adapter';
import { SellpiaInventoryFreshnessService } from '../application/usecase/sellpia-inventory-freshness.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { PrismaClient } from '@prisma/client';

const SELLPIA_INVENTORY_SKU_ID = '10000000-0000-4000-8000-000000000001';

describe('Sellpia inventory collection status repository (PG integration)', () => {
  let prisma: PrismaClient;
  let service: SellpiaInventoryFreshnessService;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    service = new SellpiaInventoryFreshnessService(
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
  });

  it('reads an existing collection snapshot without waiting for the mutation row lock', async () => {
    await prisma.sellpiaInventoryState.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        sourceAccountKey: 'kiditem',
        lastVerifiedAt: new Date(),
        requestedGeneration: 1n,
        verifiedGeneration: 1n,
        lastCompletedImportRunId: null,
      },
    });

    let signalLocked!: () => void;
    let releaseLock!: () => void;
    const locked = new Promise<void>((resolve) => {
      signalLocked = resolve;
    });
    const release = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });
    const blocker = prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT organization_id
        FROM sellpia_inventory_states
        WHERE organization_id = ${TEST_ORGANIZATION_ID}::uuid
        FOR UPDATE
      `;
      signalLocked();
      await release;
    });
    await locked;

    const getState = service.getState({
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_USER_ID,
    });
    try {
      const result = await Promise.race([
        getState,
        new Promise<'blocked'>((resolve) => {
          setTimeout(() => resolve('blocked'), 1_000);
        }),
      ]);
      expect(result).not.toBe('blocked');
      expect(result).toMatchObject({ status: 'complete' });
    } finally {
      releaseLock();
      await blocker;
      await getState;
    }
  });

  it('keeps collection state and source binding organization-scoped', async () => {
    await prisma.sellpiaInventoryState.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        sourceAccountKey: 'kiditem',
        requestedGeneration: 2n,
        verifiedGeneration: 1n,
      },
    });
    const ownSku = await prisma.sellpiaInventorySku.create({
      data: {
        id: SELLPIA_INVENTORY_SKU_ID,
        organizationId: TEST_ORGANIZATION_ID,
        code: 'SP-ORG-A',
        name: 'Organization A inventory SKU',
        currentStock: 5,
      },
    });
    const viewB = await service.getState({
      organizationId: OTHER_ORGANIZATION_ID,
      userId: OTHER_USER_ID,
    });
    expect(viewB).toMatchObject({
      requestedGeneration: '1',
      verifiedGeneration: '0',
      activeSync: null,
    });

    const boundB = await service.confirmSourceBinding({
      organizationId: OTHER_ORGANIZATION_ID,
      userId: OTHER_USER_ID,
      sourceOrigin: 'https://kiditem.sellpia.com',
      sourceAccountKey: 'kiditem',
      confirmed: true,
    });
    expect(boundB.sourceBinding).toEqual({
      origin: 'https://kiditem.sellpia.com',
      accountKey: 'kiditem',
      confirmed: true,
    });

    const stateA = await service.getState({
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_USER_ID,
    });
    expect(stateA).toMatchObject({
      requestedGeneration: '2',
      verifiedGeneration: '1',
      activeSync: null,
    });
    const stateB = await service.getState({
      organizationId: OTHER_ORGANIZATION_ID,
      userId: OTHER_USER_ID,
    });
    expect(stateB.sourceBinding).toMatchObject({ accountKey: 'kiditem', confirmed: true });
    expect(await prisma.sourceImportRun.count()).toBe(0);
    await expectCode(
      service.requireCollectedStock({
        organizationId: OTHER_ORGANIZATION_ID,
        attemptId: '20000000-0000-4000-8000-000000000001',
        sellpiaInventorySkuIds: [ownSku.id],
      }),
      'SELLPIA_SYNC_REQUIRED',
    );
  });
});

async function expectCode(promise: Promise<unknown>, code: string) {
  try {
    await promise;
    throw new Error('expected InventoryCollectionRequiredError');
  } catch (error) {
    expect(error).toBeInstanceOf(InventoryCollectionRequiredError);
    expect((error as InventoryCollectionRequiredError).code).toBe(code);
  }
}
