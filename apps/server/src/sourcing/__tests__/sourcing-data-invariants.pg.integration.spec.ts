import { createHash, randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
  TEST_USER_ID,
} from '../../test-helpers/real-prisma';
import type { PrismaService } from '../../prisma/prisma.service';
import { SourcingEvidenceLedgerRepositoryAdapter } from '../adapter/out/repository/sourcing-evidence-ledger.repository.adapter';
import { SourcingCollectionRepositoryAdapter } from '../adapter/out/repository/sourcing-collection.repository.adapter';

describe('Sourcing durable data invariants (PG integration)', () => {
  let prisma: PrismaClient;
  let evidenceRepository: SourcingEvidenceLedgerRepositoryAdapter;
  let collectionRepository: SourcingCollectionRepositoryAdapter;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    evidenceRepository = new SourcingEvidenceLedgerRepositoryAdapter(
      prisma as unknown as PrismaService,
    );
    collectionRepository = new SourcingCollectionRepositoryAdapter(
      prisma as unknown as PrismaService,
    );
  });

  afterAll(async () => prisma?.$disconnect());

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
  });

  it('permits one active collection lane for concurrent claims', async () => {
    const entitlement = await createEntitlement(prisma);
    const attempts = await Promise.allSettled(
      Array.from({ length: 20 }, (_, index) =>
        prisma.sourcingEvidenceIngestionRun.create({
          data: runData(entitlement.id, `claim-${index}`),
        }),
      ),
    );

    expect(
      attempts.filter(({ status }) => status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      await prisma.sourcingEvidenceIngestionRun.count({
        where: {
          organizationId: TEST_ORGANIZATION_ID,
          sourceKey: '1688',
          scopeKey: 'stationery',
          targetKey: 'stationery',
          status: 'collecting',
        },
      }),
    ).toBe(1);
  });

  it('rejects a retry whose immutable source provenance changed', async () => {
    const entitlement = await createEntitlement(prisma);
    const run = await prisma.sourcingEvidenceIngestionRun.create({
      data: {
        ...runData(entitlement.id, 'append-run'),
        status: 'running',
      },
    });
    const command = observationCommand(run.id, entitlement.id);

    await expect(
      evidenceRepository.appendObservations([command]),
    ).resolves.toMatchObject({ kind: 'appended', duplicateCount: 0 });

    await expect(
      evidenceRepository.appendObservations([
        {
          ...command,
          sourceUrl: 'https://detail.1688.com/offer/changed.html',
        },
      ]),
    ).resolves.toEqual({
      kind: 'observation_conflict',
      observationKey: command.observationKey,
      revision: command.revision,
    });
  });

  it('claims one authorized provider lane and discards commit after a kill switch', async () => {
    await createEntitlement(prisma, {
      sourceKey: '1688.hot_product',
      scopeKey: 'default',
    });
    const claims = await Promise.all(
      Array.from({ length: 12 }, (_, index) =>
        collectionRepository.claimAuthorizedRun(collectionClaim(`operation-${index}`)),
      ),
    );
    const permits = claims
      .filter((claim): claim is Extract<typeof claim, { kind: 'claimed' | 'existing' }> =>
        claim.kind === 'claimed' || claim.kind === 'existing',
      )
      .map((claim) => claim.permit);
    expect(permits).toHaveLength(12);
    expect(new Set(permits.map((permit) => permit.runId)).size).toBe(1);
    const permit = permits[0];
    if (!permit) throw new Error('Expected an authorized collection permit');

    await prisma.sourcingSourceEntitlementVersion.updateMany({
      where: {
        organizationId: TEST_ORGANIZATION_ID,
        sourceKey: '1688.hot_product',
        scopeKey: 'default',
        isCurrent: true,
      },
      data: { killSwitch: true },
    });
    await expect(
      collectionRepository.commit({
        permit,
        output: {
          observations: [],
          typedRecords: [],
          discoveredCount: 0,
          rejectedCount: 0,
          qualityReport: {},
        },
      }),
    ).resolves.toEqual({ kind: 'authorization_changed' });
    await expect(
      prisma.sourcingEvidenceObservation.count({
        where: { organizationId: TEST_ORGANIZATION_ID },
      }),
    ).resolves.toBe(0);
  });
});

async function createEntitlement(
  prisma: PrismaClient,
  input: { sourceKey?: string; scopeKey?: string } = {},
) {
  const sourceKey = input.sourceKey ?? '1688';
  const scopeKey = input.scopeKey ?? 'stationery';
  return prisma.sourcingSourceEntitlementVersion.create({
    data: {
      organizationId: TEST_ORGANIZATION_ID,
      sourceKey,
      scopeKey,
      version: 1,
      versionHash: sha256(`${sourceKey}:${scopeKey}:v1`),
      sourceLifecycle: 'qualified',
      decisionImpact: 'enabled',
      ownerLabel: 'KidItem test source',
      legalBasis: 'test fixture',
      allowedMethod: 'test fixture',
      permittedFields: ['offerId'],
      prohibitedUses: [],
      reviewedByUserId: TEST_USER_ID,
      reviewedAt: new Date('2026-08-08T00:00:00.000Z'),
    },
  });
}

function collectionClaim(idempotencyKey: string) {
  return {
    organizationId: TEST_ORGANIZATION_ID,
    sourceKey: '1688.hot_product',
    scopeKey: 'default',
    targetKey: 'children plate',
    idempotencyKey,
    requestHash: sha256('children plate'),
    collectorKey: 'test-collection',
    collectorVersion: 'v1',
    triggerKind: 'manual' as const,
    triggeredByUserId: TEST_USER_ID,
    leaseDurationMs: 60_000,
  };
}

function runData(sourceEntitlementVersionId: string, runKey: string) {
  const now = new Date('2026-08-08T00:00:00.000Z');
  return {
    organizationId: TEST_ORGANIZATION_ID,
    sourceEntitlementVersionId,
    sourceKey: '1688',
    scopeKey: 'stationery',
    leaseToken: randomUUID(),
    leaseExpiresAt: new Date('2026-08-08T00:05:00.000Z'),
    authorizationCheckedAt: now,
    entitlementVersionHash: sha256('1688:stationery:v1'),
    targetKey: 'stationery',
    idempotencyKey: runKey,
    requestHash: sha256(runKey),
    collectorKey: '1688-test',
    collectorVersion: 'test-v1',
    triggerKind: 'test',
    status: 'collecting',
    startedAt: now,
  };
}

function observationCommand(
  ingestionRunId: string,
  sourceEntitlementVersionId: string,
) {
  const capturedAt = new Date('2026-08-08T00:00:00.000Z');
  return {
    organizationId: TEST_ORGANIZATION_ID,
    ingestionRunId,
    sourceEntitlementVersionId,
    sourceKey: '1688',
    platform: '1688',
    evidenceFamily: 'china_supply',
    signalRole: 'supply' as const,
    granularity: 'supply_catalog' as const,
    conceptKey: 'pencil-case',
    sourceEntityType: 'offer',
    sourceEntityId: 'offer-1',
    schemaVersion: '1688-offer/v1',
    observationKey: sha256('offer-1:1'),
    revision: 1,
    supportsCandidate: true,
    decisionImpactAtIngest: 'enabled' as const,
    sourceUrl: 'https://detail.1688.com/offer/1.html',
    eventAt: capturedAt,
    observedAt: capturedAt,
    availableAt: capturedAt,
    revisionAt: null,
    payloadHash: sha256('pencil-case'),
    rawPayload: { title: '연필통' },
    ingestedAt: capturedAt,
  };
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
