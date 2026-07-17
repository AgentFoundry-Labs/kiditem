import { AppException } from '@kiditem/shared/server-errors';
import { ConflictException, NotFoundException } from '@nestjs/common';
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
import { SellpiaInventoryFreshnessRepositoryAdapter } from '../adapter/out/repository/sellpia-inventory-freshness.repository.adapter';
import { SellpiaInventoryFreshnessService } from '../application/service/sellpia-inventory-freshness.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { PrismaClient } from '@prisma/client';

const SELLPIA_INVENTORY_SKU_ID = '10000000-0000-4000-8000-000000000001';
const INTENT_KEY = '1721000000000-kidkids-browser';
const ADMIN_USER_ID = '10000000-0000-4000-8000-000000000002';

describe('Sellpia inventory freshness repository (PG integration)', () => {
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

    const [state, failedRuns] = await Promise.all([
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
  });

  it('persists one org-scoped intent and finalizes it idempotently after a newer sync', async () => {
    await prisma.sellpiaInventoryState.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        sourceAccountKey: 'kiditem',
        lastVerifiedAt: new Date(),
        requestedGeneration: 3n,
        verifiedGeneration: 3n,
        refreshReason: 'legacy_manual_import',
      },
    });

    const first = await service.prepareOrderTransmissionIntent({
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_USER_ID,
      intentKey: INTENT_KEY,
    });
    const repeated = await service.prepareOrderTransmissionIntent({
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_USER_ID,
      intentKey: INTENT_KEY,
    });
    expect(first.disposition).toBe('prepared');
    expect(repeated.disposition).toBe('already_prepared');
    expect(await prisma.sellpiaOrderTransmissionIntent.count({
      where: { organizationId: TEST_ORGANIZATION_ID, status: 'prepared' },
    })).toBe(1);

    await prisma.sellpiaInventoryState.update({
      where: { organizationId: TEST_ORGANIZATION_ID },
      data: { requestedGeneration: 4n, verifiedGeneration: 4n },
    });
    const finalized = await service.finalizeOrderTransmissionIntent({
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_USER_ID,
      intentKey: INTENT_KEY,
    });
    const finalizeRetry = await service.finalizeOrderTransmissionIntent({
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_USER_ID,
      intentKey: INTENT_KEY,
    });

    expect(finalized.finalizedGeneration).toBe('5');
    expect(finalizeRetry.finalizedGeneration).toBe('5');
    expect(await prisma.sellpiaInventoryState.findUniqueOrThrow({
      where: { organizationId: TEST_ORGANIZATION_ID },
    })).toMatchObject({ requestedGeneration: 5n, verifiedGeneration: 4n });
    expect(await prisma.sellpiaOrderTransmissionIntent.findFirstOrThrow({
      where: { organizationId: TEST_ORGANIZATION_ID, intentKey: INTENT_KEY },
    })).toMatchObject({ status: 'finalized', finalizedGeneration: 5n });
  });

  it('keeps a crashed intent stale, unclaimable, and isolated from another organization', async () => {
    await prisma.sellpiaInventoryState.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        sourceAccountKey: 'kiditem',
        lastVerifiedAt: new Date(),
        requestedGeneration: 2n,
        verifiedGeneration: 2n,
        refreshReason: 'legacy_manual_import',
      },
    });
    await service.prepareOrderTransmissionIntent({
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_USER_ID,
      intentKey: INTENT_KEY,
    });

    await expect(service.getState({
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_USER_ID,
    })).resolves.toMatchObject({ status: 'refresh_required' });
    await expect(service.claimDue({
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_USER_ID,
    })).resolves.toMatchObject({ claimed: false });
    await expect(service.finalizeOrderTransmissionIntent({
      organizationId: OTHER_ORGANIZATION_ID,
      userId: OTHER_USER_ID,
      intentKey: INTENT_KEY,
    })).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.prepareOrderTransmissionIntent({
      organizationId: OTHER_ORGANIZATION_ID,
      userId: OTHER_USER_ID,
      intentKey: INTENT_KEY,
    })).resolves.toMatchObject({ disposition: 'prepared' });
    expect(await prisma.sellpiaOrderTransmissionIntent.count({
      where: { intentKey: INTENT_KEY },
    })).toBe(2);
  });

  it('fences normal intent idempotency and resolution to its creator', async () => {
    await seedSameOrganizationAdmin(prisma);
    await service.prepareOrderTransmissionIntent({
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_USER_ID,
      intentKey: INTENT_KEY,
    });

    await expect(service.prepareOrderTransmissionIntent({
      organizationId: TEST_ORGANIZATION_ID,
      userId: ADMIN_USER_ID,
      intentKey: INTENT_KEY,
    })).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.abortOrderTransmissionIntent({
      organizationId: TEST_ORGANIZATION_ID,
      userId: ADMIN_USER_ID,
      intentKey: INTENT_KEY,
    })).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.finalizeOrderTransmissionIntent({
      organizationId: TEST_ORGANIZATION_ID,
      userId: ADMIN_USER_ID,
      intentKey: INTENT_KEY,
    })).rejects.toBeInstanceOf(NotFoundException);

    await service.finalizeOrderTransmissionIntent({
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_USER_ID,
      intentKey: INTENT_KEY,
    });
    await expect(service.finalizeOrderTransmissionIntent({
      organizationId: TEST_ORGANIZATION_ID,
      userId: ADMIN_USER_ID,
      intentKey: INTENT_KEY,
    })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('audits idempotent owner/admin reconciliation for both terminal outcomes', async () => {
    await seedSameOrganizationAdmin(prisma);
    await prisma.sellpiaInventoryState.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        sourceAccountKey: 'kiditem',
        lastVerifiedAt: new Date(),
        requestedGeneration: 4n,
        verifiedGeneration: 4n,
        refreshReason: 'legacy_manual_import',
      },
    });
    await service.prepareOrderTransmissionIntent({
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_USER_ID,
      intentKey: `${INTENT_KEY}-submitted`,
    });
    const submittedInput = {
      organizationId: TEST_ORGANIZATION_ID,
      userId: ADMIN_USER_ID,
      intentKey: `${INTENT_KEY}-submitted`,
      outcome: 'submitted' as const,
      note: 'Sellpia 주문 내역에서 접수 확인',
    };
    const submitted = await service.reconcileOrderTransmissionIntent(submittedInput);
    const submittedRetry = await service.reconcileOrderTransmissionIntent(submittedInput);

    await service.prepareOrderTransmissionIntent({
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_USER_ID,
      intentKey: `${INTENT_KEY}-not-submitted`,
    });
    const notSubmitted = await service.reconcileOrderTransmissionIntent({
      organizationId: TEST_ORGANIZATION_ID,
      userId: ADMIN_USER_ID,
      intentKey: `${INTENT_KEY}-not-submitted`,
      outcome: 'not_submitted',
      note: 'Sellpia 주문 내역에서 미접수 확인',
    });

    expect(submitted).toMatchObject({
      status: 'finalized',
      outcome: 'submitted',
      finalizedGeneration: '5',
      reconciledBy: ADMIN_USER_ID,
    });
    expect(submittedRetry).toEqual(submitted);
    expect(notSubmitted).toMatchObject({
      status: 'aborted',
      outcome: 'not_submitted',
      finalizedGeneration: null,
      reconciledBy: ADMIN_USER_ID,
    });
    expect(await prisma.sellpiaInventoryState.findUniqueOrThrow({
      where: { organizationId: TEST_ORGANIZATION_ID },
    })).toMatchObject({ requestedGeneration: 5n, verifiedGeneration: 4n });
    expect(await prisma.sellpiaOrderTransmissionIntentReconciliation.findMany({
      where: { organizationId: TEST_ORGANIZATION_ID },
      orderBy: { reconciledAt: 'asc' },
    })).toMatchObject([
      {
        reconciledBy: ADMIN_USER_ID,
        note: submittedInput.note,
        outcome: 'submitted',
      },
      {
        reconciledBy: ADMIN_USER_ID,
        note: 'Sellpia 주문 내역에서 미접수 확인',
        outcome: 'not_submitted',
      },
    ]);
    await expect(service.reconcileOrderTransmissionIntent({
      ...submittedInput,
      outcome: 'not_submitted',
    })).rejects.toBeInstanceOf(ConflictException);
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

async function seedSameOrganizationAdmin(prisma: PrismaClient): Promise<void> {
  await prisma.user.create({
    data: {
      id: ADMIN_USER_ID,
      email: 'inventory-admin@test.local',
      name: 'Inventory Admin',
      role: 'admin',
      type: 'human',
    },
  });
  await prisma.organizationMembership.create({
    data: {
      organizationId: TEST_ORGANIZATION_ID,
      userId: ADMIN_USER_ID,
      role: 'admin',
      status: 'active',
    },
  });
}
