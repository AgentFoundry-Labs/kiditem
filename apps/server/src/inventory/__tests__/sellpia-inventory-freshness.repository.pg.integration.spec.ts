import { AppException } from '@kiditem/shared/server-errors';
import { ConflictException } from '@nestjs/common';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AlertsRepository } from '../../alerts/alerts.repository';
import { SourceFailureAlerts } from '../../alerts/alerts.service';
import {
  makeTestPrisma,
  OTHER_ORGANIZATION_ID,
  OTHER_USER_ID,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
  TEST_USER_ID,
} from '../../test-helpers/real-prisma';
import { SellpiaInventoryFreshnessRepositoryAdapter } from '../adapter/out/repository/sellpia-inventory-freshness.repository.adapter';
import { SellpiaInventoryFreshnessService } from '../application/service/sellpia-inventory-freshness.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { PrismaClient } from '@prisma/client';

const SELLPIA_INVENTORY_SKU_ID = '10000000-0000-4000-8000-000000000001';

describe('Sellpia inventory freshness repository (PG integration)', () => {
  let prisma: PrismaClient;
  let service: SellpiaInventoryFreshnessService;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    service = new SellpiaInventoryFreshnessService(
      new SellpiaInventoryFreshnessRepositoryAdapter(
        prisma as unknown as PrismaService,
        new SourceFailureAlerts(new AlertsRepository(prisma as never)),
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

  it('reads an existing freshness snapshot without waiting for the mutation row lock', async () => {
    await prisma.sellpiaInventoryState.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        sourceAccountKey: 'kiditem',
        lastVerifiedAt: new Date(),
        requestedGeneration: 1n,
        verifiedGeneration: 1n,
        refreshReason: 'legacy_manual_import',
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
      expect(result).toMatchObject({ status: 'fresh' });
    } finally {
      releaseLock();
      await blocker;
      await getState;
    }
  });

  it('atomically creates one ttl generation and idempotently records its failure', async () => {
    const now = new Date();
    await prisma.sellpiaInventoryState.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        sourceAccountKey: 'kiditem',
        lastVerifiedAt: new Date(now.getTime() - 11 * 60_000),
        requestedGeneration: 9n,
        verifiedGeneration: 9n,
        refreshReason: 'legacy_manual_import',
      },
    });

    const claims = await Promise.all([
      service.claimDue({
        organizationId: TEST_ORGANIZATION_ID,
        userId: TEST_USER_ID,
      }),
      service.claimDue({
        organizationId: TEST_ORGANIZATION_ID,
        userId: TEST_USER_ID,
      }),
    ]);
    const winner = claims.find((claim) => claim.claimed);
    if (!winner?.claimed) throw new Error('expected an atomic claim winner');

    expect(claims.filter((claim) => claim.claimed)).toHaveLength(1);
    expect(await prisma.sellpiaInventoryState.findUniqueOrThrow({
      where: { organizationId: TEST_ORGANIZATION_ID },
    })).toMatchObject({
      requestedGeneration: 10n,
      activeGeneration: 10n,
      refreshReason: 'ttl_expired',
      activeSyncToken: winner.claimToken,
    });

    const failureInput = {
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_USER_ID,
      claimToken: winner.claimToken,
      errorCode: 'sellpia_network_failed' as const,
      errorMessage: ' sanitized network failure ',
    };
    await service.fail(failureInput);
    await service.fail(failureInput);

    const [state, failedRuns, alert] = await Promise.all([
      prisma.sellpiaInventoryState.findUniqueOrThrow({
        where: { organizationId: TEST_ORGANIZATION_ID },
      }),
      prisma.sourceImportRun.findMany({
        where: {
          organizationId: TEST_ORGANIZATION_ID,
          sourceType: 'sellpia_inventory',
          status: 'failed',
          freshnessGeneration: 10n,
        },
      }),
      prisma.alert.findUniqueOrThrow({
        where: {
          organizationId_dedupeKey: {
            organizationId: TEST_ORGANIZATION_ID,
            dedupeKey: 'source:sellpia-inventory',
          },
        },
      }),
    ]);
    expect(state).toMatchObject({
      activeSyncToken: null,
      activeSyncOwnerUserId: null,
      activeGeneration: null,
      failedGeneration: 10n,
      lastAttemptStatus: 'failed',
      lastErrorCode: 'sellpia_network_failed',
      lastErrorMessage: 'sanitized network failure',
    });
    expect(failedRuns).toHaveLength(1);
    expect(failedRuns[0]).toMatchObject({
      fileName: null,
      fileHash: null,
      rowCount: 0,
      importedAt: null,
      freshnessGeneration: 10n,
      attemptToken: winner.claimToken,
      createdBy: TEST_USER_ID,
      errorMessage: 'sanitized network failure',
    });
    expect(alert).toMatchObject({
      attemptId: failedRuns[0]?.id,
      sourceType: 'sellpia_inventory',
      status: 'OPEN',
      isRead: false,
    });
  });

  it('prevents organization B from viewing, claiming, controlling, binding, or gating organization A state', async () => {
    await prisma.sellpiaInventoryState.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        sourceAccountKey: 'kiditem',
        requestedGeneration: 2n,
        verifiedGeneration: 1n,
        refreshRequestedAt: new Date(),
        refreshReason: 'manual_request',
        syncNotBefore: new Date(),
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
    const claimA = await service.claimDue({
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_USER_ID,
    });
    if (!claimA.claimed) throw new Error('expected organization A claim');

    const viewB = await service.getState({
      organizationId: OTHER_ORGANIZATION_ID,
      userId: OTHER_USER_ID,
    });
    expect(viewB).toMatchObject({
      requestedGeneration: '1',
      verifiedGeneration: '0',
      activeSync: null,
    });
    await expect(service.heartbeat({
      organizationId: OTHER_ORGANIZATION_ID,
      userId: OTHER_USER_ID,
      claimToken: claimA.claimToken,
    })).rejects.toBeInstanceOf(ConflictException);
    await expect(service.fail({
      organizationId: OTHER_ORGANIZATION_ID,
      userId: OTHER_USER_ID,
      claimToken: claimA.claimToken,
      errorCode: 'sellpia_network_failed',
      errorMessage: 'cross organization',
    })).rejects.toBeInstanceOf(ConflictException);
    await expect(service.cancel({
      organizationId: OTHER_ORGANIZATION_ID,
      userId: OTHER_USER_ID,
      claimToken: claimA.claimToken,
    })).rejects.toBeInstanceOf(ConflictException);

    await service.confirmSourceBinding({
      organizationId: OTHER_ORGANIZATION_ID,
      userId: OTHER_USER_ID,
      sourceOrigin: 'https://kiditem.sellpia.com',
      sourceAccountKey: 'kiditem',
      confirmed: true,
    });
    const claimB = await service.claimDue({
      organizationId: OTHER_ORGANIZATION_ID,
      userId: OTHER_USER_ID,
    });
    expect(claimB).toMatchObject({ claimed: true, activeGeneration: '1' });

    const stateAAfterBMutations = await prisma.sellpiaInventoryState.findUniqueOrThrow({
      where: { organizationId: TEST_ORGANIZATION_ID },
    });
    expect(stateAAfterBMutations).toMatchObject({
      activeSyncToken: claimA.claimToken,
      activeSyncOwnerUserId: TEST_USER_ID,
      activeGeneration: 2n,
      requestedGeneration: 2n,
    });
    expect(claimB.claimed && claimB.claimToken).not.toBe(claimA.claimToken);
    expect(await prisma.sourceImportRun.count()).toBe(0);

    await prisma.sellpiaInventoryState.update({
      where: { organizationId: OTHER_ORGANIZATION_ID },
      data: {
        lastVerifiedAt: new Date(),
        refreshRequestedAt: null,
        requestedGeneration: 1n,
        verifiedGeneration: 1n,
        activeSyncToken: null,
        activeSyncOwnerUserId: null,
        activeSyncStartedAt: null,
        activeSyncLeaseExpiresAt: null,
        activeGeneration: null,
      },
    });
    await expectCode(
      service.assertFreshAndActive({
        organizationId: OTHER_ORGANIZATION_ID,
        sellpiaInventorySkuIds: [ownSku.id],
      }),
      'PURCHASE_REFERENCE_INVALID',
    );
  });
});

async function expectCode(promise: Promise<unknown>, code: string) {
  try {
    await promise;
    throw new Error('expected AppException');
  } catch (error) {
    expect(error).toBeInstanceOf(AppException);
    expect((error as AppException).code).toBe(code);
  }
}
